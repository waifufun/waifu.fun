import assert from "node:assert/strict";
import test from "node:test";

import { portalAbi, vaultPortalAbi } from "@waifufun/flap";
import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, getAddress, toEventHash } from "viem";

import {
	DEFAULT_PLATFORM_CUT_BPS,
	FlapAdapterError,
	createFlapAdapter,
	flapAdapter,
	toFlapNewTokenV5TaxParams,
} from "../src/index.js";
import type { CreateTokenParams, FlapFeeConfig } from "../src/types.js";

const SAFE = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";
const PORTAL = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const CURVE = "0x5555555555555555555555555555555555555555";
const PLATFORM = "0x6666666666666666666666666666666666666666";

const validConfig = (overrides: Partial<FlapFeeConfig> = {}): FlapFeeConfig => ({
	kind: "flap",
	taxBps: 300,
	platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
	recipient: "agent-treasury",
	...overrides,
});

const createParams = (overrides: Partial<CreateTokenParams> = {}): CreateTokenParams => ({
	name: "Waifu Agent",
	ticker: "WAIFU",
	description: "agent token",
	logoUrl: "https://example.com/logo.png",
	feeConfig: validConfig(),
	founderAddress: SAFE,
	...overrides,
});

test("flap exposes a prod-valid default config", () => {
	const config = flapAdapter.getDefaultFeeConfig();
	assert.equal(config.kind, "flap");
	assert.equal(config.taxBps, 300);
	assert.equal(config.platformCutBps, DEFAULT_PLATFORM_CUT_BPS);
	assert.equal(config.recipient, "agent-treasury");
	assert.deepEqual(flapAdapter.validateFeeConfig(config, "prod"), { ok: true, errors: [] });
});

test("flap validates tax tiers, platform cut bounds, and custom vault address", () => {
	const taxResult = flapAdapter.validateFeeConfig(validConfig({ taxBps: 200 as FlapFeeConfig["taxBps"] }), "prod");
	assert.equal(taxResult.ok, false);
	assert.match(taxResult.errors.join("\n"), /taxBps must be one of 100, 300, 500, 1000/);

	const cutResult = flapAdapter.validateFeeConfig(validConfig({ platformCutBps: 6000 }), "prod");
	assert.equal(cutResult.ok, false);
	assert.match(cutResult.errors.join("\n"), /platformCutBps must be at most 5000/);

	const vaultResult = flapAdapter.validateFeeConfig(
		validConfig({ recipient: "custom-vault", customVaultAddress: "not-an-address" }),
		"prod",
	);
	assert.equal(vaultResult.ok, false);
	assert.match(vaultResult.errors.join("\n"), /customVaultAddress must be an EVM address/);
});

test("flap maps option-3 tax model to current Flap marketing-tax beneficiary boundary", () => {
	assert.deepEqual(toFlapNewTokenV5TaxParams(validConfig({ taxBps: 1000 })), {
		taxRate: 1000,
		mktBps: 10_000,
		deflationBps: 0,
		dividendBps: 0,
		lpBps: 0,
	});
});

test("flap builds a legacy newTokenV5 unsigned transaction for custom vaults", async () => {
	const adapter = createFlapAdapter({ portalAddress: PORTAL, chainId: 56 });
	const tx = await adapter.buildCreateTokenTx({
		...createParams({
			feeConfig: validConfig({ recipient: "custom-vault", customVaultAddress: VAULT }),
			initialBuyWei: 123n,
		}),
		flapMetadataCid: "bafybeigdyrzt",
		flapSalt: "0x0000000000000000000000000000000000000000000000000000000000000007",
	} as CreateTokenParams);

	assert.equal(tx.to, getAddress(PORTAL));
	assert.equal(tx.chainId, 56);
	assert.equal(tx.value, 123n);

	const decoded = decodeFunctionData({ abi: portalAbi, data: tx.data });
	assert.equal(decoded.functionName, "newTokenV5");
	const [params] = decoded.args as [
		{
			name: string;
			symbol: string;
			meta: string;
			salt: string;
			beneficiary: string;
			quoteAmt: bigint;
			taxRate: number;
			mktBps: number;
		},
	];
	assert.equal(params.name, "Waifu Agent");
	assert.equal(params.symbol, "WAIFU");
	assert.match(params.meta, /bafybeigdyrzt/);
	assert.equal(params.salt, "0x0000000000000000000000000000000000000000000000000000000000000007");
	assert.equal(params.beneficiary, getAddress(VAULT));
	assert.equal(params.quoteAmt, 123n);
	assert.equal(params.taxRate, 300);
	assert.equal(params.mktBps, 10_000);
});

