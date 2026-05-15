import { Hono } from "hono";
import { z } from "zod";

import { getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { verifySiweMessage } from "../../lib/auth-service.js";
import { issueRequestSiweNonce, validateRequestSiwe } from "../../lib/request-siwe.js";
import { requirePatron } from "../../middleware/patron-auth.js";

import {
	type BundleSubmitterDeps,
	createDefaultDeps,
	getBundle,
	submitBundle,
} from "../../services/bundle-submitter/index.js";

const addressSchema = z
	.string()
	.trim()
	.regex(/^0x[a-fA-F0-9]{40}$/u, "Expected a 20-byte EVM address")
	.transform((v) => v.toLowerCase() as `0x${string}`);

const siweProofSchema = z.object({
	message: z.string().min(1),
	signature: z.string().min(1),
});

const nonceBodySchema = z.object({
	address: addressSchema,
});

const submitSchema = z.object({
	rawTx: z
		.string()
		.regex(/^0x[0-9a-fA-F]+$/u, "rawTx must be a 0x-prefixed hex string")
		.min(4),
	deadline: z.number().int().positive(),
	fallbackPublic: z.boolean().optional(),
	chainId: z.number().int().positive().optional(),
	metadata: z.record(z.unknown()).optional(),
	creator: addressSchema,
	siwe: siweProofSchema,
});

const HASH_RE = /^0x[0-9a-fA-F]{64}$/u;

export interface BundleRoutesOptions {
	db?: Database;
	deps?: BundleSubmitterDeps;
	depsFactory?: () => Promise<BundleSubmitterDeps>;
	siweVerifier?: typeof verifySiweMessage;
}

const BUNDLE_SIWE_PURPOSE = "bundle:submit";
const BUNDLE_SIWE_STATEMENT = "sign to confirm bundle submission.";
const BUNDLE_SIWE_URI_PATH = "/bundles/submit";

export function createBundleRoutes(options: BundleRoutesOptions = {}) {
	const app = new Hono();

	app.post("/nonce", requirePatron() as never, async (c) => {
		const body = await c.req.json().catch(() => null);
		const parsed = nonceBodySchema.safeParse(body);
		if (!parsed.success) return c.json({ ok: false, error: "invalid address" }, 400);
		const patron = (c as unknown as { get(key: "patron"): { id: string } }).get("patron");
		return c.json({
			ok: true,
			nonce: issueRequestSiweNonce(patron.id, BUNDLE_SIWE_PURPOSE, parsed.data.address),
			expiresInSeconds: 600,
		});
	});

	app.post("/submit", requirePatron() as never, async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const parsed = submitSchema.safeParse(body);
		if (!parsed.success) {
			return c.json({ error: "invalid request", detail: parsed.error.flatten() }, 400);
		}

		const patron = (c as unknown as { get(key: "patron"): { id: string } }).get("patron");
		const siweError = await validateRequestSiwe({
			patronId: patron.id,
			purpose: BUNDLE_SIWE_PURPOSE,
			creator: parsed.data.creator,
			siwe: parsed.data.siwe,
			expectedStatement: BUNDLE_SIWE_STATEMENT,
			expectedUriPath: BUNDLE_SIWE_URI_PATH,
			verifier: options.siweVerifier ?? verifySiweMessage,
		});
		if (siweError) return c.json({ ok: false, error: "SIWE_VERIFICATION_FAILED", message: siweError }, 400);
		const { creator: _creator, siwe: _siwe, ...submitInput } = parsed.data;
		void _creator;
		void _siwe;

		const deps = options.deps ?? (await resolveDeps(options));
		if (!deps) return c.json({ error: "bundle submitter not configured" }, 503);

		try {
			const result = await submitBundle(deps, submitInput);
			return c.json(result);
		} catch (err) {
			return c.json(
				{
					error: "bundle submission failed",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}
	});

	app.get("/:hash", async (c) => {
		const hash = c.req.param("hash");
		if (!hash || !HASH_RE.test(hash)) {
			return c.json({ error: "invalid bundle hash" }, 400);
		}

		const db = options.db ?? options.deps?.db ?? requireDb();
		if (!db) return c.json({ error: "database unavailable" }, 503);

		try {
			const result = await getBundle(db, hash.toLowerCase());
			if (!result) return c.json({ error: "bundle not found" }, 404);
			return c.json(result);
		} catch (err) {
			return c.json(
				{
					error: "failed to load bundle",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}
	});

	return app;
}

async function resolveDeps(options: BundleRoutesOptions): Promise<BundleSubmitterDeps | null> {
	if (options.depsFactory) return options.depsFactory();
	const db = options.db ?? requireDb();
	if (!db) return null;
	try {
		return await createDefaultDeps({ db });
	} catch {
		return null;
	}
}

function requireDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export default createBundleRoutes();
