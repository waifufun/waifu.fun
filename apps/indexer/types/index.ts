import type { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import type { LaunchData, SwapData, CurveCompleteData } from "./events";

export type EventData =
	| { event: "launch"; data: LaunchData }
	| { event: "swap"; data: SwapData }
	| { event: "curveComplete"; data: CurveCompleteData };

export interface RpcRequest {
	jsonrpc: string;
	id: number;
	method: string;
	// biome-ignore lint/suspicious/noExplicitAny: allow
	params?: any[];
}

export interface RpcResponse<T> {
	jsonrpc: string;
	id: number;
	result?: T;
	error?: { code: number; message: string };
}

export interface IndexerConfig {
	concurrencyLimit?: number;
	debugStatements?: boolean;
	minBlock?: number; // Minimum block to sync from (genesis point)
}

export interface SolanaIndexerConfig extends IndexerConfig {
	networkId: SolanaNetworkIds;
	autoFunAddress: SolanaAddressLike;
	autoFunAddressLegacy: SolanaAddressLike;
	maxSignatures?: number;
	beforeSignature?: string;
}

export interface ProcessingStats {
	processedSignatures: number;
	events: number;
	startTime: number;
}

export interface DecodedInstruction {
	type: "launch" | "swap" | "launchAndSwap" | "withdraw" | "unknown";
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	data?: any;
	mintAddress?: string;
	tokenMint?: string;
	creator?: string;
	user?: string;
	admin?: string;
	bondingCurve?: string;
	globalVault?: string;
	accounts: string[];
	discriminator?: number[];
}
