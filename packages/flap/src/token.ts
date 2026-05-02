import type { Address, PublicClient } from "viem";

import { getPortalContractConfig } from "./client.js";
import {
	FLAP_DEX_ID_LABELS,
	FLAP_STATUS_LABELS,
	FLAP_TOKEN_VERSION_LABELS,
	FLAP_V3_LP_FEE_PROFILE_LABELS,
} from "./constants.js";
import type { FlapTokenStateV7, FlapTokenStateV7Raw } from "./types.js";

type TokenStateTupleLike = {
	status?: number;
	reserve?: bigint;
	circulatingSupply?: bigint;
	price?: bigint;
	tokenVersion?: number;
	r?: bigint;
	h?: bigint;
	k?: bigint;
	dexSupplyThresh?: bigint;
	quoteTokenAddress?: Address;
	nativeToQuoteSwapEnabled?: boolean;
	extensionID?: `0x${string}`;
	taxRate?: bigint;
	pool?: Address;
	progress?: bigint;
	lpFeeProfile?: number;
	dexId?: number;
	[index: number]: unknown;
};

const getTupleValue = <T>(state: TokenStateTupleLike, key: keyof TokenStateTupleLike, index: number): T =>
	(state[key] ?? state[index]) as T;

export const normalizeTokenStateV7 = (state: TokenStateTupleLike): FlapTokenStateV7 => {
	const raw: FlapTokenStateV7Raw = {
		status: getTupleValue(state, "status", 0),
		reserve: getTupleValue(state, "reserve", 1),
		circulatingSupply: getTupleValue(state, "circulatingSupply", 2),
		price: getTupleValue(state, "price", 3),
		tokenVersion: getTupleValue(state, "tokenVersion", 4),
		r: getTupleValue(state, "r", 5),
		h: getTupleValue(state, "h", 6),
		k: getTupleValue(state, "k", 7),
		dexSupplyThresh: getTupleValue(state, "dexSupplyThresh", 8),
		quoteTokenAddress: getTupleValue(state, "quoteTokenAddress", 9),
		nativeToQuoteSwapEnabled: getTupleValue(state, "nativeToQuoteSwapEnabled", 10),
		extensionID: getTupleValue(state, "extensionID", 11),
		taxRate: getTupleValue(state, "taxRate", 12),
		pool: getTupleValue(state, "pool", 13),
		progress: getTupleValue(state, "progress", 14),
		lpFeeProfile: getTupleValue(state, "lpFeeProfile", 15),
		dexId: getTupleValue(state, "dexId", 16),
	};

	return {
		...raw,
		statusLabel: FLAP_STATUS_LABELS[raw.status] ?? `UNKNOWN_${raw.status}`,
		tokenVersionLabel: FLAP_TOKEN_VERSION_LABELS[raw.tokenVersion] ?? `UNKNOWN_${raw.tokenVersion}`,
		lpFeeProfileLabel: FLAP_V3_LP_FEE_PROFILE_LABELS[raw.lpFeeProfile] ?? `UNKNOWN_${raw.lpFeeProfile}`,
		dexIdLabel: FLAP_DEX_ID_LABELS[raw.dexId] ?? `UNKNOWN_${raw.dexId}`,
	};
};

export const getTokenV7 = async (
	publicClient: PublicClient,
	input: {
		token: Address;
		chainId?: number;
		network?: string;
		portalAddress?: Address;
	},
): Promise<FlapTokenStateV7> => {
	const contract = getPortalContractConfig({
		chainId: input.chainId as 56 | 97 | undefined,
		network: input.network as "bsc" | "bscTestnet" | undefined,
		address: input.portalAddress,
	});

	const state = await publicClient.readContract({
		...contract,
		functionName: "getTokenV7",
		args: [input.token],
	});

	return normalizeTokenStateV7(state as TokenStateTupleLike);
};
