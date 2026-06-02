import { Hono } from "hono";
import type { Context } from "hono";

import {
	DEFAULT_SETTLEMENT_MODE,
	type Database,
	type SettlementMode,
	agentApps,
	agentPersonas,
	getDatabase,
	getEscrowThresholdUsd,
	getSettlementMode,
	isSettlementMode,
} from "@waifufun/db";
import { and, eq, sql } from "drizzle-orm";

import { type StewardAuthPrincipal, verifyStewardJwt } from "../../middleware/steward-auth.js";

const app = new Hono();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_IMAGE_GEN_MARKUP_PERCENTAGE = 100;
const DEFAULT_IMAGE_GEN_MODEL = "google/gemini-2.5-flash-image";
const DEFAULT_AUTO_ESCROW_THRESHOLD_USD = 1;
const VALID_ASPECTS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);

type JsonRecord = Record<string, unknown>;

type AppAuth =
	| { mode: "steward"; principal: StewardAuthPrincipal }
	| { mode: "agent-app-key"; principal: { userId: string } };

export type ImageGenBody = {
	prompt?: unknown;
	style?: unknown;
	aspect?: unknown;
	idempotencyKey?: unknown;
};

type AppsRouteDepsForTest = {
	db: Database | undefined;
	auth: AppAuth | undefined;
	createElizaImageApp: typeof createElizaImageApp | undefined;
	generateImageThroughEliza: typeof generateImageThroughEliza | undefined;
	fetchElizaEarnings: typeof fetchElizaEarnings | undefined;
};

const appsRouteDepsForTest: AppsRouteDepsForTest = {
	db: undefined,
	auth: undefined,
	createElizaImageApp: undefined,
	generateImageThroughEliza: undefined,
	fetchElizaEarnings: undefined,
};

export function __setAppsRouteDepsForTest(deps: Partial<AppsRouteDepsForTest>): void {
	appsRouteDepsForTest.db = deps.db;
	appsRouteDepsForTest.auth = deps.auth;
	appsRouteDepsForTest.createElizaImageApp = deps.createElizaImageApp;
	appsRouteDepsForTest.generateImageThroughEliza = deps.generateImageThroughEliza;
	appsRouteDepsForTest.fetchElizaEarnings = deps.fetchElizaEarnings;
}

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	if (appsRouteDepsForTest.db) return appsRouteDepsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function getBearer(header: string | undefined): string | null {
	if (!header) return null;
	const [scheme, token] = header.trim().split(/\s+/, 2);
	return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function authenticate(c: Context): Promise<AppAuth | Response> {
	if (appsRouteDepsForTest.auth) return appsRouteDepsForTest.auth;
	const configuredInvokeKey = process.env.WAIFU_APP_INVOKE_KEY?.trim();
	const presentedInvokeKey = c.req.header("x-waifu-app-invoke-key")?.trim();
	if (configuredInvokeKey && presentedInvokeKey && presentedInvokeKey === configuredInvokeKey) {
		return { mode: "agent-app-key", principal: { userId: "agent-runtime" } };
	}

	const bearer = getBearer(c.req.header("authorization") ?? c.req.header("Authorization"));
	if (!bearer) {
		return c.json(
			{ ok: false, error: "UNAUTHORIZED", message: "steward bearer token or app invoke key required" },
			401,
		);
	}
	const principal = await verifyStewardJwt(bearer);
	if (!principal) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "invalid steward bearer token" }, 401);
	}
	return { mode: "steward", principal };
}

function principalWallets(principal: StewardAuthPrincipal): string[] {
	const wallets =
		principal.wallets?.map((wallet) => wallet.address).filter((address) => ADDRESS_RE.test(address)) ?? [];
	if (principal.address && ADDRESS_RE.test(principal.address)) wallets.push(principal.address);
	return wallets.map((address) => address.toLowerCase());
}

