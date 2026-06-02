import { schema } from "@waifufun/db";
import { sql } from "drizzle-orm";

import type { Address } from "../lib/address.js";
import type { Erc8004RegisteredEvent } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import type { PortalEventHandlerResult } from "./index.js";

export interface ParsedAgentUri {
	uriIpfs: string | null;
	uriHttps: string | null;
	decodedJson: unknown | null;
}

const IPFS_GATEWAY_BASE = "https://ipfs.io/ipfs/";

function normalizeIpfsUri(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed.toLowerCase().startsWith("ipfs://")) return null;
	const path = trimmed.slice("ipfs://".length).replace(/^ipfs\//i, "");
	return path.length > 0 ? `ipfs://${path}` : null;
}

function ipfsToHttps(uri: string): string {
	return `${IPFS_GATEWAY_BASE}${uri.slice("ipfs://".length)}`;
}

function decodeDataJsonUri(value: string): unknown | null {
	const match = /^data:application\/json(?:;charset=[^;,]+)?;base64,(.*)$/i.exec(value.trim());
	if (!match?.[1]) return null;
	try {
		return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
	} catch {
		return null;
	}
}

function firstStringField(value: unknown, keys: string[]): string | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	for (const key of keys) {
		const candidate = record[key];
		if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
	}
	return null;
}

export function parseAgentUri(agentURI: string): ParsedAgentUri {
	const directIpfs = normalizeIpfsUri(agentURI);
	if (directIpfs) {
		return { uriIpfs: directIpfs, uriHttps: ipfsToHttps(directIpfs), decodedJson: null };
	}

	if (agentURI.startsWith("http://") || agentURI.startsWith("https://")) {
		return { uriIpfs: null, uriHttps: agentURI, decodedJson: null };
	}

	const decodedJson = decodeDataJsonUri(agentURI);
	const embeddedIpfs = normalizeIpfsUri(firstStringField(decodedJson, ["uriIpfs", "metadataIpfsUri", "ipfs"]) ?? "");
	const embeddedHttps = firstStringField(decodedJson, ["uriHttps", "metadataHttpsUrl", "url"]);

	return {
		uriIpfs: embeddedIpfs,
		uriHttps: embeddedIpfs ? ipfsToHttps(embeddedIpfs) : embeddedHttps,
		decodedJson,
	};
}

interface ManagedAgentWalletLookup {
	id: number;
	agentToken: string | null;
	metadata: unknown;
}

interface PendingErc8004Identity {
	agentId: string;
	agentURI: string;
	owner: Address;
	registry: Address;
	chainId: number;
	txHash: `0x${string}`;
	registeredAt: string;
}

function asPendingErc8004Identity(value: unknown): PendingErc8004Identity | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	return typeof record.agentId === "string" &&
		typeof record.agentURI === "string" &&
		typeof record.owner === "string" &&
		typeof record.registry === "string" &&
		typeof record.chainId === "number" &&
		typeof record.txHash === "string" &&
		typeof record.registeredAt === "string"
		? (record as unknown as PendingErc8004Identity)
		: null;
}

async function lookupManagedAgentWalletByOwner(
	runtime: IndexerRuntime,
	owner: Address,
): Promise<ManagedAgentWalletLookup | null> {
	const rows = await runtime.db
		.select({
			id: schema.agentWallets.id,
			agentToken: schema.agentWallets.agentToken,
			metadata: schema.agentWallets.metadata,
		})
		.from(schema.agentWallets)
		.where(sql`lower(${schema.agentWallets.walletAddress}) = lower(${owner})`)
		.limit(1);

	return rows[0] ?? null;
}

async function storePendingErc8004Identity(
	runtime: IndexerRuntime,
	walletId: number,
	pending: PendingErc8004Identity,
): Promise<void> {
	await runtime.db
		.update(schema.agentWallets)
		.set({
			metadata: sql`coalesce(${schema.agentWallets.metadata}, '{}'::jsonb) || ${JSON.stringify({
				erc8004PendingIdentity: pending,
			})}::jsonb`,
			updatedAt: new Date(pending.registeredAt),
		})
		.where(sql`${schema.agentWallets.id} = ${walletId}`);
}

