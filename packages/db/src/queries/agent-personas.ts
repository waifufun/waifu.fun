import { desc, eq } from "drizzle-orm";

import type { Database } from "../client.js";
import { type AgentPersonaRow, type NewAgentPersona, agentPersonas } from "../schema/agent-personas.js";

export type { AgentPersonaRow, NewAgentPersona };

export type CreateAgentPersonaInput = Omit<NewAgentPersona, "id" | "createdAt" | "updatedAt">;

export async function createAgentPersona(db: Database, data: CreateAgentPersonaInput): Promise<AgentPersonaRow> {
	const [row] = await db.insert(agentPersonas).values(data).returning();
	if (!row) {
		throw new Error("createAgentPersona: insert returned no row");
	}
	return row;
}

export async function getAgentPersonaById(db: Database, id: string): Promise<AgentPersonaRow | null> {
	const [row] = await db.select().from(agentPersonas).where(eq(agentPersonas.id, id)).limit(1);
	return row ?? null;
}

export async function getAgentPersonaByAgentId(db: Database, agentId: string): Promise<AgentPersonaRow | null> {
	const [row] = await db.select().from(agentPersonas).where(eq(agentPersonas.agentId, agentId)).limit(1);
	return row ?? null;
}

export async function getAgentPersonaByTokenAddress(
	db: Database,
	tokenAddress: string,
): Promise<AgentPersonaRow | null> {
	const [row] = await db
		.select()
		.from(agentPersonas)
		.where(eq(agentPersonas.tokenAddress, tokenAddress.toLowerCase()))
		.limit(1);
	return row ?? null;
}

export async function updateAgentPersona(
	db: Database,
	id: string,
	data: Partial<NewAgentPersona>,
): Promise<AgentPersonaRow | null> {
	const [row] = await db
		.update(agentPersonas)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(agentPersonas.id, id))
		.returning();
	return row ?? null;
}

export async function listAgentPersonas(
	db: Database,
	opts: { limit: number; offset: number },
): Promise<AgentPersonaRow[]> {
	return db.select().from(agentPersonas).orderBy(desc(agentPersonas.createdAt)).limit(opts.limit).offset(opts.offset);
}

/**
 * Called by the orchestrator once the Four.Meme TokenCreate event has been
 * observed and we know the ERC20 address. Keyed on `agent_id` because that's
 * what the orchestrator has in scope.
 *
 * Returns the updated row, or `null` if no persona exists for that agentId
 * (shouldn't happen in the happy path — the persona is written before the
 * launch tx — but we don't want to crash the launch if it does).
 */
export async function setTokenAddressOnPersona(
	db: Database,
	agentId: string,
	tokenAddress: string,
): Promise<AgentPersonaRow | null> {
	const [row] = await db
		.update(agentPersonas)
		.set({
			tokenAddress: tokenAddress.toLowerCase(),
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.agentId, agentId))
		.returning();
	return row ?? null;
}

/**
 * Merge EIP-8004 identity details into persona metadata. Does NOT wipe other
 * metadata keys. Called after `registerAgentIdentity` succeeds.
 *
 * Stored under `metadata.identity` so the UI can surface an "EIP-8004 #1247"
 * badge + deep link to the NFT contract.
 */
export async function setPersonaIdentity(
	db: Database,
	agentId: string,
	identity: {
		eip8004TokenId: string;
		contractAddress: string;
		txHash?: string;
		agentURI?: string;
	},
): Promise<AgentPersonaRow | null> {
	const current = await getAgentPersonaByAgentId(db, agentId);
	if (!current) return null;
	const existingMeta =
		current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
			? (current.metadata as Record<string, unknown>)
			: {};
	const mergedMeta = {
		...existingMeta,
		identity: {
			eip8004TokenId: identity.eip8004TokenId,
			contractAddress: identity.contractAddress,
			...(identity.txHash ? { txHash: identity.txHash } : {}),
			...(identity.agentURI ? { agentURI: identity.agentURI } : {}),
		},
	};
	const [row] = await db
		.update(agentPersonas)
		.set({ metadata: mergedMeta, updatedAt: new Date() })
		.where(eq(agentPersonas.agentId, agentId))
		.returning();
	return row ?? null;
}

