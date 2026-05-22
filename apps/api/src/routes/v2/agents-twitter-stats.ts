import { Hono } from "hono";

import { agentLaunches, agentPersonas, agentXAccounts, getDatabase } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import { fetchTwitterStats, normalizeTwitterHandle } from "../../services/twitter/follower-count.js";

const app = new Hono();
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_AGENT_TOKEN_ADDRESS = "0xea17df5cf6d172224892b5477a16acb111182478";
const SOL_TWITTER_HANDLE = "0xsolace_";

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

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

async function resolveTwitterHandle(db: ReturnType<typeof getDatabase>["db"], address: string): Promise<string | null> {
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

	if (lower === SOL_AGENT_TOKEN_ADDRESS) return SOL_TWITTER_HANDLE;
	return null;
}

app.get("/:address/twitter-stats", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "database unavailable" }, 503);

	const address = c.req.param("address");
	if (!ADDRESS_RE.test(address)) return c.json({ ok: false, error: "invalid agent address" }, 400);

	try {
		const handle = await resolveTwitterHandle(db, address);
		c.header("Cache-Control", "public, max-age=600, stale-while-revalidate=1800");
		if (!handle) return c.json({ ok: true, data: null }, 200);
		const stats = await fetchTwitterStats(handle);
		return c.json({ ok: true, data: stats }, 200);
	} catch (err) {
		return c.json(
			{
				ok: false,
				error: "failed to load twitter stats",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

export default app;
