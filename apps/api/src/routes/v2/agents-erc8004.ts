import { Hono } from "hono";

import { agentIdentities, agentPersonas, getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db";
import { Erc8004MetadataValidationError, buildErc8004RegistrationFile } from "@waifufun/identity";
import { and, eq, sql } from "drizzle-orm";
import { isAddress } from "viem";

type Erc8004RouteDepsForTest = {
	db: Database | undefined;
};

const depsForTest: Erc8004RouteDepsForTest = {
	db: undefined,
};

export function __setErc8004RouteDepsForTest(deps: Partial<Erc8004RouteDepsForTest>): void {
	depsForTest.db = deps.db;
}

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	if (depsForTest.db) return depsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function normalizeApiBaseUrl(): string {
	const raw = process.env.PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? "https://api.waifu.fun";
	return raw.replace(/\/+$/, "");
}

const app = new Hono();

app.get("/:address/erc8004.json", async (c) => {
	const address = c.req.param("address");
	if (!isAddress(address)) return c.json({ error: "invalid agent address" }, 400);
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	try {
		const [identity] = await db
			.select()
			.from(agentIdentities)
			.where(
				and(sql`lower(${agentIdentities.agentAddress}) = lower(${address})`, eq(agentIdentities.standard, "erc-8004")),
			)
			.limit(1);
		if (!identity) return c.json({ error: "ERC-8004 identity not found" }, 404);
		const [persona] = await db
			.select()
			.from(agentPersonas)
			.where(sql`lower(${agentPersonas.tokenAddress}) = lower(${address})`)
			.limit(1);
		if (!persona) return c.json({ error: "agent persona not found" }, 404);
		const httpsMirror = identity.uriHttps ?? `${normalizeApiBaseUrl()}/v2/agents/${address}/erc8004.json`;
		const file = buildErc8004RegistrationFile({
			agent: {
				address: identity.agentAddress,
				name: persona.name,
				bio: persona.bio,
				avatarUrl: persona.avatarUrl,
				twitterHandle: persona.twitterHandle,
				agentId: persona.agentId,
				tokenAddress: persona.tokenAddress,
				launchedAt: persona.launchedAt,
				createdAt: persona.createdAt,
			},
			persona,
			chainId: identity.chainId,
			registry: identity.registry,
			agentIdOnchain: identity.agentIdOnchain,
			waifu: {
				tokenAddress: identity.agentAddress,
				httpsMirror,
				...(identity.uriIpfs ? { ipfsUri: identity.uriIpfs } : {}),
			},
		});
		return c.json(file, 200, {
			"Cache-Control": "public, max-age=60",
		});
	} catch (err) {
		// Never leak a raw 500 for identity reads. Invalid/incomplete registration
		// metadata is a 422 with detail; everything else is logged and surfaced as
		// a generic 500 (e.g. a true DB/runtime failure). A missing identity is
		// already handled above as an honest 404.
		const message = err instanceof Error ? err.message : String(err);
		if (err instanceof Erc8004MetadataValidationError) {
			return c.json({ error: "invalid erc-8004 registration metadata", detail: message }, 422);
		}
		return c.json({ error: "failed to build erc-8004 registration", detail: message }, 500);
	}
});

export default app;
