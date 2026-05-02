import { agentPersonas, getDatabase, patronWallets } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppBindings } from "../../lib/bindings.js";
import { requirePatron } from "../../middleware/patron-auth.js";
import type { RequirePatronBindings } from "../../middleware/patron-auth.js";

const app = new Hono<AppBindings | RequirePatronBindings>();

type Db = ReturnType<typeof getDatabase>["db"];

function requireDb(): Db | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

app.get("/me", requirePatron(), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

	const patron = c.get("patron");
	const wallets = await db
		.select({
			id: patronWallets.id,
			address: patronWallets.address,
			chainId: patronWallets.chainId,
			kind: patronWallets.kind,
			label: patronWallets.label,
			addedAt: patronWallets.addedAt,
			linkedAt: patronWallets.linkedAt,
			lastUsedAt: patronWallets.lastUsedAt,
			isPrimary: patronWallets.isPrimary,
		})
		.from(patronWallets)
		.where(eq(patronWallets.patronId, patron.id));

	const [agentCountRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(agentPersonas)
		.where(eq(agentPersonas.ownerStewardUserId, patron.stewardUserId));

	const primaryAddress = wallets.find((wallet) => wallet.kind === "steward_primary")?.address ?? patron.primaryAddress;
	const linkedWallets = wallets
		.filter((wallet) => wallet.kind === "linked_eoa")
		.map((wallet) => ({
			address: wallet.address,
			label: wallet.label,
			addedAt: wallet.addedAt.toISOString(),
			lastUsedAt: wallet.lastUsedAt ? wallet.lastUsedAt.toISOString() : null,
		}));

	return c.json({
		ok: true,
		userId: patron.stewardUserId,
		primaryAddress,
		linkedWallets,
		patron,
		wallets: wallets.map((wallet) => ({
			...wallet,
			addedAt: wallet.addedAt.toISOString(),
			linkedAt: wallet.linkedAt.toISOString(),
			lastUsedAt: wallet.lastUsedAt ? wallet.lastUsedAt.toISOString() : null,
		})),
		agentCount: agentCountRow?.count ?? 0,
	});
});

app.get("/steward/status", requirePatron(), (c) => {
	const patron = c.get("patron");
	return c.json({
		connected: true,
		stewardUserId: patron.stewardUserId,
		email: patron.email,
	});
});

app.post("/steward/link", (c) =>
	c.json(
		{
			ok: false,
			error: "GONE",
			message: "Steward linking now happens via the OAuth callback. Use /auth/oauth/callback.",
		},
		410,
	),
);

export default app;
