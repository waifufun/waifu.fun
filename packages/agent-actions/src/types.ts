import type { Address, Hash, Hex } from "viem";

/**
 * A capability that an adapter requires to operate.
 * Later enforced via Zodiac Roles on the agent Safe.
 */
export interface AdapterPermission {
	/** Human-readable label shown in policy editor. */
	label: string;
	/** Target contract on the chain. */
	target: Address;
	/** Function selectors allowed (e.g. 0xa9059cbb for transfer). */
	selectors: Hex[];
	/** Optional per-tx value cap in wei. */
	maxValuePerTx?: bigint;
	/** Optional per-day aggregate cap. */
	maxValuePerDay?: bigint;
}

/**
 * Typed description of a single adapter action. Used for:
 *  - generating role templates
 *  - registering in the action log schema
 *  - building the UI permission editor
 */
export interface AdapterAction<Name extends string = string, Input = unknown, Output = unknown> {
	name: Name;
	label: string;
	description: string;
	permissions: AdapterPermission[];
	/** Rough cost hint in basis points of tx value for fees, plus gas estimate in wei. */
	cost: {
		feeBps?: number;
		gasEstimate: bigint;
	};
	/** Runtime-only: type markers for TS inference. No runtime shape required. */
	_phantomInput?: Input;
	_phantomOutput?: Output;
}

export interface AdapterSpec<Actions extends Record<string, AdapterAction> = Record<string, AdapterAction>> {
	/** Stable slug used in DB + role templates. e.g. "pancakeswap-v3". */
	slug: string;
	/** Human name, e.g. "PancakeSwap v3". */
	name: string;
	/** Chains the adapter supports. */
	chains: readonly number[];
	/** Risk tier, affects default-enabled logic. */
	tier: "default" | "opt-in";
	/** Actions keyed by name. */
	actions: Actions;
	/** Contracts the adapter interacts with, for Zodiac scoping. */
	contracts: Record<string, Address>;
}

/** Context passed to every action call. */
export interface AdapterCallContext {
	agentId: string;
	chainId: number;
	signerAddress: Address;
	/** Function pointer that submits a tx via Steward signer. */
	signAndSend: (tx: { to: Address; data: Hex; value?: bigint }) => Promise<{ hash: Hash }>;
	/** Optional — for reads that want a public client. */
	publicClient: unknown; // typed as PublicClient in real usage; avoid cross-package viem type leak
	/** Pause + kill checks delegated to the caller; the adapter just assumes OK. */
}

/** The call signature for an adapter action runtime. */
export type AdapterCall<Input = unknown, Output = unknown> = (ctx: AdapterCallContext, input: Input) => Promise<Output>;

/** An adapter's full runtime implementation. */
export interface AdapterImpl<Spec extends AdapterSpec = AdapterSpec> {
	spec: Spec;
	calls: {
		[K in keyof Spec["actions"]]: AdapterCall;
	};
}