async function assertCanRegisterApp(
	db: NonNullable<ReturnType<typeof requireDb>>,
	tokenAddress: string,
	auth: AppAuth,
): Promise<{ ok: true } | { ok: false; status: 403 | 404; message: string }> {
	if (auth.mode === "agent-app-key") {
		return { ok: false, status: 403, message: "app invoke key cannot register apps" };
	}

	const rows = await db
		.select({
			id: agentPersonas.id,
			agentId: agentPersonas.agentId,
			ownerStewardUserId: agentPersonas.ownerStewardUserId,
			ownerAddress: agentPersonas.ownerAddress,
			tokenAddress: agentPersonas.tokenAddress,
		})
		.from(agentPersonas)
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${tokenAddress}`)
		.limit(1);
	const agent = rows[0];
	if (!agent) return { ok: false, status: 404, message: "agent token not found" };

	const stewardMatch = agent.ownerStewardUserId !== null && agent.ownerStewardUserId === auth.principal.userId;
	const ownerAddress = agent.ownerAddress?.toLowerCase() ?? null;
	const addressMatch = ownerAddress !== null && principalWallets(auth.principal).includes(ownerAddress);
	if (!stewardMatch && !addressMatch) {
		return { ok: false, status: 403, message: "caller does not own this agent" };
	}
	return { ok: true };
}

function metadataRecord(metadata: unknown): JsonRecord {
	return metadata && typeof metadata === "object" ? (metadata as JsonRecord) : {};
}

function stringFromMetadata(metadata: unknown, key: string): string | null {
	const value = metadataRecord(metadata)[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function settlementModeFromRegisterBody(body: JsonRecord): SettlementMode {
	if (isSettlementMode(body.settlementMode)) return body.settlementMode;
	return isSettlementMode(body.settlement) ? body.settlement : DEFAULT_SETTLEMENT_MODE;
}

function isEscrowEnabled(): boolean {
	return process.env.ENABLE_ERC8183_ESCROW === "true" || process.env.ENABLE_ERC8183_ESCROW === "1";
}

function nonNegativeNumber(value: unknown): number | null {
	const number = typeof value === "number" ? value : Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

function estimatedSettlementCostUsd(metadata: unknown): number {
	const record = metadataRecord(metadata);
	return nonNegativeNumber(record.estimatedCostUsd ?? record.pricePerUseUsd ?? record.priceUsd) ?? 0;
}

function shouldUseEscrowForSettlement(metadata: unknown, estimatedCostUsd: number): boolean {
	const mode = getSettlementMode(metadata);
	if (mode === "escrow") return true;
	if (mode === "credits") return false;
	// `auto` keeps today's credits path below the manifest threshold and routes
	// higher-value jobs through the future ERC-8183 escrow seam. The default
	// threshold is intentionally conservative and can be overridden per app via
	// `metadata.escrowThresholdUsd` once real pricing is available.
	return estimatedCostUsd >= getEscrowThresholdUsd(metadata, DEFAULT_AUTO_ESCROW_THRESHOLD_USD);
}

type EscrowSettlementInput = {
	appId: string;
	agentTokenAddress: string;
	prompt: string;
	aspect: string;
	estimatedCostUsd: number;
};

async function settleViaEscrow(_input: EscrowSettlementInput): Promise<never> {
	// TODO(W-2B): wire this boundary to @stwd/erc8183 once the package and
	// on-chain job settlement flow are published. Do not broadcast here until the
	// W-2B integration owns chain selection, signing, receipts, and retries.
	throw new Error("not implemented — see @stwd/erc8183 (W-2B)");
}

export function normalizePrompt(
	body: ImageGenBody,
): { prompt: string; style: string | null; aspect: string } | { error: string } {
	const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
	if (prompt.length < 3 || prompt.length > 1800) return { error: "prompt must be 3 to 1800 characters" };
	const style = typeof body.style === "string" && body.style.trim() ? body.style.trim().slice(0, 240) : null;
	const aspect = typeof body.aspect === "string" && VALID_ASPECTS.has(body.aspect) ? body.aspect : "1:1";
	return { prompt, style, aspect };
}

export function composePrompt(input: { prompt: string; style: string | null }): string {
	if (!input.style) return input.prompt;
	return `${input.prompt}\n\nStyle: ${input.style}`;
}

function elizaCloudBaseUrl(): string {
	return (process.env.ELIZA_CLOUD_BASE_URL ?? "https://api.elizacloud.ai").replace(/\/+$/, "");
}

function elizaCloudCreatorApiKey(): string | null {
	return (
		(
			process.env.ELIZA_CLOUD_API_KEY ??
			process.env.ELIZAOS_CLOUD_API_KEY ??
			process.env.ELIZAOS_API_KEY ??
			process.env.ELIZA_CLOUD_APPS_API_KEY ??
			null
		)?.trim() || null
	);
}

function elizaCloudCallerApiKey(c: Context): string | null {
	const headerKey = c.req.header("x-eliza-cloud-api-key")?.trim();
	if (headerKey) return headerKey;
	return process.env.ELIZA_CLOUD_IMAGE_GEN_CALLER_API_KEY?.trim() || null;
}

async function elizaJson<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${elizaCloudBaseUrl()}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
	const json = (await res.json().catch(() => null)) as JsonRecord | null;
	if (!res.ok) {
		const detail = json?.error || json?.message || res.statusText;
		throw new Error(`Eliza Cloud request failed (${res.status}): ${String(detail).slice(0, 240)}`);
	}
	return json as T;
}

type ElizaCreateAppResponse = {
	success?: boolean;
	app?: { id?: string; name?: string; inference_markup_percentage?: number; monetization_enabled?: boolean };
};

type ElizaImageResponse = {
	success?: boolean;
	appId?: string;
	model?: string;
	images?: Array<{ image?: string; url?: string; text?: string }>;
	cost?: unknown;
	charge: {
		status?: string;
		currency?: string;
		baseCost?: number;
		creatorMarkup?: number;
		totalCost?: number;
		creatorEarnings?: number;
		balance?: number;
	};
};

type ElizaEarningsResponse = {
	success?: boolean;
	earnings?: {
		summary?: { totalLifetimeEarnings?: number | string };
		breakdown?: {
			today?: { total?: number | string };
			thisWeek?: { total?: number | string };
			allTime?: { total?: number | string };
		};
	};
	monetization?: { totalCreatorEarnings?: number | string };
};

function toUsdString(value: unknown): string {
	const number = typeof value === "number" || typeof value === "string" ? Number(value) : 0;
	return (Number.isFinite(number) ? number : 0).toFixed(6);
}

async function createElizaImageApp(input: {
	tokenAddress: string;
	name: string;
	description: string;
	appUrl: string;
	markupPercentage: number;
}): Promise<string> {
	const apiKey = elizaCloudCreatorApiKey();
	if (!apiKey)
		throw new Error("ELIZA_CLOUD_API_KEY or ELIZAOS_CLOUD_API_KEY is required to register the Eliza Cloud app");
	const response = await elizaJson<ElizaCreateAppResponse>("/api/v1/apps", apiKey, {
		method: "POST",
		body: JSON.stringify({
			name: `${input.name} ${input.tokenAddress.slice(2, 8)}`.slice(0, 100),
			description: input.description,
			app_url: input.appUrl,
			skipGitHubRepo: true,
			monetization_enabled: true,
			inference_markup_percentage: input.markupPercentage,
		}),
	});
	const id = response.app?.id;
	if (!id) throw new Error("Eliza Cloud app registration did not return an app id");
	return id;
}

async function generateImageThroughEliza(input: {
	apiKey: string;
	elizaCloudAppId: string;
	prompt: string;
	aspect: string;
}): Promise<ElizaImageResponse> {
	const response = await elizaJson<ElizaImageResponse>(
		`/api/v1/apps/${input.elizaCloudAppId}/generate-image`,
		input.apiKey,
		{
			method: "POST",
			body: JSON.stringify({
				prompt: input.prompt,
				model: process.env.WAIFU_IMAGE_GEN_ELIZA_MODEL ?? DEFAULT_IMAGE_GEN_MODEL,
				numImages: 1,
				aspectRatio: input.aspect,
			}),
		},
	);
	const firstImage = response.images?.[0];
	const imageUrl = firstImage?.url ?? firstImage?.image;
	if (!response.success || !imageUrl) {
		throw new Error("Eliza Cloud image generation did not return an image");
	}
	if (response.charge?.status !== "charged" || typeof response.charge.totalCost !== "number") {
		throw new Error("Eliza Cloud image generation did not return a settled charged receipt");
	}
	return response;
}

async function fetchElizaEarnings(elizaCloudAppId: string): Promise<ElizaEarningsResponse | null> {
	const apiKey = elizaCloudCreatorApiKey();
	if (!apiKey) return null;
	return await elizaJson<ElizaEarningsResponse>(`/api/v1/apps/${elizaCloudAppId}/earnings?days=30`, apiKey, {
		method: "GET",
	});
}

/**
 * Recognise an exhausted-credit / payment-required failure from the Eliza
 * Cloud charge. `elizaJson` throws `Eliza Cloud request failed (402): ...` for
 * an upstream 402; we also catch common insufficient-balance phrasings so a
 * non-402 status carrying the same meaning still maps to a 402 for the client.
 */
export function isInsufficientCreditsError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err ?? "");
	if (/\(402\)/.test(message)) return true;
	return /insufficient\s+(credits?|balance|funds)|payment\s+required|out\s+of\s+credits/i.test(message);
}

function imageGenAppUrl(tokenAddress: string): string {
	const base = (process.env.WAIFU_API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun").replace(
		/\/+$/,
		"",
	);
	return `${base}/v2/agents/${tokenAddress}/apps/image-gen/invoke`;
}

app.post("/agents/:token/apps/image-gen/register", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
	const tokenAddress = c.req.param("token").toLowerCase();
	if (!ADDRESS_RE.test(tokenAddress))
		return c.json({ ok: false, error: "BAD_REQUEST", message: "invalid token address" }, 400);

	const auth = await authenticate(c);
	if (auth instanceof Response) return auth;
	const ownership = await assertCanRegisterApp(db, tokenAddress, auth);
	if (!ownership.ok)
		return c.json(
			{ ok: false, error: ownership.status === 404 ? "NOT_FOUND" : "FORBIDDEN", message: ownership.message },
			ownership.status,
		);

	const body = (await c.req.json().catch(() => ({}))) as JsonRecord;
	const rawMarkup = Number(
		body.inferenceMarkupPercentage ??
			process.env.WAIFU_IMAGE_GEN_INFERENCE_MARKUP_PERCENTAGE ??
			DEFAULT_IMAGE_GEN_MARKUP_PERCENTAGE,
	);
	const inferenceMarkupPercentage =
		Number.isFinite(rawMarkup) && rawMarkup >= 0 ? rawMarkup : DEFAULT_IMAGE_GEN_MARKUP_PERCENTAGE;
	const now = new Date();
	const appUrl = imageGenAppUrl(tokenAddress);
	const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "Image Generator";
	const description =
		typeof body.description === "string" && body.description.trim()
			? body.description.trim().slice(0, 300)
			: "Generate images from prompts through this agent. Calls are metered by Eliza Cloud credits.";
	const existingRows = await db
		.select()
		.from(agentApps)
		.where(and(eq(agentApps.agentTokenAddress, tokenAddress), eq(agentApps.appId, "image-gen")))
		.limit(1);
	const existingElizaAppId = stringFromMetadata(existingRows[0]?.metadata, "elizaCloudAppId");
	const elizaCloudAppId =
		existingElizaAppId ??
		(await (appsRouteDepsForTest.createElizaImageApp ?? createElizaImageApp)({
			tokenAddress,
			name,
			description,
			appUrl,
			markupPercentage: inferenceMarkupPercentage,
		}));
	const settlementMode = settlementModeFromRegisterBody(body);
	const escrowThresholdUsd = nonNegativeNumber(body.escrowThresholdUsd) ?? DEFAULT_AUTO_ESCROW_THRESHOLD_USD;
	const estimatedCostUsd = nonNegativeNumber(body.estimatedCostUsd ?? body.pricePerUseUsd ?? body.priceUsd) ?? 0;

	const values = {
		agentTokenAddress: tokenAddress,
		appId: "image-gen",
		name,
		description,
		icon: typeof body.icon === "string" && body.icon.trim() ? body.icon.trim().slice(0, 80) : "image",
		appUrl,
		status: "live" as const,
		shippedAt: now,
		metadata: {
			kind: "agent-mini-app",
			category: "image-generation",
			settlementMode,
			escrowThresholdUsd,
			estimatedCostUsd,
			currency: "USD",
			unit: "image",
			endpoint: appUrl,
			provider: "eliza-cloud",
			model: process.env.WAIFU_IMAGE_GEN_ELIZA_MODEL ?? DEFAULT_IMAGE_GEN_MODEL,
			billingReality: "eliza_cloud_metered",
			elizaCloudAppId,
			inferenceMarkupPercentage,
			cloudCallable: true,
			readCacheSource: "eliza-cloud-earnings",
		},
		updatedAt: now,
	};

	const rows = await db
		.insert(agentApps)
		.values(values)
		.onConflictDoUpdate({
			target: [agentApps.agentTokenAddress, agentApps.appId],
			set: {
				name: values.name,
				description: values.description,
				icon: values.icon,
				appUrl: values.appUrl,
				status: values.status,
				shippedAt: values.shippedAt,
				metadata: sql`coalesce(${agentApps.metadata}, '{}'::jsonb) || ${JSON.stringify(values.metadata)}::jsonb || jsonb_build_object('idempotencyKeys', coalesce(${agentApps.metadata}->'idempotencyKeys', '[]'::jsonb))`,
				updatedAt: now,
			},
		})
		.returning();

	const row = rows[0];
	return c.json({ ok: true, data: { app: row ? { ...row, id: row.id.toString() } : null } });
});

app.post("/agents/:token/apps/image-gen/invoke", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
	const tokenAddress = c.req.param("token").toLowerCase();
	if (!ADDRESS_RE.test(tokenAddress))
		return c.json({ ok: false, error: "BAD_REQUEST", message: "invalid token address" }, 400);

	const auth = await authenticate(c);
	if (auth instanceof Response) return auth;

	const rows = await db
		.select()
		.from(agentApps)
		.where(and(eq(agentApps.agentTokenAddress, tokenAddress), eq(agentApps.appId, "image-gen")))
		.limit(1);
	const existing = rows[0];
	if (!existing || existing.status !== "live") {
		return c.json(
			{ ok: false, error: "NOT_FOUND", message: "image-gen app is not registered or not live for this agent" },
			404,
		);
	}

	const body = (await c.req.json().catch(() => ({}))) as ImageGenBody;
	const normalized = normalizePrompt(body);
	if ("error" in normalized) return c.json({ ok: false, error: "BAD_REQUEST", message: normalized.error }, 400);

	const metadata = metadataRecord(existing.metadata);
	const settlementMode = getSettlementMode(metadata);
	const estimatedCostUsd = estimatedSettlementCostUsd(metadata);
	if (shouldUseEscrowForSettlement(metadata, estimatedCostUsd)) {
		if (!isEscrowEnabled()) {
			return c.json(
				{
					ok: false,
					error: "ESCROW_SETTLEMENT_NOT_YET_ENABLED",
					message: "ERC-8183 escrow settlement is flag-gated and not enabled for mini-app invocations yet.",
					settlementMode,
				},
				501,
			);
		}
		try {
			await settleViaEscrow({
				appId: "image-gen",
				agentTokenAddress: tokenAddress,
				prompt: normalized.prompt,
				aspect: normalized.aspect,
				estimatedCostUsd,
			});
		} catch (err) {
			if (err instanceof Error && err.message.includes("not implemented")) {
				return c.json(
					{
						ok: false,
						error: "ESCROW_SETTLEMENT_NOT_YET_ENABLED",
						message: "ERC-8183 escrow settlement is still stubbed pending @stwd/erc8183 W-2B wiring.",
						settlementMode,
					},
					501,
				);
			}
			throw err;
		}
	}
	const elizaCloudAppId = stringFromMetadata(metadata, "elizaCloudAppId");
	if (!elizaCloudAppId) {
		return c.json({ ok: false, error: "MISCONFIGURED", message: "image-gen app is missing Eliza Cloud app id" }, 503);
	}
	const callerKey = elizaCloudCallerApiKey(c);
	if (!callerKey) {
		return c.json(
			{
				ok: false,
				error: "MISCONFIGURED",
				message: "Eliza Cloud caller API key is required for metered image generation",
			},
			503,
		);
	}
	const idempotencyKey =
		typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
			? body.idempotencyKey.trim().slice(0, 120)
			: crypto.randomUUID();

	const reservation = await db
		.update(agentApps)
		.set({
			metadata: sql`jsonb_set(coalesce(${agentApps.metadata}, '{}'::jsonb), '{idempotencyKeys}', coalesce(${agentApps.metadata}->'idempotencyKeys', '[]'::jsonb) || jsonb_build_array(${idempotencyKey}), true)`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(agentApps.agentTokenAddress, tokenAddress),
				eq(agentApps.appId, "image-gen"),
				sql`not (coalesce(${agentApps.metadata}->'idempotencyKeys', '[]'::jsonb) ? ${idempotencyKey})`,
			),
		)
		.returning({ id: agentApps.id });
	if (reservation.length === 0) {
		return c.json(
			{
				ok: false,
				error: "DUPLICATE_IDEMPOTENCY_KEY",
				message: "this image-gen idempotencyKey is already reserved or recorded for this app",
			},
			409,
		);
	}

	let generated: Awaited<ReturnType<typeof generateImageThroughEliza>>;
	try {
		generated = await (appsRouteDepsForTest.generateImageThroughEliza ?? generateImageThroughEliza)({
			apiKey: callerKey,
			elizaCloudAppId,
			prompt: composePrompt(normalized),
			aspect: normalized.aspect,
		});
	} catch (err) {
		// Release the idempotency reservation so the caller can retry once the
		// underlying issue (e.g. topped-up credits) is resolved.
		await db
			.update(agentApps)
			.set({
				metadata: sql`jsonb_set(coalesce(${agentApps.metadata}, '{}'::jsonb), '{idempotencyKeys}', coalesce(${agentApps.metadata}->'idempotencyKeys', '[]'::jsonb) - ${idempotencyKey}, true)`,
				updatedAt: new Date(),
			})
			.where(and(eq(agentApps.agentTokenAddress, tokenAddress), eq(agentApps.appId, "image-gen")));
		// Eliza Cloud surfaces an exhausted-credit charge as a 402 (or a
		// payment/insufficient-balance message). Map it to a real 402 so the UI
		// can show its insufficient-credits recovery path instead of a generic
		// 500 from the global error handler.
		if (isInsufficientCreditsError(err)) {
			return c.json(
				{
					ok: false,
					error: "INSUFFICIENT_CREDITS",
					message: "Eliza Cloud credits are exhausted for this caller; top up to generate images.",
				},
				402,
			);
		}
		throw err;
	}

	const earnings = await (appsRouteDepsForTest.fetchElizaEarnings ?? fetchElizaEarnings)(elizaCloudAppId).catch(
		() => null,
	);
	const now = new Date();
	const image = generated.images?.[0];
	const imageUrl = image?.url ?? image?.image;
	const revenueLifetime =
		earnings?.monetization?.totalCreatorEarnings ??
		earnings?.earnings?.summary?.totalLifetimeEarnings ??
		earnings?.earnings?.breakdown?.allTime?.total ??
		existing.revenueLifetimeUsd ??
		0;
	const revenue24h = earnings?.earnings?.breakdown?.today?.total ?? existing.revenue24hUsd ?? 0;
	const revenue7d = earnings?.earnings?.breakdown?.thisWeek?.total ?? existing.revenue7dUsd ?? 0;
	const metadataPatch = {
		lastInvocationAt: now.toISOString(),
		lastChargeStatus: generated.charge.status,
		billingReality: "eliza_cloud_metered",
		unit: "image",
		provider: "eliza-cloud",
		model: generated.model ?? process.env.WAIFU_IMAGE_GEN_ELIZA_MODEL ?? DEFAULT_IMAGE_GEN_MODEL,
		cloudCallable: true,
		readCacheSource: "eliza-cloud-earnings",
		settlementMode,
		elizaCloudAppId,
		lastElizaCharge: generated.charge ?? null,
	};
	await db
		.update(agentApps)
		.set({
			revenueLifetimeUsd: toUsdString(revenueLifetime),
			revenue24hUsd: toUsdString(revenue24h),
			revenue7dUsd: toUsdString(revenue7d),
			metadata: sql`coalesce(${agentApps.metadata}, '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb`,
			updatedAt: now,
		})
		.where(and(eq(agentApps.agentTokenAddress, tokenAddress), eq(agentApps.appId, "image-gen")));

	return c.json({
		ok: true,
		data: {
			appId: "image-gen",
			elizaCloudAppId,
			agentTokenAddress: tokenAddress,
			imageUrl,
			prompt: normalized.prompt,
			aspect: normalized.aspect,
			charge: {
				...generated.charge,
				status: generated.charge.status,
				currency: generated.charge.currency ?? "USD",
				detail: "Eliza Cloud metered app image generation charged caller org credits and recorded creator earnings.",
			},
			earnings: earnings
				? {
						revenueLifetimeUsd: toUsdString(revenueLifetime),
						revenue24hUsd: toUsdString(revenue24h),
						revenue7dUsd: toUsdString(revenue7d),
					}
				: null,
			settlementMode,
			billingReality: "charged through Eliza Cloud app metered generate-image endpoint",
		},
	});
});

export default app;
