import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { type AgentApiKeyRow, agentApiKeys } from "@waifufun/db";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "@waifufun/db";

/**
 * Agent API key helpers.
 *
 * Raw key format: `agk_` + 32 hex chars (37 chars total).
 * Example: `agk_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`.
 *
 * We never persist the raw key. The sha256 hash is stored in key_hash,
 * and the first 12 chars are kept in key_prefix for display in admin
 * tooling ("agk_a1b2c3d4" style).
 */

const KEY_PREFIX_LEN = 12;
const KEY_HEX_LEN = 32;
const KEY_TOTAL_LEN = 4 + KEY_HEX_LEN; // "agk_" + 32 hex
const KEY_PREFIX_STR = "agk_";

export function generateRawKey(): string {
	const bytes = randomBytes(KEY_HEX_LEN / 2);
	return `${KEY_PREFIX_STR}${bytes.toString("hex")}`;
}

export function hashKey(rawKey: string): string {
	return createHash("sha256").update(rawKey).digest("hex");
}

export function keyPrefixOf(rawKey: string): string {
	return rawKey.slice(0, KEY_PREFIX_LEN);
}

export function isValidKeyShape(raw: string): boolean {
	if (raw.length !== KEY_TOTAL_LEN) return false;
	if (!raw.startsWith(KEY_PREFIX_STR)) return false;
	const hex = raw.slice(KEY_PREFIX_STR.length);
	return /^[0-9a-f]+$/i.test(hex);
}

export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a), Buffer.from(b));
	} catch {
		return false;
	}
}

export interface CreateKeyResult {
	raw: string;
	row: AgentApiKeyRow;
}

/**
 * Generate + persist a new API key for an agent. If the agent already has
 * an active key, it will be revoked first (one active key per agent).
 */
export async function createKey(db: Database, agentId: string): Promise<CreateKeyResult> {
	const raw = generateRawKey();
	const hash = hashKey(raw);
	const prefix = keyPrefixOf(raw);

	// Revoke existing active key (if any)
	await db
		.update(agentApiKeys)
		.set({ revokedAt: new Date() })
		.where(and(eq(agentApiKeys.agentId, agentId), isNull(agentApiKeys.revokedAt)));

	const [row] = await db
		.insert(agentApiKeys)
		.values({
			agentId,
			keyHash: hash,
			keyPrefix: prefix,
			scopes: ["launch:*"],
		})
		.returning();

	if (!row) {
		throw new Error("failed to insert agent api key");
	}

	return { raw, row };
}

export async function lookupByRawKey(db: Database, raw: string): Promise<AgentApiKeyRow | null> {
	if (!isValidKeyShape(raw)) return null;
	const hash = hashKey(raw);
	const [row] = await db
		.select()
		.from(agentApiKeys)
		.where(and(eq(agentApiKeys.keyHash, hash), isNull(agentApiKeys.revokedAt)))
		.limit(1);
	return row ?? null;
}

export async function markUsed(db: Database, keyId: string): Promise<void> {
	await db.update(agentApiKeys).set({ lastUsedAt: new Date() }).where(eq(agentApiKeys.id, keyId));
}

export async function revokeKey(db: Database, keyId: string): Promise<void> {
	await db
		.update(agentApiKeys)
		.set({ revokedAt: new Date() })
		.where(and(eq(agentApiKeys.id, keyId), isNull(agentApiKeys.revokedAt)));
}

export async function listKeysForAgent(db: Database, agentId: string): Promise<Omit<AgentApiKeyRow, "keyHash">[]> {
	const rows = await db
		.select({
			id: agentApiKeys.id,
			agentId: agentApiKeys.agentId,
			keyPrefix: agentApiKeys.keyPrefix,
			scopes: agentApiKeys.scopes,
			createdAt: agentApiKeys.createdAt,
			revokedAt: agentApiKeys.revokedAt,
			lastUsedAt: agentApiKeys.lastUsedAt,
		})
		.from(agentApiKeys)
		.where(eq(agentApiKeys.agentId, agentId))
		.orderBy(desc(agentApiKeys.createdAt));
	return rows;
}
