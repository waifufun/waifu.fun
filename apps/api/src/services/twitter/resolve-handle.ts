// Resolve the canonical twitter handle for an agent token address.
// Reads persona/X-account/launch metadata, with a Sol fallback. Shared
// between /agents/:address/twitter-stats and /agents/:address/tweets.

import { agentLaunches, agentPersonas, agentXAccounts, type getDatabase } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import { normalizeTwitterHandle } from "./follower-count.js";

const SOL_AGENT_TOKEN_ADDRESS = "0x15fc6086064afe50ccf4c70000c55cecb6e17777";
const SOL_AGENT_LEGACY_TOKEN_ADDRESS = "0xea17df5cf6d172224892b5477a16acb111182478";
const SOL_TWITTER_HANDLE = "0xsolace_";

type Db = ReturnType<typeof getDatabase>["db"];

function handleFromMetadata(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
	const record = metadata as Record<string, unknown>;
	const direct = record.xHandle ?? record.twitterHandle ?? record.twitter ?? record.x;
	if (typeof direct === "string") return normalizeTwitterHandle(direct) || null;
	const socials = record.socials;
	if (socials && typeof socials === "object" && !Array.isArray(socials)) {
		const twitter = (socials as Record<string, unknown>).twitter ?? (socials as Record<string, unknown>).x;
		if (typeof twitter === "string") return normalizeTwitterHandle(twitter) || null;
	}
	return null;
}

export async function resolveTwitterHandleForAddress(db: Db, address: string): Promise<string | null> {
	const lower = address.toLowerCase();
	const [personaRow] = await db
		.select({
			twitterHandle: agentPersonas.twitterHandle,
			metadata: agentPersonas.metadata,
			xHandle: agentXAccounts.xHandle,
		})
		.from(agentPersonas)
		.leftJoin(agentXAccounts, eq(agentXAccounts.agentId, agentPersonas.agentId))
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${lower}`)
		.limit(1);

	const personaHandle = normalizeTwitterHandle(personaRow?.twitterHandle ?? "");
	if (personaHandle) return personaHandle;
	const xHandle = normalizeTwitterHandle(personaRow?.xHandle ?? "");
	if (xHandle) return xHandle;
	const personaMetadataHandle = handleFromMetadata(personaRow?.metadata);
	if (personaMetadataHandle) return personaMetadataHandle;

	const [launchRow] = await db
		.select({ metadata: agentLaunches.metadata })
		.from(agentLaunches)
		.where(
			sql`lower(${agentLaunches.tokenAddress}) = ${lower} OR lower(${agentLaunches.flapTokenAddress}) = ${lower} OR lower(${agentLaunches.predictedTokenAddress}) = ${lower}`,
		)
		.limit(1);
	const launchMetadataHandle = handleFromMetadata(launchRow?.metadata);
	if (launchMetadataHandle) return launchMetadataHandle;

	if (lower === SOL_AGENT_TOKEN_ADDRESS || lower === SOL_AGENT_LEGACY_TOKEN_ADDRESS) return SOL_TWITTER_HANDLE;
	return null;
}

export const __TEST_SOL_TWITTER_HANDLE = SOL_TWITTER_HANDLE;
