import { getDatabase, patronWallets } from "@waifufun/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { SiweMessage } from "siwe";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { type RequirePatronBindings, requirePatron } from "../../middleware/patron-auth.js";

type DbHandle = ReturnType<typeof getDatabase>["db"];

type LinkedSiweResult = {
	address: `0x${string}`;
	chainId: number;
	nonce: string;
	domain: string;
	uri: string;
	expirationTime?: string | null | undefined;
};

type LinkedSiweVerifier = (message: string, signature: string) => Promise<LinkedSiweResult>;

type NonceEntry = { expiresAt: number };

const usedNonces = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 10 * 60 * 1000;

let dbForTest: DbHandle | undefined;
let verifierForTest: LinkedSiweVerifier | undefined;

export function __setPatronWalletsDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

export function __setPatronWalletsSiweVerifierForTest(verifier: LinkedSiweVerifier | undefined): void {
	verifierForTest = verifier;
}

export function __clearPatronWalletsNoncesForTest(): void {
	usedNonces.clear();
}

function getDb(): DbHandle {
	return dbForTest ?? getDatabase().db;
}

function lowerAddress(address: string): `0x${string}` {
	return getAddress(address).toLowerCase() as `0x${string}`;
}

function walletToSummary(wallet: {
	address: string;
	label: string | null;
	addedAt: Date;
	lastUsedAt: Date | null;
}) {
	return {
		address: wallet.address as `0x${string}`,
		label: wallet.label,
		addedAt: wallet.addedAt.toISOString(),
		lastUsedAt: wallet.lastUsedAt ? wallet.lastUsedAt.toISOString() : null,
	};
}

async function buildPatronMe(
	db: DbHandle,
	patron: { id: string; stewardUserId: string; primaryAddress: `0x${string}` | null },
) {
	const wallets = await db
		.select({
			address: patronWallets.address,
			kind: patronWallets.kind,
			label: patronWallets.label,
			addedAt: patronWallets.addedAt,
			lastUsedAt: patronWallets.lastUsedAt,
		})
		.from(patronWallets)
		.where(eq(patronWallets.patronId, patron.id))
		.limit(100);

	const primary = wallets.find((wallet) => wallet.kind === "steward_primary")?.address ?? patron.primaryAddress;

	return {
		userId: patron.stewardUserId,
		primaryAddress: primary ? (primary as `0x${string}`) : null,
		linkedWallets: wallets.filter((wallet) => wallet.kind === "linked_eoa").map(walletToSummary),
	};
}

function expectedHosts(): Set<string> {
	const hosts = new Set(["waifu.fun", "www.waifu.fun"]);
	const raw = process.env.FRONTEND_URL ?? "https://waifu.fun";
	try {
		hosts.add(new URL(raw).host);
	} catch {
		// Keep defaults when FRONTEND_URL is malformed.
	}
	return hosts;
}

function consumeNonceOnce(patronId: string, address: string, nonce: string): boolean {
	const now = Date.now();
	for (const [key, entry] of usedNonces) {
		if (entry.expiresAt <= now) usedNonces.delete(key);
	}
	const key = `${patronId}:${address.toLowerCase()}:${nonce}`;
	if (usedNonces.has(key)) return false;
	usedNonces.set(key, { expiresAt: now + NONCE_TTL_MS });
	return true;
}

async function verifyLinkedSiwe(messageText: string, signature: string): Promise<LinkedSiweResult> {
	if (verifierForTest) return verifierForTest(messageText, signature);
	const message = new SiweMessage(messageText);
	const result = await message.verify({ signature });
	if (!result.success) throw new Error(result.error?.type ?? "SIWE verification failed");
	return {
		address: result.data.address as `0x${string}`,
		chainId: result.data.chainId,
		nonce: result.data.nonce,
		domain: result.data.domain,
		uri: result.data.uri,
		expirationTime: result.data.expirationTime,
	};
}

