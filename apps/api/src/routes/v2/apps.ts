import { Hono } from "hono";
import type { Context } from "hono";

import { agentApps, agentPersonas, getDatabase } from "@waifufun/db";
import { uploadBase64Image } from "@waifufun/s3-uploader";
import { and, eq, sql } from "drizzle-orm";

import { type StewardAuthPrincipal, verifyStewardJwt } from "../../middleware/steward-auth.js";

const app = new Hono();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_IMAGE_GEN_PRICE_USD = 0.1;
const DEFAULT_IMAGE_GEN_MODEL = "google/gemini-2.5-flash-image";
const VALID_ASPECTS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);

type JsonRecord = Record<string, unknown>;

type AppAuth =
	| { mode: "steward"; principal: StewardAuthPrincipal }
	| { mode: "agent-app-key"; principal: { userId: string } };

type ImageGenBody = {
	prompt?: unknown;
	style?: unknown;
	aspect?: unknown;
	idempotencyKey?: unknown;
};

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
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

function priceFromMetadata(metadata: unknown): number {
	const fallback = Number(process.env.WAIFU_IMAGE_GEN_PRICE_USD ?? DEFAULT_IMAGE_GEN_PRICE_USD);
	const defaultPrice = Number.isFinite(fallback) && fallback >= 0 ? fallback : DEFAULT_IMAGE_GEN_PRICE_USD;
	if (!metadata || typeof metadata !== "object") return defaultPrice;
	const value = (metadata as JsonRecord).priceUsd;
	const price = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isFinite(price) && price >= 0 ? price : defaultPrice;
}

function normalizePrompt(
	body: ImageGenBody,
): { prompt: string; style: string | null; aspect: string } | { error: string } {
	const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
	if (prompt.length < 3 || prompt.length > 1800) return { error: "prompt must be 3 to 1800 characters" };
	const style = typeof body.style === "string" && body.style.trim() ? body.style.trim().slice(0, 240) : null;
	const aspect = typeof body.aspect === "string" && VALID_ASPECTS.has(body.aspect) ? body.aspect : "1:1";
	return { prompt, style, aspect };
}

function composePrompt(input: { prompt: string; style: string | null }): string {
	if (!input.style) return input.prompt;
	return `${input.prompt}\n\nStyle: ${input.style}`;
}

function parseOpenRouterImage(json: unknown): { dataUrl: string; mimeType: string; base64: string } | null {
	if (!json || typeof json !== "object") return null;
	const root = json as JsonRecord;
	const choices = Array.isArray(root.choices) ? root.choices : [];
	const firstChoice = choices[0] as JsonRecord | undefined;
	const message = firstChoice?.message as JsonRecord | undefined;
	const images = Array.isArray(message?.images) ? message.images : [];
	const firstImage = images[0] as JsonRecord | undefined;
	const imageUrl = firstImage?.image_url as JsonRecord | undefined;
	const url = typeof imageUrl?.url === "string" ? imageUrl.url : null;
	if (!url) return null;
	const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(url);
	if (!match) return null;
	return { dataUrl: url, mimeType: match[1] ?? "image/png", base64: match[2] ?? "" };
}

function dimensionsForAspect(aspect: string): { width: number; height: number } {
	switch (aspect) {
		case "16:9":
			return { width: 1024, height: 576 };
		case "9:16":
			return { width: 576, height: 1024 };
		case "3:2":
			return { width: 960, height: 640 };
		case "2:3":
			return { width: 640, height: 960 };
		case "4:3":
			return { width: 1024, height: 768 };
		case "3:4":
			return { width: 768, height: 1024 };
		case "5:4":
			return { width: 1000, height: 800 };
		case "4:5":
			return { width: 800, height: 1000 };
		case "21:9":
			return { width: 1176, height: 504 };
		default:
			return { width: 1024, height: 1024 };
	}
}

async function generateImage(input: { prompt: string; aspect: string }): Promise<{
	imageUrl: string;
	provider: string;
	model: string;
}> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
	const model = process.env.WAIFU_IMAGE_GEN_OPENROUTER_MODEL ?? DEFAULT_IMAGE_GEN_MODEL;
	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": process.env.WAIFU_PUBLIC_URL ?? "https://waifu.fun",
			"X-Title": "waifu.fun agent image-gen app",
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: input.prompt }],
			modalities: ["image"],
			image_config: { aspect_ratio: input.aspect },
		}),
	});
	const json = (await res.json().catch(() => null)) as unknown;
	if (!res.ok) {
		const message =
			json && typeof json === "object" && "error" in json
				? JSON.stringify((json as JsonRecord).error).slice(0, 400)
				: res.statusText;
		throw new Error(`OpenRouter image generation failed: ${message}`);
	}
	const image = parseOpenRouterImage(json);
	if (!image?.base64) throw new Error("OpenRouter response did not include an image");

	try {
		const fileName = `image-gen/${Date.now()}-${crypto.randomUUID()}`;
		const { width, height } = dimensionsForAspect(input.aspect);
		const imageUrl = await uploadBase64Image(image.base64, fileName, "agent-apps", width, height);
		return { imageUrl: String(imageUrl), provider: "openrouter", model };
	} catch (err) {
		if (process.env.WAIFU_IMAGE_GEN_ALLOW_DATA_URL_FALLBACK === "true") {
			return { imageUrl: image.dataUrl, provider: "openrouter", model };
		}
		throw err;
	}
}

