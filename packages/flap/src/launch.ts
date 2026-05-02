import { type Address, type Hash, type WalletClient, zeroHash } from "viem";

import { portalAbi } from "./abi/portal.js";
import { getFlapPortalAddress } from "./client.js";
import { FLAP_DEFAULT_DEX_THRESH_TYPE, FLAP_DEFAULT_QUOTE_TOKEN, resolveFlapNetwork } from "./constants.js";
import {
	type BuildFlapNewTokenV5ParamsInput,
	FLAP_DEX_IDS,
	FLAP_MIGRATOR_TYPES,
	FLAP_V3_LP_FEE_PROFILES,
	type FlapNewTokenV5Params,
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
		value: input.value ?? 0n,
		chain: network.chain,
	} as const;
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
