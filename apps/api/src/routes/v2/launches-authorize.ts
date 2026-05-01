import { Hono } from "hono";

import { agentPersonas, agentSafes, getDatabase, launches } from "@waifufun/db";
import type { addLaunchPrepJob as addLaunchPrepJobType } from "@waifufun/queue";
import { and, eq } from "drizzle-orm";
import { http, createPublicClient, getAddress, isAddress } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import type { AppBindings } from "../../lib/bindings.js";
import { requirePatron, requireWalletOwnership } from "../../middleware/patron-auth.js";
import { emitAgentEvent } from "../../services/events/emit.js";

const FIRST_BUY_RE = /^\d+$/;

type Db = ReturnType<typeof getDatabase>["db"];

type LaunchAuthorizeRow = {
	id: string;
	status: string;
	chainId: number;
	portalAddress: string;
	quoteToken: string | null;
	tokenName: string;
	tokenTicker: string;
	tokenDescription: string | null;
	tokenImageUrl: string | null;
	socials: Record<string, unknown>;
	taxRate: number;
	agentPersonaId: string | null;
	agentId: string | null;
	ownerAddress: string | null;
	safeAddress: string | null;
};

export interface LaunchAuthorizeDeps {
	db: Db;
	getSafeBalanceWei: (safeAddress: `0x${string}`, chainId: number) => Promise<bigint>;
	enqueueLaunchPrep: typeof addLaunchPrepJobType;
	emitEvent: typeof emitAgentEvent;
	now: () => Date;
}

let depsForTest: Partial<LaunchAuthorizeDeps> | undefined;

export function __setLaunchAuthorizeDepsForTest(deps: Partial<LaunchAuthorizeDeps> | undefined) {
	depsForTest = deps;
}

function defaultDb(): Db {
	return getDatabase().db;
}

function rpcUrlForChain(chainId: number): string {
	if (chainId === 97) return process.env.BSC_TESTNET_RPC_URL ?? process.env.RPC_URL ?? "";
	return process.env.BSC_RPC_URL ?? process.env.RPC_URL ?? "";
}

async function defaultGetSafeBalanceWei(safeAddress: `0x${string}`, chainId: number): Promise<bigint> {
	const rpcUrl = rpcUrlForChain(chainId);
	if (!rpcUrl) throw new Error("RPC_URL/BSC_RPC_URL is required to read Safe balance");
	const client = createPublicClient({
		chain: chainId === 97 ? bscTestnet : bsc,
		transport: http(rpcUrl),
	});
	return client.getBalance({ address: safeAddress });
}

async function defaultEnqueueLaunchPrep(
	...args: Parameters<typeof addLaunchPrepJobType>
): ReturnType<typeof addLaunchPrepJobType> {
	const { addLaunchPrepJob } = await import("@waifufun/queue");
	return addLaunchPrepJob(...args);
}

function getDeps(): LaunchAuthorizeDeps {
	return {
		db: depsForTest?.db ?? defaultDb(),
		getSafeBalanceWei: depsForTest?.getSafeBalanceWei ?? defaultGetSafeBalanceWei,
		enqueueLaunchPrep: depsForTest?.enqueueLaunchPrep ?? defaultEnqueueLaunchPrep,
		emitEvent: depsForTest?.emitEvent ?? emitAgentEvent,
		now: depsForTest?.now ?? (() => new Date()),
	};
}

function normalizedAddress(value: string | null | undefined): `0x${string}` | null {
	if (!value || !isAddress(value)) return null;
	return getAddress(value) as `0x${string}`;
}

