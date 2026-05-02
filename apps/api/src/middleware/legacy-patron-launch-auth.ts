import type { MiddlewareHandler } from "hono";

import { agentPersonas, getDatabase, launches } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { getAddress, isAddress } from "viem";

import { isProductionAuth, verifyJwt } from "../lib/auth-service.js";
import type { AppBindings } from "../lib/bindings.js";
import { extractSessionToken } from "../lib/session.js";

export type PatronLaunchAuthBindings = AppBindings & {
	Variables: AppBindings["Variables"] & {
		patronWallet: `0x${string}`;
		patronLaunch: {
			launchId: string;
			agentId: string | null;
			agentPersonaId: string | null;
			safeAddress: `0x${string}` | null;
		};
	};
};

export interface PatronLaunchAuthContext {
	wallet: `0x${string}`;
	launchId: string;
	agentId: string | null;
	agentPersonaId: string | null;
	safeAddress: `0x${string}` | null;
}

export type SessionWalletResolver = (token: string) => Promise<string | null> | string | null;

let sessionWalletResolverForTest: SessionWalletResolver | undefined;
let dbForTest: unknown | undefined;

export function __setPatronAuthSessionResolverForTest(resolver: SessionWalletResolver | undefined) {
	sessionWalletResolverForTest = resolver;
}

export function __setPatronAuthDbForTest(db: unknown | undefined) {
	dbForTest = db;
}

function normalizeWallet(value: string | null | undefined): `0x${string}` | null {
	if (!value || !isAddress(value)) return null;
	return getAddress(value) as `0x${string}`;
}

async function defaultSessionWalletResolver(token: string): Promise<string | null> {
	// Production SIWE login issues a wallet JWT; dev/test can use a transparent
	// cookie (`wf_session=siwe:0x...`) so route tests don't need crypto fixtures.
	if (token.startsWith("siwe:")) return token.slice("siwe:".length);
	if (!isProductionAuth() && isAddress(token)) return token;

	try {
		const payload = await verifyJwt(token);
		return payload.address;
	} catch {
		return null;
	}
}

async function resolveSessionWallet(cookieHeader: string | undefined): Promise<`0x${string}` | null> {
	const token = extractSessionToken(cookieHeader);
	if (!token) return null;

	const resolver = sessionWalletResolverForTest ?? defaultSessionWalletResolver;
	return normalizeWallet(await resolver(token));
}

async function lookupPatronLaunch(
	db: ReturnType<typeof getDatabase>["db"],
	launchId: string,
	wallet: `0x${string}`,
): Promise<PatronLaunchAuthContext | null | "forbidden"> {
	// W6.2 introduces launches.agent_id. Keep the access path tolerant for older
	// worktrees by selecting through a nullable dynamic field and falling back to
	// owner_address-only matching when no agent link has been backfilled yet.
	const [row] = await db
		.select({
			launchId: launches.id,
			agentId: (launches as unknown as { agentId?: unknown }).agentId as never,
			personaUuid: agentPersonas.id,
			personaAgentId: agentPersonas.agentId,
			ownerAddress: agentPersonas.ownerAddress,
		})
		.from(launches)
		.leftJoin(
			agentPersonas,
			eq((launches as unknown as { agentId: typeof agentPersonas.id }).agentId, agentPersonas.id),
		)
		.where(eq(launches.id, launchId))
		.limit(1);

	if (!row) return null;

	const owner = normalizeWallet(row.ownerAddress);
	if (!owner || owner.toLowerCase() !== wallet.toLowerCase()) return "forbidden";

	return {
		wallet,
		launchId: row.launchId,
		agentId: row.personaAgentId ?? null,
		agentPersonaId: row.personaUuid ?? null,
		safeAddress: null,
	};
}

export async function requirePatronLaunchAuthorization(
	launchId: string,
	cookieHeader: string | undefined,
): Promise<PatronLaunchAuthContext | null | "unauthorized" | "forbidden"> {
	const wallet = await resolveSessionWallet(cookieHeader);
	if (!wallet) return "unauthorized";

	const db = (dbForTest as ReturnType<typeof getDatabase>["db"] | undefined) ?? getDatabase().db;
	const result = await lookupPatronLaunch(db, launchId, wallet);
	if (result === "forbidden") return "forbidden";
	if (!result) return null;
	return result;
}

export function requirePatronLaunchAuth(): MiddlewareHandler<PatronLaunchAuthBindings> {
	return async (c, next) => {
		const launchId = c.req.param("id");
		if (!launchId) {
			return c.json({ ok: false, error: "BAD_REQUEST", message: "launch id required" }, 400);
		}
		const result = await requirePatronLaunchAuthorization(launchId, c.req.header("cookie"));

		if (result === "unauthorized") {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "SIWE session required" }, 401);
		}
		if (result === "forbidden") {
			return c.json({ ok: false, error: "FORBIDDEN", message: "wallet does not own agent" }, 403);
		}
		if (!result) {
			return c.json({ ok: false, error: "NOT_FOUND", message: "launch not found" }, 404);
		}

		c.set("patronWallet", result.wallet);
		c.set("patronLaunch", {
			launchId: result.launchId,
			agentId: result.agentId,
			agentPersonaId: result.agentPersonaId,
			safeAddress: result.safeAddress,
		});
		await next();
	};
}