/**
 * Claim flow queries (migration 0007).
 *
 * Raw claim tokens are never stored. The DB only holds a sha256 of the
 * raw token (in `claim_token_hash`); the raw token is the secret in the
 * claim URL the agent shares with its human. Callers hash incoming tokens
 * before lookup.
 */

export interface ClaimRecord {
	agentId: string;
	name: string;
	bio: string | null;
	avatarUrl: string | null;
	agentLaunchStatus: string | null;
	claimExpiresAt: Date | null;
	claimedByXHandle: string | null;
	claimedByXUserId: string | null;
	claimedAt: Date | null;
	tokenAddress: string | null;
	launchTxHash: string | null;
	prelaunchParams: unknown;
	prelaunchCreateArg: string | null;
	prelaunchSignature: string | null;
	taxFeeRate: number | null;
	taxRecipientAddress: string | null;
}

/** Look up a claim by its sha256 hash. Returns null if not found or expired. */
export async function getClaimByTokenHash(db: Database, tokenHash: string): Promise<ClaimRecord | null> {
	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			name: agentPersonas.name,
			bio: agentPersonas.bio,
			avatarUrl: agentPersonas.avatarUrl,
			agentLaunchStatus: agentPersonas.agentLaunchStatus,
			claimExpiresAt: agentPersonas.claimExpiresAt,
			claimedByXHandle: agentPersonas.claimedByXHandle,
			claimedByXUserId: agentPersonas.claimedByXUserId,
			claimedAt: agentPersonas.claimedAt,
			tokenAddress: agentPersonas.tokenAddress,
			launchTxHash: agentPersonas.launchTxHash,
			prelaunchParams: agentPersonas.prelaunchParams,
			prelaunchCreateArg: agentPersonas.prelaunchCreateArg,
			prelaunchSignature: agentPersonas.prelaunchSignature,
			taxFeeRate: agentPersonas.taxFeeRate,
			taxRecipientAddress: agentPersonas.taxRecipientAddress,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.claimTokenHash, tokenHash))
		.limit(1);
	return row ?? null;
}

/** Store a prepared-but-not-claimed launch. Writes claim hash + prelaunch cache. */
export async function writePreparedLaunch(
	db: Database,
	args: {
		agentId: string;
		claimTokenHash: string;
		claimExpiresAt: Date;
		prelaunchParams: Record<string, unknown>;
		prelaunchCreateArg: string;
		prelaunchSignature: string;
		taxFeeRate?: number | null;
		taxRecipientAddress?: string | null;
		taxConfig?: Record<string, unknown> | null;
	},
): Promise<void> {
	await db
		.update(agentPersonas)
		.set({
			agentLaunchStatus: "prepared",
			claimTokenHash: args.claimTokenHash,
			claimExpiresAt: args.claimExpiresAt,
			claimedByXHandle: null,
			claimedByXUserId: null,
			claimedAt: null,
			prelaunchParams: args.prelaunchParams,
			prelaunchCreateArg: args.prelaunchCreateArg,
			prelaunchSignature: args.prelaunchSignature,
			taxFeeRate: args.taxFeeRate ?? null,
			taxRecipientAddress: args.taxRecipientAddress ?? null,
			taxConfig: (args.taxConfig as never) ?? null,
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.agentId, args.agentId));
}

/** Mark a prepared launch as claimed by a specific X account. */
export async function markClaimed(
	db: Database,
	agentId: string,
	claim: { xUserId: string; xHandle: string },
): Promise<void> {
	await db
		.update(agentPersonas)
		.set({
			agentLaunchStatus: "claimed",
			claimedByXUserId: claim.xUserId,
			claimedByXHandle: claim.xHandle,
			claimedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.agentId, agentId));
}

/** Mark a claimed launch as launched (token live). */
export async function markLaunched(
	db: Database,
	agentId: string,
	args: { tokenAddress: string; launchTxHash: string },
): Promise<void> {
	await db
		.update(agentPersonas)
		.set({
			agentLaunchStatus: "launched",
			tokenAddress: args.tokenAddress.toLowerCase(),
			launchTxHash: args.launchTxHash,
			launchedAt: new Date(),
			// Zero out the claim token so the URL is single-use.
			claimTokenHash: null,
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.agentId, agentId));
}
