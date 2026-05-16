import assert from "node:assert/strict";
import test from "node:test";

import { decodeAbiParameters, encodeEventTopics, getAddress } from "viem";

import {
	FLAP_TOKEN_VERSIONS,
	buildNewTokenV5Params,
	buildNewTokenV5Write,
	buildNewTokenV6WithVaultParams,
	buildNewTokenV6WithVaultWrite,
	buildSplitVaultData,
	getFlapTokenImplementationAddress,
	parseVaultPortalReceiptEvents,
} from "../src/index.js";

const PLATFORM = "0x1111111111111111111111111111111111111111";
const TREASURY = "0x2222222222222222222222222222222222222222";
const FACTORY = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const VAULT = "0x5555555555555555555555555555555555555555";

const recipientsAbi = [
	{
		name: "recipients",
		type: "tuple[]",
		components: [
			{ name: "recipient", type: "address" },
			{ name: "bps", type: "uint16" },
		],
	},
] as const;

test("buildSplitVaultData encodes recipients", () => {
	const data = buildSplitVaultData([
		{ recipient: PLATFORM, bps: 1000 },
		{ recipient: TREASURY, bps: 9000 },
	]);
	const [decoded] = decodeAbiParameters(recipientsAbi, data);
	assert.deepEqual(decoded, [
		{ recipient: getAddress(PLATFORM), bps: 1000 },
		{ recipient: getAddress(TREASURY), bps: 9000 },
	]);
});

test("buildSplitVaultData validates recipients", () => {
	assert.throws(() => buildSplitVaultData([]), /1 to 10/);
	assert.throws(() => buildSplitVaultData([{ recipient: PLATFORM, bps: 5000 }]), /sum to 10000/);
	assert.throws(
		() =>
			buildSplitVaultData([
				{ recipient: PLATFORM, bps: 5000 },
				{ recipient: PLATFORM, bps: 5000 },
			]),
		/unique/,
	);
});

test("buildNewTokenV6WithVaultParams maps Tax Token V3", () => {
	const vaultData = buildSplitVaultData([
		{ recipient: PLATFORM, bps: 1000 },
		{ recipient: TREASURY, bps: 9000 },
	]);
	const params = buildNewTokenV6WithVaultParams({
		name: "Waifu Agent",
		symbol: "WAIFU",
		meta: "ipfs://meta",
		salt: "0x0000000000000000000000000000000000000000000000000000000000000007",
		vaultFactory: FACTORY,
		vaultData,
		buyTaxRate: 300,
		sellTaxRate: 300,
		mktBps: 10_000,
	});
	assert.equal(params.buyTaxRate, 300);
	assert.equal(params.sellTaxRate, 300);
	assert.equal(params.tokenVersion, FLAP_TOKEN_VERSIONS.TOKEN_TAXED_V3);
	assert.equal(params.vaultFactory, FACTORY);
	assert.equal(params.vaultData, vaultData);
});

test("native quote writes default value to quoteAmt", () => {
	const salt = "0x0000000000000000000000000000000000000000000000000000000000000007";
	const v5 = buildNewTokenV5Params({
		name: "Waifu Agent",
		symbol: "WAIFU",
		meta: "ipfs://meta",
		salt,
		beneficiary: TREASURY,
		quoteAmt: 123n,
	});
	assert.equal(buildNewTokenV5Write({ params: v5, network: "bsc" }).value, 123n);

	const v6 = buildNewTokenV6WithVaultParams({
		name: "Waifu Agent",
		symbol: "WAIFU",
		meta: "ipfs://meta",
		salt,
		vaultFactory: FACTORY,
		vaultData: "0x",
		quoteAmt: 456n,
		buyTaxRate: 100,
		sellTaxRate: 100,
	});
	assert.equal(buildNewTokenV6WithVaultWrite({ params: v6, network: "bsc" }).value, 456n);
});

test("getFlapTokenImplementationAddress returns V3 implementation for newTokenV6", () => {
	assert.equal(
		getFlapTokenImplementationAddress({
			taxRate: 500,
			tokenVersion: FLAP_TOKEN_VERSIONS.TOKEN_TAXED_V3,
			network: "bsc",
		}),
		"0x024f18294970B5c76c0691b87f138A0317156422",
	);
});

test("buildNewTokenV6WithVaultParams requires nonzero tax", () => {
	assert.throws(
		() =>
			buildNewTokenV6WithVaultParams({
				name: "Waifu Agent",
				symbol: "WAIFU",
				meta: "ipfs://meta",
				salt: "0x0000000000000000000000000000000000000000000000000000000000000007",
				vaultFactory: FACTORY,
				vaultData: "0x",
				buyTaxRate: 0,
				sellTaxRate: 0,
			}),
		/greater than 0/,
	);
});

test("parseVaultPortalReceiptEvents extracts FlapTaxVaultTokenCreated", () => {
	const topics = encodeEventTopics({
		abi: [
			{
				type: "event",
				name: "FlapTaxVaultTokenCreated",
				inputs: [
					{ name: "token", type: "address", indexed: true },
					{ name: "vault", type: "address", indexed: true },
					{ name: "vaultFactory", type: "address", indexed: true },
				],
			},
		],
		eventName: "FlapTaxVaultTokenCreated",
		args: { token: TOKEN, vault: VAULT, vaultFactory: FACTORY },
	});
	const events = parseVaultPortalReceiptEvents({ logs: [{ topics, data: "0x" }] as never });
	assert.equal(events.length, 1);
	assert.equal(events[0]?.eventName, "FlapTaxVaultTokenCreated");
	assert.deepEqual(events[0]?.args, {
		token: getAddress(TOKEN),
		vault: getAddress(VAULT),
		vaultFactory: getAddress(FACTORY),
	});
});