function optionalAddress(value: string | null | undefined): `0x${string}` | undefined {
	const address = normalizedAddress(value);
	return address ?? undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function loadLaunch(db: Db, launchId: string): Promise<LaunchAuthorizeRow | null> {
	const [row] = await db
		.select({
			id: launches.id,
			status: launches.status,
			chainId: launches.chainId,
			portalAddress: launches.portalAddress,
			quoteToken: launches.quoteToken,
			tokenName: launches.tokenName,
			tokenTicker: launches.tokenTicker,
			tokenDescription: launches.tokenDescription,
			tokenImageUrl: launches.tokenImageUrl,
			socials: launches.socials,
			taxRate: launches.taxRate,
			agentPersonaId: agentPersonas.id,
			agentId: agentPersonas.agentId,
			ownerAddress: agentPersonas.ownerAddress,
			safeAddress: agentSafes.safeAddress,
		})
		.from(launches)
		.leftJoin(agentPersonas, eq(launches.agentId, agentPersonas.id))
		.leftJoin(agentSafes, eq(agentSafes.agentId, agentPersonas.id))
		.where(eq(launches.id, launchId))
		.limit(1);

	return (row as LaunchAuthorizeRow | undefined) ?? null;
}

export async function authorizeLaunch(input: {
	launchId: string;
	patronWallet: `0x${string}`;
	firstBuyWei?: string;
	deps?: Partial<LaunchAuthorizeDeps>;
}): Promise<
	| {
			ok: true;
			status: 200;
			body: { launchId: string; status: "queued"; firstBuyWei: string; txHashPending: true };
	  }
	| {
			ok: false;
			status: 400 | 403 | 404 | 409 | 503;
			body: { ok: false; error: string; message: string };
	  }
> {
	const deps = { ...getDeps(), ...input.deps };
	const firstBuyWei = input.firstBuyWei ?? "0";

	if (!FIRST_BUY_RE.test(firstBuyWei)) {
		return {
			ok: false,
			status: 400,
			body: {
				ok: false,
				error: "INVALID_FIRST_BUY",
				message: "firstBuyWei must be a non-negative integer string",
			},
		};
	}

	const launch = await loadLaunch(deps.db, input.launchId);
	if (!launch) {
		return {
			ok: false,
			status: 404,
			body: { ok: false, error: "NOT_FOUND", message: "launch not found" },
		};
	}

	const owner = normalizedAddress(launch.ownerAddress);
	if (!owner || owner.toLowerCase() !== input.patronWallet.toLowerCase()) {
		return {
			ok: false,
			status: 403,
			body: { ok: false, error: "FORBIDDEN", message: "wallet does not own agent" },
		};
	}

	if (launch.status !== "provisioned") {
		return {
			ok: false,
			status: 409,
			body: {
				ok: false,
				error: "INVALID_STATUS",
				message: "launch must be provisioned before authorization",
			},
		};
	}

	const safeAddress = normalizedAddress(launch.safeAddress);
	if (!safeAddress) {
		return {
			ok: false,
			status: 409,
			body: {
				ok: false,
				error: "SAFE_NOT_READY",
				message: "agent Safe is not available for this launch",
			},
		};
	}

	const requestedWei = BigInt(firstBuyWei);
	let balanceWei: bigint;
	try {
		balanceWei = await deps.getSafeBalanceWei(safeAddress, launch.chainId);
	} catch (err) {
		return {
			ok: false,
			status: 503,
			body: {
				ok: false,
				error: "BALANCE_UNAVAILABLE",
				message: err instanceof Error ? err.message : "unable to read Safe balance",
			},
		};
	}

	if (requestedWei > balanceWei) {
		return {
			ok: false,
			status: 400,
			body: {
				ok: false,
				error: "INSUFFICIENT_SAFE_BALANCE",
				message: "firstBuyWei exceeds Safe balance",
			},
		};
	}

	const now = deps.now();
	const [updated] = await deps.db
		.update(launches)
		.set({
			status: "queued",
			firstBuyWei,
			launchAuthorizedAt: now,
			launchAuthorizedBy: input.patronWallet,
			updatedAt: now,
		})
		.where(and(eq(launches.id, input.launchId), eq(launches.status, "provisioned")))
		.returning({ id: launches.id, status: launches.status });

	if (!updated) {
		return {
			ok: false,
			status: 409,
			body: {
				ok: false,
				error: "INVALID_STATUS",
				message: "launch was already authorized or changed status",
			},
		};
	}

	const socials = launch.socials ?? {};
	await deps.enqueueLaunchPrep(
		{
			launchId: launch.id,
			creatorAddress: owner,
			chainId: launch.chainId,
			...(optionalAddress(launch.portalAddress) ? { portalAddress: optionalAddress(launch.portalAddress) } : {}),
			...(optionalAddress(launch.quoteToken) ? { quoteToken: optionalAddress(launch.quoteToken) } : {}),
			quoteAmount: firstBuyWei,
			taxRate: launch.taxRate,
			metadata: {
				name: launch.tokenName,
				symbol: launch.tokenTicker,
				description: launch.tokenDescription ?? "",
				imageUrl: launch.tokenImageUrl ?? "ipfs://pending-image",
				website: stringField(socials, "website") ?? null,
				twitter: stringField(socials, "twitter") ?? null,
				telegram: stringField(socials, "telegram") ?? null,
			},
			requestSource: "api",
		},
		{ jobId: `launch-prep-${launch.id}` },
	);

	await deps.emitEvent({
		agentId: launch.agentId,
		eventType: "launch.authorized",
		data: {
			launchId: launch.id,
			patronWallet: input.patronWallet,
			firstBuyWei,
			safeAddress,
		},
	});

	return {
		ok: true,
		status: 200,
		body: { launchId: launch.id, status: "queued", firstBuyWei, txHashPending: true },
	};
}

const app = new Hono<AppBindings>();

app.post("/:id/authorize", requirePatron() as never, requireWalletOwnership("id") as never, async (c) => {
	let body: { firstBuyWei?: unknown } = {};
	try {
		const raw = await c.req.text();
		body = raw ? (JSON.parse(raw) as typeof body) : {};
	} catch {
		return c.json({ ok: false, error: "INVALID_JSON", message: "request body must be JSON" }, 400);
	}

	const firstBuyWei = body.firstBuyWei === undefined ? undefined : String(body.firstBuyWei);
	const patronWallet = (c as unknown as { get(key: "wallet"): `0x${string}` }).get("wallet");
	const result = await authorizeLaunch({
		launchId: c.req.param("id"),
		patronWallet,
		...(firstBuyWei !== undefined ? { firstBuyWei } : {}),
	});

	return c.json(result.body, result.status);
});

export default app;
