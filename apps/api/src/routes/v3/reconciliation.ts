import { getDatabase, reconciliationRegistrations } from "@waifufun/db";
import { Hono } from "hono";
import { getAddress, isAddress, verifyMessage } from "viem";
import { z } from "zod";

import { WAIFU_ELIGIBILITY } from "../../data/waifu-eligibility.js";

/**
 * $WAIFU wind-down reconciliation registration.
 *
 * Eligible holders (from the snapshot at `snapshot_block`) connect a wallet on
 * the /reconciliation page and sign a message to book their spot. This route
 * verifies the signature recovers to the claimed address, confirms eligibility
 * server-side (the client list is advisory; this is authoritative), and records
 * the signed attestation. The merkle claim contract built after the window
 * settles payouts; this is the off-chain booking record.
 */

const ELIGIBILITY = WAIFU_ELIGIBILITY;

/** The canonical statement line every reconciliation message must contain. */
const CANONICAL_STATEMENT = "$WAIFU reconciliation claim registration";

/**
 * The signed message is built client-side with a varying origin + issuedAt, so
 * we validate the parts that bind intent: the canonical header, the wallet, and
 * the eligible amount. This stops a stray prior `personal_sign` from an eligible
 * wallet being replayed here as an unrelated "registration".
 */
function messageBindsRegistration(message: string, address: string, amountBnb: number): boolean {
	if (!message.includes(CANONICAL_STATEMENT)) return false;
	if (!message.toLowerCase().includes(address.toLowerCase())) return false;
	if (!message.includes(`${amountBnb} BNB`)) return false;
	return true;
}

const registerSchema = z.object({
	address: z.string().refine(isAddress, "invalid address"),
	message: z.string().min(1).max(2000),
	signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, "invalid signature"),
	issuedAt: z.string().optional(),
});

type DbHandle = ReturnType<typeof getDatabase>["db"];
let dbForTest: DbHandle | undefined;
export function __setReconciliationDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}
function getDb(): DbHandle {
	return dbForTest ?? getDatabase().db;
}

export function createV3ReconciliationRoutes(): Hono {
	const app = new Hono();

	// Public summary: pot, snapshot block, eligible count.
	app.get("/summary", (c) =>
		c.json({
			snapshotBlock: ELIGIBILITY.snapshot_block,
			potBnb: ELIGIBILITY.pot_bnb,
			totalPayoutBnb: ELIGIBILITY.total_payout_bnb,
			eligibleCount: ELIGIBILITY.count,
		}),
	);

	// Eligibility lookup for one address (no signature needed; read-only).
	app.get("/eligibility/:address", (c) => {
		const raw = c.req.param("address");
		if (!isAddress(raw)) return c.json({ error: "invalid address" }, 400);
		const key = raw.toLowerCase();
		const amount = ELIGIBILITY.eligible[key] ?? 0;
		return c.json({ address: key, eligible: amount > 0, amountBnb: amount });
	});

	// Sign-to-register: verify signature, confirm eligibility, upsert.
	app.post("/register", async (c) => {
		const body = await c.req.json().catch(() => null);
		const parsed = registerSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ ok: false, error: "BAD_REQUEST", message: "invalid registration payload" }, 400);
		}
		const { address, message, signature } = parsed.data;
		const key = address.toLowerCase();

		// 1) eligibility (server-side authoritative)
		const amount = ELIGIBILITY.eligible[key] ?? 0;
		if (amount <= 0) {
			return c.json({ ok: false, error: "NOT_ELIGIBLE", message: "address is not in the reconciliation set" }, 403);
		}

		// 2) message must be a real reconciliation attestation for THIS wallet +
		// amount (not a replayed unrelated personal_sign)
		if (!messageBindsRegistration(message, key, amount)) {
			return c.json(
				{ ok: false, error: "BAD_MESSAGE", message: "message is not a valid reconciliation attestation" },
				400,
			);
		}

		// 3) signature must recover to the claimed address
		let valid = false;
		try {
			valid = await verifyMessage({ address: getAddress(address), message, signature: signature as `0x${string}` });
		} catch {
			valid = false;
		}
		if (!valid) {
			return c.json({ ok: false, error: "BAD_SIGNATURE", message: "signature does not match address" }, 400);
		}

		// 4) upsert the registration (one row per address; re-signing updates it)
		const db = getDb();
		await db
			.insert(reconciliationRegistrations)
			.values({
				address: key,
				amountBnb: String(amount),
				message,
				signature,
				snapshotBlock: ELIGIBILITY.snapshot_block,
			})
			.onConflictDoUpdate({
				target: reconciliationRegistrations.address,
				set: { message, signature, amountBnb: String(amount), registeredAt: new Date() },
			});

		return c.json({ ok: true, address: key, amountBnb: amount });
	});

	return app;
}

export default createV3ReconciliationRoutes();
