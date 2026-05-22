import { getDatabase, patronWallets } from "@waifufun/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { generateNonce } from "siwe";
import { z } from "zod";

import { validateSiweContext, verifySiweMessage } from "../../lib/auth-service.js";
import { type RequirePatronBindings, requirePatron } from "../../middleware/patron-auth.js";

type DbHandle = ReturnType<typeof getDatabase>["db"];
type SiweVerifier = typeof verifySiweMessage;

type NonceEntry = { nonce: string; address: string; expiresAt: number };
const NONCE_STORE = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 10 * 60 * 1000;
const WALLET_BIND_SIWE_PURPOSE = "wallet:bind";

let dbForTest: DbHandle | undefined;
let verifierForTest: SiweVerifier | undefined;

export function __setAuthSiweDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

export function __setAuthSiweVerifierForTest(verifier: SiweVerifier | undefined): void {
	verifierForTest = verifier;
}

export function __clearAuthSiweNoncesForTest(): void {
	NONCE_STORE.clear();
}

function getDb(): DbHandle {
	return dbForTest ?? getDatabase().db;
}

function verifier(): SiweVerifier {
	return verifierForTest ?? verifySiweMessage;
}

function nonceKey(patronId: string, purpose: string, address: string): string {
	return `${purpose}:${patronId}:${address.toLowerCase()}`;
}

function setNonce(patronId: string, address: string): string {
	const nonce = generateNonce();
	NONCE_STORE.set(nonceKey(patronId, WALLET_BIND_SIWE_PURPOSE, address), {
		nonce,
		address: address.toLowerCase(),
		expiresAt: Date.now() + NONCE_TTL_MS,
	});
	return nonce;
}

function consumePatronNonce(patronId: string, address: string, nonce: string): boolean {
	const key = nonceKey(patronId, WALLET_BIND_SIWE_PURPOSE, address);
	const entry = NONCE_STORE.get(key);
	if (!entry) return false;
	if (entry.nonce !== nonce) return false;
	if (entry.address !== address.toLowerCase()) return false;
	if (Date.now() > entry.expiresAt) {
		NONCE_STORE.delete(key);
		return false;
	}
	NONCE_STORE.delete(key);
	return true;
}

const nonceRequestSchema = z.object({
	address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

const bindSchema = z.object({
	message: z.string(),
	signature: z.string(),
	setPrimary: z.boolean().optional(),
});

const WALLET_BIND_STATEMENT = "Link this wallet to your waifu.fun patron account.";
const WALLET_BIND_URI_PATH = "/patron/wallets";

export const authSiweRoutes = new Hono<RequirePatronBindings>();

authSiweRoutes.use("*", requirePatron());

authSiweRoutes.post("/nonce", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = nonceRequestSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ ok: false, error: "invalid address" }, 400);
	}

	const patron = c.get("patron");
	const nonce = setNonce(patron.id, parsed.data.address);
	return c.json({ ok: true, nonce, expiresInSeconds: 600 });
});

authSiweRoutes.post("/bind", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = bindSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ ok: false, error: "invalid body" }, 400);
	}

	const patron = c.get("patron");
	let verified: Awaited<ReturnType<SiweVerifier>>;
	try {
		verified = await verifier()(parsed.data.message, parsed.data.signature);
	} catch {
		return c.json({ ok: false, error: "siwe verification failed" }, 400);
	}

	const contextError = validateSiweContext(parsed.data.message, {
		expectedChainId: 56,
		expectedStatement: WALLET_BIND_STATEMENT,
		expectedUriPath: WALLET_BIND_URI_PATH,
	});
	if (contextError) {
		return c.json({ ok: false, error: contextError }, 400);
	}

	if (!consumePatronNonce(patron.id, verified.address, verified.nonce)) {
		return c.json({ ok: false, error: "nonce mismatch or expired" }, 400);
	}

	const address = verified.address.toLowerCase();
	const chainId = verified.chainId ?? 56;
	const db = getDb();

	const existing = await db.select().from(patronWallets).where(eq(patronWallets.address, address)).limit(1);

	if (existing.length > 0 && existing[0]?.patronId !== patron.id) {
		return c.json({ ok: false, error: "wallet already bound to another patron" }, 409);
	}

	if (existing.length === 0) {
		if (parsed.data.setPrimary) {
			await db.update(patronWallets).set({ isPrimary: false }).where(eq(patronWallets.patronId, patron.id));
		}
		await db.insert(patronWallets).values({
			patronId: patron.id,
			address,
			chainId,
			isPrimary: parsed.data.setPrimary ?? false,
		});
	} else if (parsed.data.setPrimary) {
		await db.update(patronWallets).set({ isPrimary: false }).where(eq(patronWallets.patronId, patron.id));
		await db
			.update(patronWallets)
			.set({ isPrimary: true })
			.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, address)));
	}

	return c.json({ ok: true, address, chainId });
});

authSiweRoutes.get("/wallets", async (c) => {
	const patron = c.get("patron");
	const wallets = await getDb().select().from(patronWallets).where(eq(patronWallets.patronId, patron.id)).limit(100);
	return c.json({ ok: true, wallets });
});

authSiweRoutes.delete("/wallets/:address", async (c) => {
	const patron = c.get("patron");
	const address = c.req.param("address").toLowerCase();
	const deleted = await getDb()
		.delete(patronWallets)
		.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, address)))
		.returning();

	if (deleted.length === 0) {
		return c.json({ ok: false, error: "wallet not found" }, 404);
	}
	return c.json({ ok: true });
});

authSiweRoutes.post("/wallets/:address/primary", async (c) => {
	const patron = c.get("patron");
	const address = c.req.param("address").toLowerCase();
	const db = getDb();
	const exists = await db
		.select()
		.from(patronWallets)
		.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, address)))
		.limit(1);

	if (exists.length === 0) return c.json({ ok: false, error: "wallet not found" }, 404);

	await db.update(patronWallets).set({ isPrimary: false }).where(eq(patronWallets.patronId, patron.id));
	await db
		.update(patronWallets)
		.set({ isPrimary: true })
		.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, address)));
	return c.json({ ok: true });
});

export default authSiweRoutes;
