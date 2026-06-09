import { Hono } from "hono";

import { agentIdentities, agentPersonas, agentWallets, getDatabase } from "@waifufun/db";
import type { AgentIdentityRow, Database } from "@waifufun/db";
import {
	Erc8004MetadataValidationError,
	buildErc8004RegistrationFile,
	isFirstWaifuAgentAddress,
} from "@waifufun/identity";
import { and, eq, or, sql } from "drizzle-orm";
import { getAddress, isAddress } from "viem";

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

type Erc8004ChainName = "bsc" | "bsc-testnet" | "ethereum" | "base";

type AgentPersonaIdentityFields = {
	agentId: string;
	tokenAddress: string | null;
	name: string;
	bio: string | null;
	avatarUrl: string | null;
	twitterHandle: string | null;
	ownerAddress: string | null;
	launchedAt: Date | null;
	createdAt: Date;
};

function chainNameForChainId(chainId: number): Erc8004ChainName {
	if (chainId === 56) return "bsc";
	if (chainId === 97) return "bsc-testnet";
	if (chainId === 8453) return "base";
	return "ethereum";
}

function isMissingAgentIdentitiesTable(err: unknown): boolean {
	const candidate = err as { code?: unknown; message?: unknown };
	return (
		candidate?.code === "42P01" ||
		(typeof candidate?.message === "string" && candidate.message.includes("agent_identities"))
	);
}

async function findAgentIdentity(db: Database, address: string): Promise<AgentIdentityRow | null> {
	const [identity] = await db
		.select()
		.from(agentIdentities)
		.where(
			and(sql`lower(${agentIdentities.agentAddress}) = lower(${address})`, eq(agentIdentities.standard, "erc-8004")),
		)
		.limit(1);
	return identity ?? null;
}

function isoDate(value: Date | null | undefined): string {
	return (value ?? new Date(0)).toISOString();
}

app.get("/:address/identity", async (c) => {
	const address = c.req.param("address");
	if (!isAddress(address)) return c.json({ error: "invalid agent address" }, 400);
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	try {
		const identity = await findAgentIdentity(db, address);
		if (!identity) return c.json({ error: "ERC-8004 identity not found" }, 404);

		const [persona] = await db
			.select({
				agentId: agentPersonas.agentId,
				tokenAddress: agentPersonas.tokenAddress,
				name: agentPersonas.name,
				bio: agentPersonas.bio,
				avatarUrl: agentPersonas.avatarUrl,
				twitterHandle: agentPersonas.twitterHandle,
				ownerAddress: agentPersonas.ownerAddress,
				launchedAt: agentPersonas.launchedAt,
				createdAt: agentPersonas.createdAt,
			})
			.from(agentPersonas)
			.where(sql`lower(${agentPersonas.tokenAddress}) = lower(${address})`)
			.limit(1);
		const typedPersona = persona as AgentPersonaIdentityFields | undefined;

		const [wallet] = await db
			.select({ walletAddress: agentWallets.walletAddress })
			.from(agentWallets)
			.where(
				or(
					sql`lower(${agentWallets.agentToken}) = lower(${address})`,
					typedPersona?.agentId ? eq(agentWallets.internalAgentId, typedPersona.agentId) : sql`false`,
				),
			)
			.limit(1);

		const ownerWalletAddress = wallet?.walletAddress ?? typedPersona?.ownerAddress;
		if (!ownerWalletAddress || !isAddress(ownerWalletAddress)) {
			return c.json({ error: "ERC-8004 identity owner wallet not found" }, 404);
		}
		const firstWaifuAgent = isFirstWaifuAgentAddress(identity.agentAddress);

		return c.json(
			{
				data: {
					standard: "erc-8004",
					chain: chainNameForChainId(identity.chainId),
					chainId: identity.chainId,
					registryAddress: getAddress(identity.registry),
					tokenId: identity.agentIdOnchain ?? "",
					agentURI: identity.uri,
					metadataHttpsUrl: identity.uriHttps ?? null,
					metadataIpfsUri: identity.uriIpfs ?? null,
					ownerWalletAddress: getAddress(ownerWalletAddress),
					txHash: identity.registrationTx ?? "",
					blockNumber: null,
					registeredAt: isoDate(identity.registeredAt ?? identity.createdAt),
					...(firstWaifuAgent ? { firstWaifuAgent } : {}),
				},
			},
			200,
			{ "Cache-Control": "public, max-age=300" },
		);
	} catch (err) {
		if (isMissingAgentIdentitiesTable(err)) return c.json({ error: "ERC-8004 identity not found" }, 404);
		const message = err instanceof Error ? err.message : String(err);
		return c.json({ error: "failed to read ERC-8004 identity", detail: message }, 500);
	}
});

app.get("/:address/erc8004.json", async (c) => {
	const address = c.req.param("address");
	if (!isAddress(address)) return c.json({ error: "invalid agent address" }, 400);
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	try {
		const identity = await findAgentIdentity(db, address);
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
		if (isMissingAgentIdentitiesTable(err)) return c.json({ error: "ERC-8004 identity not found" }, 404);
		if (err instanceof Erc8004MetadataValidationError) {
			return c.json({ error: "invalid erc-8004 registration metadata", detail: message }, 422);
		}
		return c.json({ error: "failed to build erc-8004 registration", detail: message }, 500);
	}
});

export default app;
