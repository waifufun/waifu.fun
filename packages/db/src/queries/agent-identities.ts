import { eq } from "drizzle-orm";

import type { Database } from "../client.js";
import { agentIdentities } from "../schema/agent-identities.js";
import type { NewAgentIdentity } from "../schema/agent-identities.js";

export async function upsertAgentIdentity(db: Database, input: NewAgentIdentity) {
	const [row] = await db
		.insert(agentIdentities)
		.values(input)
		.onConflictDoUpdate({
			target: [agentIdentities.agentAddress, agentIdentities.standard, agentIdentities.chainId],
			set: {
				registry: input.registry,
				agentIdOnchain: input.agentIdOnchain ?? null,
				uri: input.uri,
				uriIpfs: input.uriIpfs ?? null,
				uriHttps: input.uriHttps ?? null,
				registrationTx: input.registrationTx ?? null,
				registeredAt: input.registeredAt ?? null,
				updatedAt: new Date(),
			},
		})
		.returning();
	return row;
}

export async function getAgentIdentityById(db: Database, id: string) {
	const [row] = await db.select().from(agentIdentities).where(eq(agentIdentities.id, id)).limit(1);
	return row ?? null;
}