async function recordStewardMetering(input: {
	tokenAddress: string;
	appId: string;
	callerId: string;
	amountUsd: number;
	idempotencyKey: string;
}): Promise<{ status: "charged" | "recorded_not_charged"; receiptId: string | null; detail: string }> {
	const meterUrl = process.env.STEWARD_APP_METER_URL?.trim();
	const apiKey = process.env.STEWARD_API_KEY?.trim();
	if (!meterUrl || !apiKey) {
		return {
			status: "recorded_not_charged",
			receiptId: null,
			detail: "STEWARD_APP_METER_URL is not configured, so waifu records intended app revenue only.",
		};
	}

	const res = await fetch(meterUrl, {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			tenantId: process.env.STEWARD_TENANT_ID ?? "waifu",
			agentTokenAddress: input.tokenAddress,
			appId: input.appId,
			callerId: input.callerId,
			amountUsd: input.amountUsd,
			currency: "USD",
			idempotencyKey: input.idempotencyKey,
		}),
	});
	const json = (await res.json().catch(() => null)) as JsonRecord | null;
	if (!res.ok) {
		throw new Error(`Steward app metering rejected the charge with ${res.status}`);
	}
	const receiptId = typeof json?.receiptId === "string" ? json.receiptId : null;
	return { status: "charged", receiptId, detail: "Steward app metering accepted the charge." };
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
	const rawPrice = Number(body.priceUsd ?? process.env.WAIFU_IMAGE_GEN_PRICE_USD ?? DEFAULT_IMAGE_GEN_PRICE_USD);
	const priceUsd = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : DEFAULT_IMAGE_GEN_PRICE_USD;
	const now = new Date();
	const values = {
		agentTokenAddress: tokenAddress,
		appId: "image-gen",
		name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "Image Generator",
		description:
			typeof body.description === "string" && body.description.trim()
				? body.description.trim().slice(0, 300)
				: "Generate images from prompts through this agent. Calls are metered per image.",
		icon: typeof body.icon === "string" && body.icon.trim() ? body.icon.trim().slice(0, 80) : "image",
		appUrl: imageGenAppUrl(tokenAddress),
		status: "live" as const,
		shippedAt: now,
		metadata: {
			kind: "agent-mini-app",
			category: "image-generation",
			priceUsd,
			currency: "USD",
			unit: "image",
			endpoint: imageGenAppUrl(tokenAddress),
			provider: "openrouter",
			model: process.env.WAIFU_IMAGE_GEN_OPENROUTER_MODEL ?? DEFAULT_IMAGE_GEN_MODEL,
			billingReality: process.env.STEWARD_APP_METER_URL ? "steward_metered" : "recorded_not_charged",
			cloudCallable: true,
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

	const priceUsd = priceFromMetadata(existing.metadata);
	const callerId = auth.mode === "steward" ? auth.principal.userId : auth.principal.userId;
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

	let generated: Awaited<ReturnType<typeof generateImage>>;
	let metering: Awaited<ReturnType<typeof recordStewardMetering>>;
	try {
		generated = await generateImage({ prompt: composePrompt(normalized), aspect: normalized.aspect });
		metering = await recordStewardMetering({
			tokenAddress,
			appId: "image-gen",
			callerId,
			amountUsd: priceUsd,
			idempotencyKey,
		});
	} catch (err) {
		await db
			.update(agentApps)
			.set({
				metadata: sql`jsonb_set(coalesce(${agentApps.metadata}, '{}'::jsonb), '{idempotencyKeys}', coalesce(${agentApps.metadata}->'idempotencyKeys', '[]'::jsonb) - ${idempotencyKey}, true)`,
				updatedAt: new Date(),
			})
			.where(and(eq(agentApps.agentTokenAddress, tokenAddress), eq(agentApps.appId, "image-gen")));
		throw err;
	}

	const now = new Date();
	const metadataPatch = {
		lastInvocationAt: now.toISOString(),
		lastChargeStatus: metering.status,
		billingReality: metering.status === "charged" ? "steward_metered" : "recorded_not_charged",
		priceUsd,
		unit: "image",
		provider: generated.provider,
		model: generated.model,
		cloudCallable: true,
	};
	await db
		.update(agentApps)
		.set({
			revenueLifetimeUsd: sql`${agentApps.revenueLifetimeUsd} + ${priceUsd}`,
			revenue24hUsd: sql`${agentApps.revenue24hUsd} + ${priceUsd}`,
			revenue7dUsd: sql`${agentApps.revenue7dUsd} + ${priceUsd}`,
			metadata: sql`coalesce(${agentApps.metadata}, '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb`,
			updatedAt: now,
		})
		.where(and(eq(agentApps.agentTokenAddress, tokenAddress), eq(agentApps.appId, "image-gen")));

	return c.json({
		ok: true,
		data: {
			appId: "image-gen",
			agentTokenAddress: tokenAddress,
			imageUrl: generated.imageUrl,
			prompt: normalized.prompt,
			aspect: normalized.aspect,
			charge: {
				amountUsd: priceUsd,
				currency: "USD",
				status: metering.status,
				receiptId: metering.receiptId,
				detail: metering.detail,
			},
			billingReality:
				metering.status === "charged"
					? "charged through configured Steward app metering endpoint"
					: "image generated and intended charge recorded in agent_apps counters, but no Steward debit occurred",
		},
	});
});

export default app;
