import { and, eq } from "drizzle-orm";

import type { Database } from "../client.js";
import { type AgentSafeRow, type NewAgentSafe, agentSafes } from "../schema/agent-safes.js";

export type { AgentSafeRow, NewAgentSafe };

export type InsertAgentSafeInput = Omit<NewAgentSafe, "id" | "deployedAt">;

export async function insertAgentSafe(db: Database, data: InsertAgentSafeInput): Promise<AgentSafeRow> {
	const [row] = await db
		.insert(agentSafes)
		.values(data)
		.onConflictDoUpdate({
			target: [agentSafes.agentId, agentSafes.chain],
			set: {
				safeAddress: data.safeAddress,
				zodiacModifierAddress: data.zodiacModifierAddress ?? null,
				rolesModifierAddress: data.rolesModifierAddress ?? data.zodiacModifierAddress ?? null,
				chainId: data.chainId ?? 56,
				deployTxHash: data.deployTxHash ?? null,
				deployedAt: new Date(),
			},
		})
		.returning();
	if (!row) throw new Error("insertAgentSafe: insert returned no row");
	return row;
}

export async function getSafeByAgentId(db: Database, agentId: string, chain?: string): Promise<AgentSafeRow | null> {
	const where = chain
		? and(eq(agentSafes.agentId, agentId), eq(agentSafes.chain, chain))
		: eq(agentSafes.agentId, agentId);
	const [row] = await db.select().from(agentSafes).where(where).limit(1);
	return row ?? null;
}

export async function updateSafeRoleConfig(
	db: Database,
	agentId: string,
	chain: string,
	roles: Pick<NewAgentSafe, "zodiacModifierAddress" | "agentRoleId" | "patronRoleId">,
): Promise<AgentSafeRow | null> {
	const [row] = await db
		.update(agentSafes)
		.set({
			zodiacModifierAddress: roles.zodiacModifierAddress ?? null,
			rolesModifierAddress: roles.zodiacModifierAddress ?? null,
			agentRoleId: roles.agentRoleId ?? null,
			patronRoleId: roles.patronRoleId ?? null,
		})
		.where(and(eq(agentSafes.agentId, agentId), eq(agentSafes.chain, chain)))
		.returning();
	return row ?? null;
}
