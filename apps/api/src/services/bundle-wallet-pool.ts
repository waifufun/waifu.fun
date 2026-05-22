import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { schema } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { eq, sql } from "drizzle-orm";
import { type Address, type Hex, getAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface BundleWalletSelection {
	address: Address;
	encryptedPk: string;
}

export interface BundleWalletPoolOptions {
	minBalanceBnb?: string;
}

export const BUNDLE_WALLET_COOLDOWN_SECONDS = 90;
const DEFAULT_MIN_BALANCE_BNB = "0.5";
const LOW_BALANCE_WARN_BNB = 0.3;
const ENVELOPE_PREFIX = "bwp:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PLAINTEXT_KEYS_DISABLED_MESSAGE =
	"plaintext bundle wallet keys are disabled; re-encrypt existing bundle_wallet_pool.encrypted_pk rows with encryptBundleWalletPk after setting BUNDLE_KMS_KEY";
const MISSING_PRODUCTION_KMS_MESSAGE =
	"BUNDLE_KMS_KEY is required in production to encrypt bundle wallet keys; refusing to store plaintext private keys";

export async function selectAvailableWallet(
	db: Database,
	options: BundleWalletPoolOptions = {},
): Promise<BundleWalletSelection | null> {
	const minBalanceBnb = options.minBalanceBnb ?? DEFAULT_MIN_BALANCE_BNB;
	return db.transaction(async (tx) => {
		const rows = await tx.execute<{ address: string; encrypted_pk: string }>(sql`
			SELECT address, encrypted_pk
			FROM ${schema.bundleWalletPool}
			WHERE is_active = true
				AND (next_available_ts IS NULL OR next_available_ts <= NOW())
				AND balance_bnb >= (${minBalanceBnb})::numeric
			ORDER BY next_available_ts ASC NULLS FIRST, last_create_ts ASC NULLS FIRST, address ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		`);
		const row = rows[0];
		if (!row) return null;
		const address = normalizeAddress(row.address);
		const reservedAt = new Date();
		await tx
			.update(schema.bundleWalletPool)
			.set({
				nextAvailableTs: new Date(reservedAt.getTime() + BUNDLE_WALLET_COOLDOWN_SECONDS * 1000),
				updatedAt: reservedAt,
			})
			.where(eq(schema.bundleWalletPool.address, address));
		return { address: getAddress(row.address), encryptedPk: row.encrypted_pk };
	});
}

export async function markUsed(db: Database, address: string, createdAt: Date = new Date()): Promise<void> {
	await db
		.update(schema.bundleWalletPool)
		.set({
			lastCreateTs: createdAt,
			nextAvailableTs: new Date(createdAt.getTime() + BUNDLE_WALLET_COOLDOWN_SECONDS * 1000),
			updatedAt: createdAt,
		})
		.where(eq(schema.bundleWalletPool.address, normalizeAddress(address)));
}

export async function releaseWallet(db: Database, address: string, availableAt: Date = new Date()): Promise<void> {
	await db
		.update(schema.bundleWalletPool)
		.set({ nextAvailableTs: availableAt, updatedAt: availableAt })
		.where(eq(schema.bundleWalletPool.address, normalizeAddress(address)));
}

export async function refreshBalance(db: Database, address: string, bnb: string | number): Promise<void> {
	await db
		.update(schema.bundleWalletPool)
		.set({ balanceBnb: String(bnb), updatedAt: new Date() })
		.where(eq(schema.bundleWalletPool.address, normalizeAddress(address)));
}

export async function deactivate(db: Database, address: string, reason: string): Promise<void> {
	await db
		.update(schema.bundleWalletPool)
		.set({ isActive: false, notes: reason, updatedAt: new Date() })
		.where(eq(schema.bundleWalletPool.address, normalizeAddress(address)));
}

export async function listBundleWallets(
	db: Database,
): Promise<Array<{ address: Address; balanceBnb: number; nextAvailableTs: Date | null }>> {
	const rows = await db
		.select({
			address: schema.bundleWalletPool.address,
			balanceBnb: schema.bundleWalletPool.balanceBnb,
			nextAvailableTs: schema.bundleWalletPool.nextAvailableTs,
		})
		.from(schema.bundleWalletPool)
		.where(eq(schema.bundleWalletPool.isActive, true));
	return rows.map((row) => ({
		address: getAddress(row.address),
		balanceBnb: Number(row.balanceBnb ?? 0),
		nextAvailableTs: row.nextAvailableTs,
	}));
}

export async function warnLowBundleWalletBalances(
	db: Database,
	logger: Pick<Console, "warn" | "info"> = console,
	thresholdBnb = LOW_BALANCE_WARN_BNB,
): Promise<void> {
	const wallets = await listBundleWallets(db);
	for (const wallet of wallets) {
		if (wallet.balanceBnb < thresholdBnb) {
			logger.warn("[bundle-wallet-pool] wallet below funding threshold", {
				address: wallet.address,
				balanceBnb: wallet.balanceBnb,
				thresholdBnb,
			});
		}
	}
	logger.info("[bundle-wallet-pool] funding cron checked balances", { wallets: wallets.length, thresholdBnb });
}

export function normalizeAddress(address: string): Address {
	return getAddress(address).toLowerCase() as Address;
}

export function normalizePrivateKey(privateKey: string): Hex {
	const hex = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
	if (!isHex(hex) || hex.length !== 66) {
		throw new Error("expected a 32-byte private key");
	}
	return hex as Hex;
}

export function encryptBundleWalletPk(privateKey: string): string {
	const normalized = normalizePrivateKey(privateKey);
	const key = getBundleKmsKey();
	if (!key) {
		if (process.env.NODE_ENV === "production") {
			throw new Error(MISSING_PRODUCTION_KMS_MESSAGE);
		}
		return normalized;
	}
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
	const data = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${ENVELOPE_PREFIX}${Buffer.from(
		JSON.stringify({ iv: iv.toString("base64url"), data: data.toString("base64url"), tag: tag.toString("base64url") }),
	).toString("base64url")}`;
}

export interface DecryptBundleWalletPkOptions {
	allowPlaintext?: boolean;
}

export function decryptBundleWalletPk(encryptedPk: string, options: DecryptBundleWalletPkOptions = {}): Hex {
	if (encryptedPk.startsWith("0x") || /^[0-9a-fA-F]{64}$/u.test(encryptedPk)) {
		if (!options.allowPlaintext) {
			throw new Error(PLAINTEXT_KEYS_DISABLED_MESSAGE);
		}
		return normalizePrivateKey(encryptedPk);
	}
	if (!encryptedPk.startsWith(ENVELOPE_PREFIX)) {
		throw new Error("unsupported bundle wallet key envelope");
	}
	const key = getBundleKmsKey();
	if (!key) throw new Error("BUNDLE_KMS_KEY is required to decrypt bundle wallet keys");
	const payload = JSON.parse(Buffer.from(encryptedPk.slice(ENVELOPE_PREFIX.length), "base64url").toString("utf8")) as {
		iv: string;
		data: string;
		tag: string;
	};
	const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"), {
		authTagLength: TAG_BYTES,
	});
	decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
	return normalizePrivateKey(
		Buffer.concat([decipher.update(Buffer.from(payload.data, "base64url")), decipher.final()]).toString("utf8"),
	);
}

export function addressForPrivateKey(privateKey: string): Address {
	return privateKeyToAccount(normalizePrivateKey(privateKey)).address;
}

function getBundleKmsKey(): Buffer | null {
	const raw = process.env.BUNDLE_KMS_KEY ?? process.env.BUNDLE_KMS_KEY_HEX;
	if (!raw) return null;
	const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
	if (/^[0-9a-fA-F]{64}$/u.test(hex)) return Buffer.from(hex, "hex");
	return createHash("sha256").update(raw).digest();
}
