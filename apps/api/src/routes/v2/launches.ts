import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDatabase, launches } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

type PublicLaunchRow = {
	id: string;
	agentId: string | null;
	status: string;
	creatorAddress: string | null;
	tokenAddress: string | null;
	taxRecipientAddress: string | null;
	taxSplitterAddress: string | null;
	agentSafeAddress: string | null;
	platformBps: number | null;
	patronBps: number | null;
	agentSafeOwners: string[] | null;
	agentSafeThreshold: number | null;
	taxSplit: { splitterAddress?: string; platformBps?: number; patronBps?: number; agentBps?: number } | null;
	firstBuyWei: string;
	launchAuthorizedAt: Date | null;
	launchAuthorizedBy: string | null;
	failureReason: string | null;
};

export type PublicLaunchResponse = {
	launchId: string;
	agentId: string | null;
	status: string;
	creatorAddress: string | null;
	tokenAddress: string | null;
	taxRecipient: string | null;
	taxSplitter: string | null;
	agentSafe: string | null;
	taxSplit: { platformBps: number; patronBps: number; agentBps: number } | null;
	agentSafeConfig: { owners: string[]; threshold: number } | null;
	firstBuyWei: string;
	launchAuthorizedAt: string | null;
	launchAuthorizedBy: string | null;
	errorMessage: string | null;
};

export function serializePublicLaunch(row: PublicLaunchRow): PublicLaunchResponse {
	const platformBps = row.platformBps ?? row.taxSplit?.platformBps ?? null;
	const patronBps = row.patronBps ?? row.taxSplit?.patronBps ?? null;
	const taxSplit =
		platformBps === null || patronBps === null
			? null
			: { platformBps, patronBps, agentBps: row.taxSplit?.agentBps ?? Math.max(0, 10_000 - platformBps - patronBps) };
	const owners = Array.isArray(row.agentSafeOwners) ? row.agentSafeOwners : null;
	return {
		launchId: row.id,
		agentId: row.agentId,
		status: row.status,
		creatorAddress: row.creatorAddress,
		tokenAddress: row.tokenAddress,
		taxRecipient: row.taxRecipientAddress ?? row.taxSplitterAddress ?? row.taxSplit?.splitterAddress ?? null,
		taxSplitter: row.taxSplitterAddress ?? row.taxSplit?.splitterAddress ?? null,
		agentSafe: row.agentSafeAddress ?? null,
		taxSplit,
		agentSafeConfig: owners && row.agentSafeThreshold !== null ? { owners, threshold: row.agentSafeThreshold } : null,
		firstBuyWei: row.firstBuyWei,
		launchAuthorizedAt: row.launchAuthorizedAt?.toISOString() ?? null,
		launchAuthorizedBy: row.launchAuthorizedBy,
		errorMessage: row.failureReason,
	};
}

export async function getPublicLaunch(db: Database, id: string): Promise<PublicLaunchResponse | null> {
	const [row] = await db
		.select({
			id: launches.id,
			agentId: launches.agentId,
			status: launches.status,
			creatorAddress: launches.creatorAddress,
			tokenAddress: launches.tokenAddress,
			taxRecipientAddress: launches.taxRecipientAddress,
			taxSplitterAddress: launches.taxSplitterAddress,
			agentSafeAddress: launches.agentSafeAddress,
			platformBps: launches.platformBps,
			patronBps: launches.patronBps,
			agentSafeOwners: launches.agentSafeOwners,
			agentSafeThreshold: launches.agentSafeThreshold,
			taxSplit: launches.taxSplit,
			firstBuyWei: launches.firstBuyWei,
			launchAuthorizedAt: launches.launchAuthorizedAt,
			launchAuthorizedBy: launches.launchAuthorizedBy,
			failureReason: launches.failureReason,
		})
		.from(launches)
		.where(eq(launches.id, id))
		.limit(1);

	return row ? serializePublicLaunch(row) : null;
}

export function createLaunchV2Routes(
	options: {
		db?: Database;
		getLaunch?: (db: Database, id: string) => Promise<PublicLaunchResponse | null>;
	} = {},
) {
	const app = new Hono();

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) return c.json({ error: "invalid launch id" }, 400);

		const db = options.db ?? requireDb();
		if (!db) return c.json({ error: "database unavailable" }, 503);

		try {
			const launch = await (options.getLaunch ?? getPublicLaunch)(db, id);
			if (!launch) return c.json({ error: "launch not found" }, 404);
			return c.json(launch);
		} catch (err) {
			return c.json(
				{
					error: "failed to load launch",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}
	});

	return app;
}

function requireDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export default createLaunchV2Routes();