function validateLinkedSiwe(verified: LinkedSiweResult, expectedAddress: `0x${string}`): string | null {
	if (verified.chainId !== 56) return "SIWE chainId must be 56";
	if (lowerAddress(verified.address) !== expectedAddress) return "SIWE signer does not match address";
	if (!expectedHosts().has(verified.domain)) return "SIWE domain is not allowed";
	let uri: URL;
	try {
		uri = new URL(verified.uri);
	} catch {
		return "SIWE uri is invalid";
	}
	if (!expectedHosts().has(uri.host) || !uri.pathname.startsWith("/auth/")) {
		return "SIWE uri must be an auth path on waifu.fun";
	}
	if (verified.expirationTime && Date.parse(verified.expirationTime) <= Date.now()) return "SIWE message expired";
	return null;
}

const linkBodySchema = z.object({
	address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
	message: z.string().min(1),
	label: z.string().trim().min(1).max(80).optional(),
});

export function createV3PatronRoutes() {
	const app = new Hono<RequirePatronBindings>();
	app.use("*", requirePatron());

	app.get("/me", async (c) => {
		return c.json(await buildPatronMe(getDb(), c.get("patron")));
	});

	app.post("/wallets/link", async (c) => {
		const body = await c.req.json().catch(() => null);
		const parsed = linkBodySchema.safeParse(body);
		if (!parsed.success) return c.json({ ok: false, error: "INVALID_BODY", message: "invalid wallet link body" }, 400);

		const patron = c.get("patron");
		const address = lowerAddress(parsed.data.address);
		if (patron.primaryAddress && lowerAddress(patron.primaryAddress) === address) {
			return c.json({ ok: false, error: "PRIMARY_WALLET", message: "primary steward wallet cannot be linked" }, 409);
		}

		let verified: LinkedSiweResult;
		try {
			verified = await verifyLinkedSiwe(parsed.data.message, parsed.data.signature);
		} catch {
			return c.json({ ok: false, error: "SIWE_VERIFICATION_FAILED", message: "could not verify SIWE signature" }, 400);
		}

		const invalid = validateLinkedSiwe(verified, address);
		if (invalid) return c.json({ ok: false, error: "INVALID_SIWE", message: invalid }, 400);
		if (!consumeNonceOnce(patron.id, address, verified.nonce)) {
			return c.json({ ok: false, error: "NONCE_REPLAY", message: "SIWE nonce already used" }, 400);
		}

		const db = getDb();
		const existing = await db.select().from(patronWallets).where(eq(patronWallets.address, address)).limit(1);
		if (existing[0] && existing[0].patronId !== patron.id) {
			return c.json({ ok: false, error: "WALLET_IN_USE", message: "wallet already linked to another patron" }, 409);
		}
		if (existing[0]?.kind === "steward_primary") {
			return c.json({ ok: false, error: "PRIMARY_WALLET", message: "primary steward wallet cannot be linked" }, 409);
		}

		const now = new Date();
		if (existing[0]) {
			await db
				.update(patronWallets)
				.set({ label: parsed.data.label ?? existing[0].label ?? null, lastUsedAt: now })
				.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, address)));
		} else {
			await db
				.insert(patronWallets)
				.values({
					patronId: patron.id,
					address,
					chainId: 56,
					kind: "linked_eoa",
					label: parsed.data.label ?? null,
					lastUsedAt: now,
					isPrimary: false,
				})
				.returning();
		}

		return c.json(await buildPatronMe(db, patron));
	});

	app.delete("/wallets/link/:address", async (c) => {
		const rawAddress = c.req.param("address");
		if (!isAddress(rawAddress)) return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid address" }, 400);
		const patron = c.get("patron");
		const address = lowerAddress(rawAddress);
		const db = getDb();
		const existing = await db
			.select()
			.from(patronWallets)
			.where(and(eq(patronWallets.patronId, patron.id), eq(patronWallets.address, address)))
			.limit(1);
		if (!existing[0] || existing[0].kind === "steward_primary") {
			return c.json({ ok: false, error: "WALLET_NOT_FOUND", message: "linked wallet not found" }, 404);
		}
		const deleted = await db
			.delete(patronWallets)
			.where(
				and(
					eq(patronWallets.patronId, patron.id),
					eq(patronWallets.address, address),
					eq(patronWallets.kind, "linked_eoa"),
				),
			)
			.returning();
		if (deleted.length === 0)
			return c.json({ ok: false, error: "WALLET_NOT_FOUND", message: "linked wallet not found" }, 404);
		return c.json(await buildPatronMe(db, patron));
	});

	return app;
}

export default createV3PatronRoutes();
