import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDatabase, launches } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import type { AppBindings } from "../../lib/bindings.js";
import { respondOk } from "../../lib/http.js";

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
	const app = new Hono<AppBindings>();

	app.get("/gate", async (c) => {
		const deps = c.get("deps");
		const inviteCode = c.req.query("inviteCode");

		if (!deps?.config.features.curatedLaunchOnly) {
			return respondOk(c, { allowed: true, accessSource: "open" });
		}

		if (inviteCode) {
			const result = await deps.db.validateInviteCode(inviteCode);
			if (result.valid) {
				return respondOk(c, {
					allowed: true,
					accessSource: "invite",
					remainingUses: result.remainingUses,
				});
			}

			return respondOk(c, {
				allowed: false,
				reason: result.reason ?? "Invalid or expired invite code",
			});
		}

		return respondOk(c, {
			allowed: false,
			reason: "An invite code is required to create tokens during the curated launch period.",
		});
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) return c.json({ error: "invalid launch id" }, 400);
		// Guard against reserved sibling paths being swallowed by this catch-all
		// /:id lookup. If route registration order lands /:id before a literal
		// sibling (e.g. /gate), a request for /gate would otherwise reach here and
		// fail a uuid cast with a 500. Reserved literals must never resolve here.
		if (id === "gate") return c.notFound();
		// launches.id is a uuid column; the default getPublicLaunch issues an eq()
		// against it, so a non-UUID id can never match and would otherwise reach
		// Postgres and throw an 'invalid input syntax for type uuid' error — a 500
		// that leaks the raw DB message. Treat a malformed id as not-found. Only on
		// the default lookup path; an injected getLaunch may accept non-UUID ids.
		if (
			!options.getLaunch &&
			!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)
		) {
			return c.json({ error: "launch not found" }, 404);
		}

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
