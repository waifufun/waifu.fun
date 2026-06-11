/**
 * Client for the agent image-gen mini-app invoke endpoint.
 *
 * Backend contract (apps/api/src/routes/v2/apps.ts):
 *
 *   POST /v2/agents/:token/apps/image-gen/invoke
 *     auth:  steward bearer (Authorization: Bearer <jwt>)  OR
 *            x-waifu-app-invoke-key (agent runtime, server-side only)
 *     body:  { prompt: string (3..1800), style?: string, aspect?: AspectRatio,
 *              idempotencyKey?: string }
 *     200:   { ok: true, data: {
 *              appId, elizaCloudAppId, agentTokenAddress, imageUrl,
 *              prompt, aspect,
 *              charge: { status, currency, baseCost?, creatorMarkup?,
 *                        totalCost?, creatorEarnings?, balance?, detail },
 *              earnings: { revenueLifetimeUsd, revenue24hUsd, revenue7dUsd } | null,
 *              billingReality } }
 *     400:   bad prompt / aspect
 *     401:   missing / invalid steward bearer
 *     402:   insufficient credits (Eliza Cloud charge failed)
 *     404:   image-gen app not registered / not live for this agent
 *     409:   duplicate idempotencyKey
 *     503:   misconfigured (missing eliza app id or caller key) / db down
 *
 * Billing: Eliza Cloud meters the base inference cost, applies the creator's
 * `inferenceMarkupPercentage` markup (default 100%), charges the caller's org
 * credits, and records the creator's earnings. The settlement mode surfaced to
 * the user is "credits" (Eliza Cloud metered). The base + markup price is only
 * known after the charge settles; the UI shows the configured markup pct up
 * front and the settled `totalCost` after generation.
 *
 * Requests go through the same-origin `/v2/*` path (see `apiFetch`), which
 * attaches the Steward JWT bearer automatically when the user is signed in.
 */

import { type ApiError, apiFetch, isApiError } from "@/lib/api/_fetcher";

export const IMAGE_GEN_APP_ID = "image-gen";

export const IMAGE_GEN_ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;

export type ImageGenAspect = (typeof IMAGE_GEN_ASPECTS)[number];

export const IMAGE_GEN_MODELS = [
	{ id: "openai/gpt-image-2/text-to-image", label: "GPT Image 2" },
	{ id: "bytedance/seedream-v5.0-lite", label: "Seedream 5" },
	{ id: "google/nano-banana-2/text-to-image", label: "Nano Banana 2" },
	{ id: "qwen/qwen-image-2.0/text-to-image", label: "Qwen Image" },
] as const;

export type ImageGenModelId = (typeof IMAGE_GEN_MODELS)[number]["id"];

export const DEFAULT_IMAGE_GEN_MODEL_ID: ImageGenModelId = "openai/gpt-image-2/text-to-image";

export const IMAGE_GEN_PROMPT_MIN = 3;
export const IMAGE_GEN_PROMPT_MAX = 1800;

export type ImageGenCharge = {
	status?: string;
	currency?: string;
	baseCost?: number;
	creatorMarkup?: number;
	totalCost?: number;
	creatorEarnings?: number;
	balance?: number;
	detail?: string;
};

export type ImageGenResult = {
	appId: string;
	elizaCloudAppId: string;
	agentTokenAddress: string;
	imageUrl: string;
	prompt: string;
	aspect: string;
	charge: ImageGenCharge;
	earnings: {
		revenueLifetimeUsd: string;
		revenue24hUsd: string;
		revenue7dUsd: string;
	} | null;
	billingReality: string;
};

export type ImageGenInvokeInput = {
	tokenAddress: string;
	prompt: string;
	aspect?: ImageGenAspect;
	model?: ImageGenModelId;
	style?: string;
	idempotencyKey?: string;
};

/** Typed failure surfaced to the invoke UI so it can branch on status. */
export type ImageGenError = {
	kind: "auth" | "insufficient-credits" | "not-available" | "duplicate" | "bad-request" | "misconfigured" | "unknown";
	status: number;
	message: string;
};

function classifyError(err: ApiError): ImageGenError {
	const message = err.message || "image generation failed";
	switch (err.status) {
		case 401:
			return { kind: "auth", status: 401, message: "sign in to generate images" };
		case 402:
			return { kind: "insufficient-credits", status: 402, message: "not enough credits to generate" };
		case 404:
			return { kind: "not-available", status: 404, message: "image generation is not available for this agent" };
		case 409:
			return { kind: "duplicate", status: 409, message: "that request was already submitted" };
		case 400:
			return { kind: "bad-request", status: 400, message };
		case 503:
			return { kind: "misconfigured", status: 503, message: "image generation is temporarily unavailable" };
		default:
			return { kind: "unknown", status: err.status, message };
	}
}

export function isImageGenError(value: unknown): value is ImageGenError {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { kind?: unknown }).kind === "string" &&
		typeof (value as { status?: unknown }).status === "number"
	);
}

/**
 * Invoke the image-gen mini-app for an agent. Throws an `ImageGenError` on a
 * recognised failure so callers can branch on `.kind` (auth / credits / etc),
 * or a generic `ImageGenError` with `kind: "unknown"` for everything else.
 */
export async function invokeImageGen(input: ImageGenInvokeInput): Promise<ImageGenResult> {
	const aspect = input.aspect ?? "1:1";
	const body: Record<string, unknown> = {
		prompt: input.prompt,
		aspect,
	};
	if (input.model) body.model = input.model;
	if (input.style?.trim()) body.style = input.style.trim();
	if (input.idempotencyKey) body.idempotencyKey = input.idempotencyKey;

	try {
		const res = await apiFetch<{ ok: boolean; data: ImageGenResult }>(
			`/v2/agents/${encodeURIComponent(input.tokenAddress)}/apps/image-gen/invoke`,
			{
				method: "POST",
				body: JSON.stringify(body),
			},
		);
		if (!res?.ok || !res.data?.imageUrl) {
			throw { kind: "unknown", status: 500, message: "image generation returned no image" } satisfies ImageGenError;
		}
		return res.data;
	} catch (err) {
		if (isImageGenError(err)) throw err;
		if (isApiError(err)) throw classifyError(err);
		throw {
			kind: "unknown",
			status: 500,
			message: err instanceof Error ? err.message : "image generation failed",
		} satisfies ImageGenError;
	}
}

/** Pull the configured creator markup pct off an app's metadata bag. */
export function imageGenMarkupPct(metadata: unknown): number | null {
	if (!metadata || typeof metadata !== "object") return null;
	const raw = (metadata as Record<string, unknown>).inferenceMarkupPercentage;
	const n = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Read the metered model label off an app's metadata bag. */
export function imageGenModel(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== "object") return null;
	const raw = (metadata as Record<string, unknown>).model;
	return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