test("flap builds a VaultPortal newTokenV6WithVault unsigned transaction for agent treasury", async () => {
	const adapter = createFlapAdapter({
		vaultPortalAddress: PORTAL,
		splitVaultFactoryAddress: VAULT,
		platformWalletAddress: PLATFORM,
		chainId: 56,
	});
	const tx = await adapter.buildCreateTokenTx({
		...createParams({ initialBuyWei: 123n }),
		flapMetadataCid: "bafybeigdyrzt",
		flapSalt: "0x0000000000000000000000000000000000000000000000000000000000000007",
	} as CreateTokenParams);

	assert.equal(tx.to, getAddress(PORTAL));
	assert.equal(tx.chainId, 56);
	assert.equal(tx.value, 123n);

	const decoded = decodeFunctionData({ abi: vaultPortalAbi, data: tx.data });
	assert.equal(decoded.functionName, "newTokenV6WithVault");
	const [params] = decoded.args as [
		{
			name: string;
			symbol: string;
			buyTaxRate: number;
			sellTaxRate: number;
			mktBps: number;
			vaultFactory: string;
			vaultData: `0x${string}`;
		},
	];
	assert.equal(params.name, "Waifu Agent");
	assert.equal(params.symbol, "WAIFU");
	assert.equal(params.buyTaxRate, 300);
	assert.equal(params.sellTaxRate, 300);
	assert.equal(params.mktBps, 10_000);
	assert.equal(params.vaultFactory, getAddress(VAULT));
	const [recipients] = decodeAbiParameters(
		[
			{
				name: "recipients",
				type: "tuple[]",
				components: [
					{ name: "recipient", type: "address" },
					{ name: "bps", type: "uint16" },
				],
			},
		],
		params.vaultData,
	) as [readonly { recipient: string; bps: number }[]];
	assert.deepEqual(recipients, [
		{ recipient: getAddress(PLATFORM), bps: DEFAULT_PLATFORM_CUT_BPS },
		{ recipient: getAddress(SAFE), bps: 10_000 - DEFAULT_PLATFORM_CUT_BPS },
	]);
});

test("flap parses token and curve addresses from portal receipt events", () => {
	const tokenCreated = {
		topics: [toEventHash("TokenCreated(uint256,address,uint256,address,string,string,string)")],
		data: encodeAbiParameters(
			[
				{ name: "ts", type: "uint256" },
				{ name: "creator", type: "address" },
				{ name: "nonce", type: "uint256" },
				{ name: "token", type: "address" },
				{ name: "name", type: "string" },
				{ name: "symbol", type: "string" },
				{ name: "meta", type: "string" },
			],
			[1n, SAFE, 1n, TOKEN, "Waifu Agent", "WAIFU", "ipfs://meta"],
		),
	};
	const curveSet = {
		topics: [toEventHash("TokenCurveSet(address,address,uint256)")],
		data: encodeAbiParameters(
			[
				{ name: "token", type: "address" },
				{ name: "curve", type: "address" },
				{ name: "curveParameter", type: "uint256" },
			],
			[TOKEN, CURVE, 0n],
		),
	};

	assert.deepEqual(
		flapAdapter.parseCreateTokenReceipt({
			logs: [
				{ ...tokenCreated, address: PORTAL },
				{ ...curveSet, address: PORTAL },
			],
		}),
		{ tokenAddress: getAddress(TOKEN), curveAddress: getAddress(CURVE) },
	);
});

test("flap parses token and vault addresses from VaultPortal receipt events", () => {
	const receiptEvent = {
		topics: [
			toEventHash("FlapTaxVaultTokenCreated(address,address,address)"),
			`0x000000000000000000000000${TOKEN.slice(2)}`,
			`0x000000000000000000000000${VAULT.slice(2)}`,
			`0x000000000000000000000000${PORTAL.slice(2)}`,
		],
		data: "0x",
	};

	assert.deepEqual(flapAdapter.parseCreateTokenReceipt({ logs: [{ ...receiptEvent, address: PORTAL }] }), {
		tokenAddress: getAddress(TOKEN),
		curveAddress: getAddress(TOKEN),
		vaultAddress: getAddress(VAULT),
		vaultFactory: getAddress(PORTAL),
	});
});

test("flap read methods fail explicitly when no public client is configured", async () => {
	await assert.rejects(
		() => flapAdapter.getCurveProgress(TOKEN),
		(error) => error instanceof FlapAdapterError && error.code === "FlapNotConfigured",
	);
	await assert.rejects(
		() => flapAdapter.getTreasuryAddress(TOKEN),
		(error) => error instanceof FlapAdapterError && error.code === "FlapUnsupported",
	);
});