async function upsertErc8004Identity(
	runtime: IndexerRuntime,
	input: {
		agentAddress: string;
		agentId: string;
		agentURI: string;
		registry: Address;
		chainId: number;
		txHash: `0x${string}`;
		registeredAt: Date;
	},
): Promise<void> {
	const parsed = parseAgentUri(input.agentURI);

	await runtime.db
		.insert(schema.agentIdentities)
		.values({
			agentAddress: input.agentAddress,
			standard: "erc-8004",
			chainId: input.chainId,
			registry: input.registry,
			agentIdOnchain: input.agentId,
			uri: input.agentURI,
			uriIpfs: parsed.uriIpfs,
			uriHttps: parsed.uriHttps,
			registrationTx: input.txHash,
			registeredAt: input.registeredAt,
			updatedAt: input.registeredAt,
		})
		.onConflictDoUpdate({
			target: [schema.agentIdentities.agentAddress, schema.agentIdentities.standard, schema.agentIdentities.chainId],
			set: {
				registry: input.registry,
				agentIdOnchain: input.agentId,
				uri: input.agentURI,
				uriIpfs: parsed.uriIpfs,
				uriHttps: parsed.uriHttps,
				registrationTx: input.txHash,
				registeredAt: input.registeredAt,
				updatedAt: input.registeredAt,
			},
		});
}

export async function handleErc8004RegisteredEvent(
	runtime: IndexerRuntime,
	event: Erc8004RegisteredEvent,
): Promise<PortalEventHandlerResult> {
	const managed = await lookupManagedAgentWalletByOwner(runtime, event.data.owner);
	if (!managed) {
		runtime.logger.debug(
			{
				owner: event.data.owner,
				agentId: event.data.agentId,
				txHash: event.txHash,
			},
			"ERC-8004 Registered owner not managed by waifu.fun, skipping",
		);
		return { handled: false, enqueuedJobs: [] };
	}

	if (!managed.agentToken) {
		await storePendingErc8004Identity(runtime, managed.id, {
			agentId: event.data.agentId,
			agentURI: event.data.agentURI,
			owner: event.data.owner,
			registry: event.contractAddress,
			chainId: event.chainId,
			txHash: event.txHash,
			registeredAt: event.blockTimestamp.toISOString(),
		});

		runtime.logger.info(
			{
				owner: event.data.owner,
				agentId: event.data.agentId,
				txHash: event.txHash,
			},
			"ERC-8004 Registered identity pending until token address is known",
		);
		return { handled: true, enqueuedJobs: [] };
	}

	await upsertErc8004Identity(runtime, {
		agentAddress: managed.agentToken,
		agentId: event.data.agentId,
		agentURI: event.data.agentURI,
		registry: event.contractAddress,
		chainId: event.chainId,
		txHash: event.txHash,
		registeredAt: event.blockTimestamp,
	});

	runtime.logger.info(
		{
			agentAddress: managed.agentToken,
			agentId: event.data.agentId,
			registry: event.contractAddress,
			txHash: event.txHash,
		},
		"ERC-8004 Registered identity upserted",
	);

	return { handled: true, enqueuedJobs: [] };
}

export async function materializePendingErc8004Identity(
	runtime: IndexerRuntime,
	owner: Address,
	agentAddress: Address,
): Promise<void> {
	const managed = await lookupManagedAgentWalletByOwner(runtime, owner);
	const metadata = managed?.metadata;
	const pending = asPendingErc8004Identity(
		metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).erc8004PendingIdentity : null,
	);
	if (!pending) return;

	await upsertErc8004Identity(runtime, {
		agentAddress,
		agentId: pending.agentId,
		agentURI: pending.agentURI,
		registry: pending.registry,
		chainId: pending.chainId,
		txHash: pending.txHash,
		registeredAt: new Date(pending.registeredAt),
	});
}
