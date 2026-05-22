import {
	type Address,
	type Hash,
	type WalletClient,
	encodeAbiParameters,
	getAddress,
	isAddressEqual,
	zeroAddress,
	zeroHash,
} from "viem";

import { portalAbi } from "./abi/portal.js";
import { vaultPortalAbi } from "./abi/vault-portal.js";
import { getFlapPortalAddress, getFlapSplitVaultFactoryAddress, getFlapVaultPortalAddress } from "./client.js";
import { FLAP_DEFAULT_DEX_THRESH_TYPE, FLAP_DEFAULT_QUOTE_TOKEN, resolveFlapNetwork } from "./constants.js";
import {
	type BuildFlapNewTokenV5ParamsInput,
	type BuildFlapNewTokenV6WithVaultParamsInput,
	FLAP_DEX_IDS,
	FLAP_MIGRATOR_TYPES,
	FLAP_TOKEN_VERSIONS,
	FLAP_V3_LP_FEE_PROFILES,
	type FlapNewTokenV5Params,
	type FlapNewTokenV6WithVaultParams,
	type SplitVaultRecipient,
} from "./types.js";

const assertBps = (label: string, value: number) => {
	if (!Number.isInteger(value) || value < 0 || value > 10_000) {
		throw new Error(`${label} must be an integer between 0 and 10000`);
	}
};

const assertUint16 = (label: string, value: number) => {
	if (!Number.isInteger(value) || value < 0 || value > 65_535) {
		throw new Error(`${label} must be an integer between 0 and 65535`);
	}
};

const assertBigInt = (label: string, value: bigint) => {
	if (value < 0n) {
		throw new Error(`${label} must be >= 0`);
	}
};

const validateSplitVaultRecipients = (recipients: readonly SplitVaultRecipient[]) => {
	if (recipients.length < 1 || recipients.length > 10) {
		throw new Error("Split Vault recipients must include 1 to 10 entries");
	}
	const seen = new Set<string>();
	let total = 0;
	for (const entry of recipients) {
		if (!entry.recipient || isAddressEqual(entry.recipient, zeroAddress)) {
			throw new Error("Split Vault recipient must be a non-zero address");
		}
		assertBps("Split Vault recipient bps", entry.bps);
		const normalized = getAddress(entry.recipient).toLowerCase();
		if (seen.has(normalized)) {
			throw new Error("Split Vault recipients must be unique");
		}
		seen.add(normalized);
		total += entry.bps;
	}
	if (total !== 10_000) {
		throw new Error(`Split Vault recipient bps must sum to 10000, got ${total}`);
	}
};

export const buildSplitVaultData = (recipients: readonly SplitVaultRecipient[]) => {
	validateSplitVaultRecipients(recipients);
	return encodeAbiParameters(
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
		[recipients.map((entry) => ({ recipient: getAddress(entry.recipient), bps: entry.bps }))],
	);
};

export const buildNewTokenV6WithVaultParams = (
	input: BuildFlapNewTokenV6WithVaultParamsInput,
): FlapNewTokenV6WithVaultParams => {
	const buyTaxRate = input.buyTaxRate ?? 0;
	const sellTaxRate = input.sellTaxRate ?? 0;
	const mktBps = input.mktBps ?? 0;
	const deflationBps = input.deflationBps ?? 0;
	const dividendBps = input.dividendBps ?? 0;
	const lpBps = input.lpBps ?? 0;
	const taxDuration = input.taxDuration ?? 0n;
	const antiFarmerDuration = input.antiFarmerDuration ?? 0n;
	const minimumShareBalance = input.minimumShareBalance ?? 0n;
	const totalTaxSplit = mktBps + deflationBps + dividendBps + lpBps;

	assertBps("buyTaxRate", buyTaxRate);
	assertBps("sellTaxRate", sellTaxRate);
	assertBps("mktBps", mktBps);
	assertBps("deflationBps", deflationBps);
	assertBps("dividendBps", dividendBps);
	assertBps("lpBps", lpBps);
	assertBigInt("taxDuration", taxDuration);
	assertBigInt("antiFarmerDuration", antiFarmerDuration);
	assertBigInt("minimumShareBalance", minimumShareBalance);
	if (buyTaxRate + sellTaxRate <= 0) {
		throw new Error("Tax Token V3 requires buyTaxRate + sellTaxRate to be greater than 0");
	}
	if (totalTaxSplit > 10_000) {
		throw new Error("tax allocation bps cannot exceed 10000 in total");
	}

	return {
		name: input.name,
		symbol: input.symbol,
		meta: input.meta,
		dexThresh: input.dexThresh ?? FLAP_DEFAULT_DEX_THRESH_TYPE,
		salt: input.salt,
		migratorType: input.migratorType ?? FLAP_MIGRATOR_TYPES.V2_MIGRATOR,
		quoteToken: input.quoteToken ?? FLAP_DEFAULT_QUOTE_TOKEN,
		quoteAmt: input.quoteAmt ?? 0n,
		permitData: input.permitData ?? "0x",
		extensionID: input.extensionID ?? zeroHash,
		extensionData: input.extensionData ?? "0x",
		dexId: input.dexId ?? FLAP_DEX_IDS.DEX0,
		lpFeeProfile: input.lpFeeProfile ?? FLAP_V3_LP_FEE_PROFILES.STANDARD,
		buyTaxRate,
		sellTaxRate,
		taxDuration,
		antiFarmerDuration,
		mktBps,
		deflationBps,
		dividendBps,
		lpBps,
		minimumShareBalance,
		dividendToken: input.dividendToken ?? FLAP_DEFAULT_QUOTE_TOKEN,
		commissionReceiver: input.commissionReceiver ?? zeroAddress,
		tokenVersion: input.tokenVersion ?? FLAP_TOKEN_VERSIONS.TOKEN_TAXED_V3,
		vaultFactory: input.vaultFactory,
		vaultData: input.vaultData,
	};
};

