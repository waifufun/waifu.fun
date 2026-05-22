import { getDatabase, patronWallets } from "@waifufun/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { SiweMessage } from "siwe";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import type { WalletChain } from "../../lib/patron-wallet.js";
import { type RequirePatronBindings, requirePatron } from "../../middleware/patron-auth.js";

type DbHandle = ReturnType<typeof getDatabase>["db"];

type LinkedSiweResult = {
	address: `0x${string}`;
	chainId: number;
	nonce: string;
	domain: string;
	uri: string;
	statement?: string | null | undefined;
	expirationTime?: string | null | undefined;
};

type LinkedSiweVerifier = (message: string, signature: string) => Promise<LinkedSiweResult>;

type NonceEntry = { nonce: string; address: string; expiresAt: number };

const linkNonces = new Map<string, NonceEntry>();
const NONCE_TTL_MS = 10 * 60 * 1000;
const WALLET_LINK_STATEMENT = "Link this wallet to your waifu.fun patron account.";
const WALLET_LINK_URI_PATH = "/patron/wallets";

let dbForTest: DbHandle | undefined;
let verifierForTest: LinkedSiweVerifier | undefined;

export function __setPatronWalletsDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

export function __setPatronWalletsSiweVerifierForTest(verifier: LinkedSiweVerifier | undefined): void {
	verifierForTest = verifier;
}

export function __clearPatronWalletsNoncesForTest(): void {
	linkNonces.clear();
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
	patron: {
		id: string;
		stewardUserId: string;
		email?: string | null;
		primaryAddress: string | null;
		primaryChain?: WalletChain | null;
	},
) {
	const wallets = await db
		.select({
			address: patronWallets.address,
			kind: patronWallets.kind,
			chainNamespace: patronWallets.chainNamespace,
			isPrimary: patronWallets.isPrimary,
			label: patronWallets.label,
			addedAt: patronWallets.addedAt,
			lastUsedAt: patronWallets.lastUsedAt,
		})
		.from(patronWallets)
		.where(eq(patronWallets.patronId, patron.id))
		.limit(100);

	const primaryWallet = wallets.find((wallet) => wallet.kind === "steward_primary" && wallet.isPrimary);
	const primary = primaryWallet?.address ?? patron.primaryAddress;
	const primaryChain = (primaryWallet?.chainNamespace as WalletChain | undefined) ?? patron.primaryChain;

	return {
		userId: patron.stewardUserId,
		primaryAddress: primary ?? null,
		primaryChain,
		patron: {
			id: patron.id,
			stewardUserId: patron.stewardUserId,
			email: patron.email ?? null,
			primaryAddress: primary ?? null,
			primaryChain,
		},
		linkedWallets: wallets.filter((wallet) => wallet.kind === "linked_eoa").map(walletToSummary),
	};
}

function expectedHosts(): Set<string> {
	const hosts = new Set(["waifu.fun", "www.waifu.fun"]);
	if (process.env.NODE_ENV !== "production") {
		hosts.add("localhost:3000");
		hosts.add("127.0.0.1:3000");
	}
	const raw = process.env.FRONTEND_URL ?? "https://waifu.fun";
	try {
		hosts.add(new URL(raw).host);
	} catch {
		// Keep defaults when FRONTEND_URL is malformed.
	}
	return hosts;
}

function nonceKey(patronId: string, address: string): string {
	return `${patronId}:${address.toLowerCase()}`;
}

function pruneLinkNonces(now = Date.now()): void {
	for (const [key, entry] of linkNonces) {
		if (entry.expiresAt <= now) linkNonces.delete(key);
	}
}

function issueLinkNonce(patronId: string, address: string): string {
	const now = Date.now();
	pruneLinkNonces(now);
	const nonce = crypto.randomUUID().replaceAll("-", "");
	linkNonces.set(nonceKey(patronId, address), { nonce, address: address.toLowerCase(), expiresAt: now + NONCE_TTL_MS });
	return nonce;
}

function consumeIssuedNonce(patronId: string, address: string, nonce: string): boolean {
	pruneLinkNonces();
	const key = nonceKey(patronId, address);
	const entry = linkNonces.get(key);
	if (!entry) return false;
	if (entry.address !== address.toLowerCase() || entry.nonce !== nonce) return false;
	linkNonces.delete(key);
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
		statement: result.data.statement,
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
	if (!expectedHosts().has(uri.host)) return "SIWE uri host is not allowed";
	if (verified.statement !== WALLET_LINK_STATEMENT) return "SIWE statement is not allowed";
	if (uri.pathname !== WALLET_LINK_URI_PATH) {
		return "SIWE uri path is not allowed";
	}
	if (!verified.expirationTime) return "SIWE expirationTime is required";
	if (Date.parse(verified.expirationTime) <= Date.now()) return "SIWE message expired";
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

	app.post("/wallets/link/nonce", async (c) => {
		const body = await c.req.json().catch(() => null);
		const parsed = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).safeParse(body);
		if (!parsed.success) return c.json({ ok: false, error: "INVALID_BODY", message: "invalid wallet nonce body" }, 400);
		const patron = c.get("patron");
		const address = lowerAddress(parsed.data.address);
		const nonce = issueLinkNonce(patron.id, address);
		return c.json({
			ok: true,
			nonce,
			expiresInSeconds: NONCE_TTL_MS / 1000,
			statement: WALLET_LINK_STATEMENT,
			uriPath: WALLET_LINK_URI_PATH,
		});
	});

	app.post("/wallets/link", async (c) => {
		const body = await c.req.json().catch(() => null);
		const parsed = linkBodySchema.safeParse(body);
		if (!parsed.success) return c.json({ ok: false, error: "INVALID_BODY", message: "invalid wallet link body" }, 400);

		const patron = c.get("patron");
		const address = lowerAddress(parsed.data.address);
		if (patron.primaryChain === "evm" && patron.primaryAddress && lowerAddress(patron.primaryAddress) === address) {
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
		if (!consumeIssuedNonce(patron.id, address, verified.nonce)) {
			return c.json({ ok: false, error: "INVALID_NONCE", message: "SIWE nonce was not issued or has expired" }, 400);
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
					chainNamespace: "evm",
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
