import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type { Address } from "../lib/address.js";
import type { IndexerRuntime } from "../lib/runtime.js";

/**
 * Returns true if the given wallet address has been provisioned as an agent
 * wallet in our DB (i.e. a waifu.fun creator). Case-insensitive match.
 */
export async function isKnownAgentWallet(runtime: IndexerRuntime, walletAddress: Address): Promise<boolean> {
	const rows = await runtime.db
		.select({ id: schema.agentWallets.id })
		.from(schema.agentWallets)
		.where(sql`lower(${schema.agentWallets.walletAddress}) = lower(${walletAddress})`)
		.limit(1);
	return rows.length > 0;
}

/**
 * Returns true if the given token address is tracked in our curve_state
 * table — meaning we've already accepted it as a waifu.fun agent token.
 * Used by purchase/sale handlers to skip trades on other four.meme tokens.
 */
export async function isTrackedAgentToken(runtime: IndexerRuntime, tokenAddress: Address): Promise<boolean> {
	const rows = await runtime.db
		.select({ agentToken: schema.curveState.agentToken })
		.from(schema.curveState)
		.where(sql`lower(${schema.curveState.agentToken}) = lower(${tokenAddress})`)
		.limit(1);
	return rows.length > 0;
}

/**
 * Best-effort lookup of the internal agent slug for a given token address.
 * Returns null if no agent_wallets row binds the token yet (e.g. during the
 * TokenCreate race window). Callers should treat this as optional context
 * and never fail on a null.
 */
export async function lookupAgentIdByToken(runtime: IndexerRuntime, tokenAddress: Address): Promise<string | null> {
	const rows = await runtime.db
		.select({ internalAgentId: schema.agentWallets.internalAgentId })
		.from(schema.agentWallets)
		.where(sql`lower(${schema.agentWallets.agentToken}) = lower(${tokenAddress})`)
		.limit(1);
	return rows[0]?.internalAgentId ?? null;
}

/**
 * Best-effort lookup of the internal agent slug for a given creator wallet.
 * Used by TokenCreate where we know the creator before the token → agent
 * binding has been persisted.
 */
export async function lookupAgentIdByWallet(runtime: IndexerRuntime, walletAddress: Address): Promise<string | null> {
	const rows = await runtime.db
		.select({ internalAgentId: schema.agentWallets.internalAgentId })
		.from(schema.agentWallets)
		.where(sql`lower(${schema.agentWallets.walletAddress}) = lower(${walletAddress})`)
		.limit(1);
	return rows[0]?.internalAgentId ?? null;
}

/**
 * Four.meme `template` is a uint256 bitfield. Bit 85 is the "aiCreator"
 * flag (set when the token was launched by a wallet registered in
 * AgentIdentifier). We aren't emitted `template` in the current TokenCreate
 * event (per the lite ABI), so this helper is reserved for when we pull
 * state via TokenManager2 view calls (`_tokenInfos(address)`).
 */
export function hasAiCreatorFlag(template: bigint): boolean {
	return (template & (1n << 85n)) !== 0n;
}

/**
 * Writes (or updates) the agent_wallets row for a newly observed token.
 * Matches the wallet record by creator address. If no row exists yet, we
 * still insert one — this covers the case of a creator launching without
 * pre-provisioning (rare but possible via direct four.meme API flow while
 * also holding an agent NFT).
 */
export async function upsertAgentWalletToken(
	runtime: IndexerRuntime,
	walletAddress: Address,
	tokenAddress: Address,
	blockTimestamp: Date,
): Promise<void> {
	const existing = await runtime.db
		.select({ id: schema.agentWallets.id })
		.from(schema.agentWallets)
		.where(sql`lower(${schema.agentWallets.walletAddress}) = lower(${walletAddress})`)
		.limit(1);

	if (existing.length > 0) {
		await runtime.db
			.update(schema.agentWallets)
			.set({ agentToken: tokenAddress, updatedAt: blockTimestamp })
			.where(eq(schema.agentWallets.id, existing[0]!.id));
		return;
	}

	await runtime.db
		.insert(schema.agentWallets)
		.values({
			agentToken: tokenAddress,
			walletAddress,
			createdAt: blockTimestamp,
			updatedAt: blockTimestamp,
		})
		.onConflictDoNothing();
}