export const buildNewTokenV5Params = (input: BuildFlapNewTokenV5ParamsInput): FlapNewTokenV5Params => {
	const taxRate = input.taxRate ?? 0;
	const mktBps = input.mktBps ?? 0;
	const deflationBps = input.deflationBps ?? 0;
	const dividendBps = input.dividendBps ?? 0;
	const lpBps = input.lpBps ?? 0;
	const taxDuration = input.taxDuration ?? 0n;
	const antiFarmerDuration = input.antiFarmerDuration ?? 0n;
	const minimumShareBalance = input.minimumShareBalance ?? 0n;
	const totalTaxSplit = mktBps + deflationBps + dividendBps + lpBps;

	assertBps("taxRate", taxRate);
	assertBps("mktBps", mktBps);
	assertBps("deflationBps", deflationBps);
	assertBps("dividendBps", dividendBps);
	assertBps("lpBps", lpBps);
	assertBigInt("taxDuration", taxDuration);
	assertBigInt("antiFarmerDuration", antiFarmerDuration);
	assertBigInt("minimumShareBalance", minimumShareBalance);

	if (taxRate > 0 && totalTaxSplit > 10_000) {
		throw new Error("tax allocation bps cannot exceed 10000 in total");
	}

	return {
		name: input.name,
		symbol: input.symbol,
		meta: input.meta,
		dexThresh: input.dexThresh ?? FLAP_DEFAULT_DEX_THRESH_TYPE,
		salt: input.salt,
		taxRate,
		migratorType:
			input.migratorType ?? (taxRate > 0 ? FLAP_MIGRATOR_TYPES.V2_MIGRATOR : FLAP_MIGRATOR_TYPES.V3_MIGRATOR),
		quoteToken: input.quoteToken ?? FLAP_DEFAULT_QUOTE_TOKEN,
		quoteAmt: input.quoteAmt ?? 0n,
		beneficiary: input.beneficiary,
		permitData: input.permitData ?? "0x",
		extensionID: input.extensionID ?? zeroHash,
		extensionData: input.extensionData ?? "0x",
		dexId: input.dexId ?? FLAP_DEX_IDS.DEX0,
		lpFeeProfile: input.lpFeeProfile ?? FLAP_V3_LP_FEE_PROFILES.STANDARD,
		taxDuration,
		antiFarmerDuration,
		mktBps,
		deflationBps,
		dividendBps,
		lpBps,
		minimumShareBalance,
	};
};

export const buildNewTokenV5Write = (input: {
	params: FlapNewTokenV5Params;
	value?: bigint;
	chainId?: number;
	network?: string;
	portalAddress?: Address;
}) => {
	const network = resolveFlapNetwork({
		chainId: input.chainId,
		network: input.network as "bsc" | "bscTestnet" | undefined,
	});

	return {
		abi: portalAbi,
		address: input.portalAddress ?? getFlapPortalAddress({ network: network.key }),
		functionName: "newTokenV5",
		args: [input.params],
		value: input.value ?? (input.params.quoteToken === zeroAddress ? input.params.quoteAmt : 0n),
		chain: network.chain,
	} as const;
};

export const buildNewTokenV6WithVaultWrite = (input: {
	params: FlapNewTokenV6WithVaultParams;
	value?: bigint;
	chainId?: number;
	network?: string;
	vaultPortalAddress?: Address;
}) => {
	const network = resolveFlapNetwork({
		chainId: input.chainId,
		network: input.network as "bsc" | "bscTestnet" | undefined,
	});

	return {
		abi: vaultPortalAbi,
		address: input.vaultPortalAddress ?? getFlapVaultPortalAddress({ network: network.key }),
		functionName: "newTokenV6WithVault",
		args: [input.params],
		value: input.value ?? (input.params.quoteToken === zeroAddress ? input.params.quoteAmt : 0n),
		chain: network.chain,
	} as const;
};

export const getDefaultSplitVaultFactoryAddress = (input: { chainId?: number; network?: string } = {}) => {
	const network = resolveFlapNetwork({
		chainId: input.chainId,
		network: input.network as "bsc" | "bscTestnet" | undefined,
	});
	return getFlapSplitVaultFactoryAddress({ network: network.key });
};

export const launchTokenV5 = async (
	walletClient: WalletClient,
	input: {
		account: Address;
		params: FlapNewTokenV5Params;
		value?: bigint;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
	},
): Promise<Hash> => {
	const request = buildNewTokenV5Write(input);

	return walletClient.writeContract({
		account: input.account,
		...request,
	});
};
