/**
 * REST routes for the W42 LaunchFactory-driven launch flow.
 *
 * Mounted under /v2/launches. The v2/index.ts file registers this router
 * BEFORE the legacy launchRoutes/launchAuthorizeRoutes so that the new
 * resource shape wins on collisions (POST / and GET /:id specifically).
 *
 * The route handlers stay thin: input validation + DB lookup + on-chain
 * read/write delegated to {@link LaunchService} and {@link launchRepo}.
 */

import { Hono } from "hono";
import type { Address } from "viem";
import { z } from "zod";

import { getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { type UploadFlapMetadataInput, type UploadFlapMetadataResult, uploadFlapMetadata } from "@waifufun/flap";

import { verifySiweMessage } from "../../lib/auth-service.js";
import type { AppBindings } from "../../lib/bindings.js";
import { ApiError, badRequest, notFound } from "../../lib/errors.js";
import { respondAccepted, respondOk } from "../../lib/http.js";
import { issueRequestSiweNonce, validateRequestSiwe } from "../../lib/request-siwe.js";
import { parseJsonBody } from "../../lib/validation.js";
import { requireAgentOrPatron } from "../../middleware/agent-or-patron-auth.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { FlapMetadataError, validateFlapMetadataCid } from "../../services/flap-metadata.js";
import {
	type CreateLaunchInput,
	LaunchService,
	type LaunchServiceConfig,
	type LaunchTierString,
	getLaunchTierConfigSnapshot,
	launchRepo,
} from "../../services/launch-v2/index.js";
import { type MineSaltInput, mineVanitySalt } from "../../services/salt-miner.js";

const addressRegex = /^0x[a-fA-F0-9]{40}$/;
const addressSchema = z
	.string()
	.trim()
	.regex(addressRegex, "Expected a 20-byte EVM address")
	.transform((v) => v.toLowerCase() as `0x${string}`);

const tierSchema = z.enum(["80", "90", "95", "98"]);

const siweProofSchema = z.object({
	message: z.string().min(1),
	signature: z.string().min(1),
});

const nonceBodySchema = z.object({
	address: addressSchema,
});

// Metadata upload field constraints. These mirror skill.md (the agent-facing
// launch doc served at waifu.fun/skill.md) and the launch-create body schema:
//   name        2-48 chars
//   symbol      2-10 uppercase chars, no spaces
//   description optional, max 280 chars
// Kept as a standalone shape (not parsed via parseJsonBody) because the route
// reads multipart/form-data, not JSON.
const uploadMetadataNameSchema = z
	.string()
	.trim()
	.min(2, "name must be at least 2 characters")
	.max(48, "name must be at most 48 characters");
const uploadMetadataSymbolSchema = z
	.string()
	.trim()
	.min(2, "symbol must be at least 2 characters")
	.max(10, "symbol must be at most 10 characters")
	.regex(/^[A-Za-z0-9]+$/, "symbol must be alphanumeric with no spaces")
	.transform((v) => v.toUpperCase());
const uploadMetadataDescriptionSchema = z.string().trim().max(280, "description must be at most 280 characters");

const uploadMetadataFieldsSchema = z.object({
	name: uploadMetadataNameSchema,
	symbol: uploadMetadataSymbolSchema,
	description: uploadMetadataDescriptionSchema.optional(),
});

// Sane upper bound on the upload size so a single bad request can't pin
// memory. Enforced twice: once up front via Content-Length (before we buffer
// the body) and once on the decoded image bytes.
const UPLOAD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
// Allow a little multipart framing overhead on top of the raw image cap when
// rejecting early by Content-Length.
const UPLOAD_BODY_MAX_BYTES = UPLOAD_IMAGE_MAX_BYTES + 64 * 1024;

/**
 * Sniff the leading bytes of an uploaded file to confirm it is actually a PNG
 * or JPEG, rather than trusting the client-supplied MIME type or filename.
 *   PNG:  89 50 4E 47 0D 0A 1A 0A
 *   JPEG: FF D8 FF
 */
function isPngOrJpeg(bytes: Uint8Array): boolean {
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return true;
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return true;
	}
	return false;
}

const agentSafeOwnersSchema = z
	.array(addressSchema)
	.min(1, "agentSafeOwners must include at least one owner")
	.max(10, "agentSafeOwners may include at most 10 owners")
	.transform((owners) => Array.from(new Set(owners)) as `0x${string}`[]);

const waveMSplitBodySchema = {
	platformReceiver: addressSchema.optional(),
	platformBps: z.coerce.number().int().min(1000).max(5000).default(1000),
	patronBps: z.coerce.number().int().min(0).max(9000).default(2500),
	patron: addressSchema.optional(),
	agentSafeOwners: agentSafeOwnersSchema.optional(),
	agentSafeThreshold: z.coerce.number().int().min(1).max(10).default(1),
} as const;

export const createLaunchBodySchema = z
	.object({
		name: z.string().trim().min(1).max(64),
		symbol: z
			.string()
			.trim()
			.min(1)
			.max(16)
			.transform((v) => v.toUpperCase()),
		metadataURI: z.string().trim().min(1).max(2048).optional(),
		flapMetaCid: z.string().trim().min(1).max(256).optional(),
		flap_meta_cid: z.string().trim().min(1).max(256).optional(),
		creator: addressSchema,
		tier: tierSchema,
		buyTaxBps: z.coerce.number().int().min(0).max(10_000).optional(),
		sellTaxBps: z.coerce.number().int().min(0).max(10_000).optional(),
		closeTimestamp: z.coerce.number().int().positive().optional(),
		...waveMSplitBodySchema,
		siwe: siweProofSchema,
	})
	.refine((body) => Boolean(body.flapMetaCid ?? body.flap_meta_cid ?? body.metadataURI), {
		message: "flapMetaCid or metadataURI is required",
		path: ["flapMetaCid"],
	})
	.superRefine((body, ctx) => {
		const owners = body.agentSafeOwners ?? [body.creator];
		if (body.agentSafeThreshold > owners.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["agentSafeThreshold"],
				message: "agentSafeThreshold cannot exceed agentSafeOwners length",
			});
		}
		if (body.platformBps + body.patronBps > 10_000) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["patronBps"],
				message: "platformBps + patronBps cannot exceed 10000",
			});
		}
	});

const previewBodySchema = z.object({
	bnbAmount: z.union([z.string(), z.number()]).transform((v, ctx) => {
		const str = typeof v === "string" ? v.trim() : v.toString();
		try {
			const n = BigInt(str);
			if (n < 0n) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bnbAmount must be non-negative" });
				return z.NEVER;
			}
			return n;
		} catch {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bnbAmount must be a wei integer string" });
			return z.NEVER;
		}
	}),
});

const listQuerySchema = z.object({
	creator: addressSchema.optional(),
	state: z.enum(["open", "closed", "launched", "failed", "mining_failed"]).optional(),
	tier: z.coerce
		.number()
		.int()
		.refine((n) => [80, 90, 95, 98].includes(n))
		.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

const depositorListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(5000).default(1000),
	offset: z.coerce.number().int().min(0).default(0),
});

export interface AgentLaunchRoutesOptions {
	db?: Database;
	launchService?: LaunchService;
	getDb?: () => Database | null;
	getService?: () => LaunchService | null;
	siweVerifier?: typeof verifySiweMessage;
	// Injectable FLAP metadata uploader. Defaults to the @waifufun/flap package
	// adapter (which POSTs to funcs.flap.sh). Overridden in tests so we never
	// touch the real FLAP host.
	uploadMetadata?: (input: UploadFlapMetadataInput) => Promise<UploadFlapMetadataResult>;
}

function defaultDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url) return null;
	return getDatabase(url).db;
}

const LAUNCH_SIWE_PURPOSE = "launch:create";
const LAUNCH_SIWE_STATEMENT =
	"sign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.";
const LAUNCH_SIWE_URI_PATH = "/create/wizard";

async function launchRateLimitKey(c: Parameters<ReturnType<typeof rateLimit>>[0]): Promise<string | null> {
	try {
		const body = (await c.req.raw.clone().json()) as { creator?: unknown };
		if (typeof body.creator === "string" && addressRegex.test(body.creator)) {
			return body.creator.toLowerCase();
		}
	} catch {
		// Fall through to patron-scoped fallback for malformed bodies.
	}

	const patron = (
		c as unknown as { get(key: "patron"): { stewardUserId?: string; primaryAddress?: string | null } | undefined }
	).get("patron");
	return patron?.primaryAddress?.toLowerCase() ?? patron?.stewardUserId ?? null;
}

function defaultService(): LaunchService | null {
	const factoryAddress = process.env.LAUNCH_FACTORY_ADDRESS as `0x${string}` | undefined;
	const rpcUrl = process.env.ALCHEMY_BSC_KEY
		? `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_BSC_KEY}`
		: (process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org");
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);

	if (!factoryAddress) return null;

	const config: LaunchServiceConfig = {
		chainId,
		rpcUrl,
		launchFactoryAddress: factoryAddress,
		signerPrivateKey: process.env.LAUNCH_FACTORY_SIGNER_PK as `0x${string}` | undefined,
		presaleUrlBase: process.env.LAUNCH_PRESALE_URL_BASE,
	};
	return new LaunchService(config);
}

function readLaunchAddress(...names: string[]): `0x${string}` | null {
	for (const name of names) {
		const value = process.env[name];
		if (value && addressRegex.test(value)) return value.toLowerCase() as `0x${string}`;
	}
	return null;
}

function buildTaxSplit(platformBps: number | null | undefined, patronBps: number | null | undefined) {
	if (platformBps == null || patronBps == null) return null;
	return {
		platformBps,
		patronBps,
		agentBps: Math.max(0, 10_000 - platformBps - patronBps),
	};
}

function buildAgentSafeConfig(owners: string[] | null | undefined, threshold: number | null | undefined) {
	if (!Array.isArray(owners) || threshold == null) return null;
	return { owners, threshold };
}

/**
 * Serialize agent_launches row to the public API shape (the `state` document
 * in the spec). bigints become strings; addresses are returned as stored
 * (lowercase). Optional on-chain fields are filled in by the route handler
 * when fresh data is requested.
 */
export function serializeAgentLaunch(
	row: typeof launchRepo.listLaunches extends never ? never : Awaited<ReturnType<typeof launchRepo.getLaunchById>>,
) {
	if (!row) return null;
	const meta = (row.metadata as Record<string, unknown> | null) ?? {};
	const metaImage = typeof meta.image === "string" ? meta.image : null;
	const metaName = typeof meta.name === "string" ? meta.name : null;
	const metaSymbol = typeof meta.symbol === "string" ? meta.symbol : null;
	const metaDescription = typeof meta.description === "string" ? meta.description : null;
	const tierLabel = tierLabelFromStoredValue(row.tier);
	const imageUrl = metaImage
		? metaImage.startsWith("http") || metaImage.startsWith("ipfs://")
			? metaImage
			: `https://ipfs.io/ipfs/${metaImage}`
		: null;
	return {
		id: row.id,
		token: row.tokenAddress,
		vault: row.vaultAddress,
		router: row.routerAddress,
		taxSplitter: row.taxSplitterAddress ?? null,
		agentSafe: row.agentSafeAddress ?? null,
		taxSplit: buildTaxSplit(row.platformBps, row.patronBps),
		agentSafeConfig: buildAgentSafeConfig(row.agentSafeOwners, row.agentSafeThreshold),
		treasuryLp: row.treasuryLpAddress,
		creator: row.creator,
		// `tier` was originally `row.tier` (numeric). Frontend's launch-page-v2
		// uses `tierFromString(meta.data?.tier)` which expects "TIER_95" etc.
		// Emit the string label here; legacy consumers can still derive the
		// numeric tier from `tierNumber` below.
		tier: tierLabel ?? String(row.tier),
		tierNumber: row.tier,
		state: row.state,
		totalDeposited: row.totalDeposited,
		bonusPool: row.bonusPool,
		depositorCount: row.depositorCount,
		capacity: row.presaleCap,
		v2BuyBnb: row.v2BuyBnb,
		vestingEnabled: row.vestingEnabled === 1,
		closeTimestamp: row.closeTimestamp ? Number(row.closeTimestamp) : null,
		launchTimestamp: row.launchTimestamp ? Number(row.launchTimestamp) : null,
		v2Pair: row.v2Pair,
		openMcBnb: row.openMcBnb,
		metadataUri: row.metadataUri,
		metadata: row.metadata ?? {},
		predictedTokenAddress: row.predictedTokenAddress,
		vanitySalt: row.vanitySalt,
		flapMetaCid: row.flapMetaCid,
		flapTokenAddress: row.flapTokenAddress,
		bundleStatus: row.bundleStatus,
		bundleTxHash: row.bundleTxHash,
		bundleAttempt: row.bundleAttempt,
		bundleTipBnb: row.bundleTipBnb,
		bundleFailureReason: row.bundleFailureReason,
		createTxHash: row.createTxHash,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		// PublicLaunchExtended-shape aliases for the launch-page FE (W49).
		// The launch page client reads these fields from the API response.
		launchId: row.id,
		agentId: null,
		status: row.state,
		creatorAddress: row.creator,
		tokenAddress: row.tokenAddress,
		taxRecipient: row.taxSplitterAddress ?? null,
		firstBuyWei: "0",
		launchAuthorizedAt: null,
		launchAuthorizedBy: null,
		errorMessage: null,
		vaultAddress: row.vaultAddress,
		presaleCapWei: row.presaleCap,
		closeAt: row.closeTimestamp ? new Date(Number(row.closeTimestamp) * 1000).toISOString() : null,
		tokenName: metaName,
		tokenTicker: metaSymbol,
		tokenImageUrl: imageUrl,
		tokenDescription: metaDescription,
		tierLabel,
		metaCid: row.flapMetaCid,
		bundleTipBnb_alias: row.bundleTipBnb,
	};
}

function tierLabelFromStoredValue(tier: number): string | null {
	switch (tier) {
		case 0:
		case 80:
			return "TIER_80";
		case 1:
		case 90:
			return "TIER_90";
		case 2:
		case 95:
			return "TIER_95";
		case 3:
		case 98:
			return "TIER_98";
		case 4:
			return "TIER_TEST";
		default:
			return null;
	}
}

export function createAgentLaunchRoutes(options: AgentLaunchRoutesOptions = {}) {
	const app = new Hono<AppBindings>();

	const resolveDb = (): Database => {
		const db = options.db ?? options.getDb?.() ?? defaultDb();
		if (!db) throw badRequest("DB_UNAVAILABLE", "Database is not configured");
		return db;
	};

	const resolveService = (): LaunchService => {
		const svc = options.launchService ?? options.getService?.() ?? defaultService();
		if (!svc) {
			throw badRequest("LAUNCH_SERVICE_UNAVAILABLE", "Launch service is not configured (set LAUNCH_FACTORY_ADDRESS).");
		}
		return svc;
	};

	// POST /v2/launches/nonce - issue a one-use SIWE nonce for launch creation.
	app.post("/nonce", requireAgentOrPatron() as never, async (c) => {
		const body = await parseJsonBody(c, nonceBodySchema);
		const patron = (c as unknown as { get(key: "patron"): { id: string } }).get("patron");
		return respondOk(c, {
			nonce: issueRequestSiweNonce(patron.id, LAUNCH_SIWE_PURPOSE, body.address),
			expiresInSeconds: 600,
		});
	});

	const resolveUploadMetadata = (): ((input: UploadFlapMetadataInput) => Promise<UploadFlapMetadataResult>) =>
		options.uploadMetadata ?? uploadFlapMetadata;

	// POST /v2/launches/upload-metadata - upload a token logo + metadata to
	// FLAP's IPFS uploader and return the resulting flapMetaCid. This is step 1
	// of the agent launch flow documented in skill.md: the returned
	// `flapMetaCid` feeds straight into POST /v2/launches.
	//
	// Accepts multipart/form-data (NOT JSON), so we read c.req.formData()
	// directly rather than going through parseJsonBody.
	app.post(
		"/upload-metadata",
		requireAgentOrPatron() as never,
		rateLimit({
			bucket: "launch:upload",
			limit: 30,
			windowMs: 60 * 60 * 1000,
			keyGenerator: (c) => {
				const patron = (
					c as unknown as {
						get(key: "patron"): { stewardUserId?: string; primaryAddress?: string | null } | undefined;
					}
				).get("patron");
				return patron?.primaryAddress?.toLowerCase() ?? patron?.stewardUserId ?? null;
			},
		}) as never,
		async (c) => {
			// Reject oversized bodies up front (before buffering) when the client
			// advertises a Content-Length, so a giant multipart payload can't pin
			// memory during formData() parsing. The decoded-image cap below is the
			// authoritative check for clients that omit/understate Content-Length.
			const contentLength = Number(c.req.header("content-length") ?? "");
			if (Number.isFinite(contentLength) && contentLength > UPLOAD_BODY_MAX_BYTES) {
				throw badRequest("IMAGE_TOO_LARGE", `image must be at most ${UPLOAD_IMAGE_MAX_BYTES / (1024 * 1024)}MB`);
			}

			let form: FormData;
			try {
				form = await c.req.formData();
			} catch {
				throw badRequest("INVALID_MULTIPART", "Request body must be multipart/form-data");
			}

			const parsedFields = uploadMetadataFieldsSchema.safeParse({
				name: form.get("name"),
				symbol: form.get("symbol"),
				// An empty-string description from the form is treated as absent.
				description:
					typeof form.get("description") === "string" && (form.get("description") as string).trim() === ""
						? undefined
						: (form.get("description") ?? undefined),
			});
			if (!parsedFields.success) {
				throw badRequest("INVALID_METADATA", "Invalid metadata fields", parsedFields.error.flatten());
			}

			const imageEntry = form.get("image");
			if (!imageEntry || typeof imageEntry === "string") {
				throw badRequest("IMAGE_REQUIRED", "image file is required");
			}
			const image = imageEntry as File;

			if (image.size === 0) {
				throw badRequest("IMAGE_REQUIRED", "image file is required");
			}
			if (image.size > UPLOAD_IMAGE_MAX_BYTES) {
				throw badRequest("IMAGE_TOO_LARGE", `image must be at most ${UPLOAD_IMAGE_MAX_BYTES / (1024 * 1024)}MB`);
			}

			// Validate by magic bytes rather than trusting the client-supplied MIME
			// type or filename: read the buffer once and confirm a real PNG/JPEG
			// signature. We forward the decoded bytes (not the original File) to the
			// uploader so we don't re-read a consumed stream.
			const imageBytes = new Uint8Array(await image.arrayBuffer());
			if (imageBytes.byteLength > UPLOAD_IMAGE_MAX_BYTES) {
				throw badRequest("IMAGE_TOO_LARGE", `image must be at most ${UPLOAD_IMAGE_MAX_BYTES / (1024 * 1024)}MB`);
			}
			if (!isPngOrJpeg(imageBytes)) {
				throw badRequest("INVALID_IMAGE_TYPE", "image must be a PNG or JPG");
			}
			const sniffedType = imageBytes[0] === 0xff ? "image/jpeg" : "image/png";
			const imageBlob = new Blob([imageBytes], { type: sniffedType });

			const upload = resolveUploadMetadata();
			let result: UploadFlapMetadataResult;
			try {
				result = await upload({
					image: imageBlob,
					metadata: {
						// The on-chain creator is set by the launch-create call; the IPFS
						// metadata record's `creator` field is informational only, so we
						// leave it as the zero address here (agents don't send a creator to
						// this step per skill.md).
						creator: "0x0000000000000000000000000000000000000000",
						description: parsedFields.data.description ?? "",
						buy: null,
						sell: null,
						telegram: null,
						twitter: null,
						website: null,
					},
				});
			} catch (error) {
				// Map any uploader failure to a clean badRequest. We never surface a
				// raw 500 for a known upload failure, and we keep the public message
				// generic so FLAP internals (upstream status text, GraphQL errors)
				// don't leak. The original error is logged for operators.
				c.get("logger")?.error({ error }, "flap metadata upload failed");
				throw badRequest("FLAP_UPLOAD_FAILED", "metadata upload failed, please retry");
			}

			if (!result?.cid) {
				throw badRequest("FLAP_UPLOAD_FAILED", "flap upload did not return a cid");
			}

			return respondOk(c, { flapMetaCid: result.cid });
		},
	);

	// POST /v2/launches - submit createLaunch on-chain and persist a row.
	app.post(
		"/",
		requireAgentOrPatron() as never,
		rateLimit({
			bucket: "launch:create",
			limit: 10,
			windowMs: 60 * 60 * 1000,
			keyGenerator: launchRateLimitKey,
		}) as never,
		async (c) => {
			const body = await parseJsonBody(c, createLaunchBodySchema);
			const patron = (c as unknown as { get(key: "patron"): { id: string } }).get("patron");
			const siweError = await validateRequestSiwe({
				patronId: patron.id,
				purpose: LAUNCH_SIWE_PURPOSE,
				creator: body.creator,
				siwe: body.siwe,
				expectedStatement: LAUNCH_SIWE_STATEMENT,
				expectedUriPath: LAUNCH_SIWE_URI_PATH,
				verifier: options.siweVerifier ?? verifySiweMessage,
			});
			if (siweError) throw badRequest("SIWE_VERIFICATION_FAILED", siweError);
			const db = resolveDb();
			const service = resolveService();

			const closeTs = body.closeTimestamp ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60;
			const tier = body.tier as LaunchTierString;
			const creator = body.creator as Address;

			const flapMetaCid = body.flapMetaCid ?? body.flap_meta_cid;
			let metadataUri = body.metadataURI ?? "";
			let metadata: Record<string, unknown> = { name: body.name, symbol: body.symbol };
			if (flapMetaCid) {
				try {
					const validated = await validateFlapMetadataCid(flapMetaCid);
					metadataUri = validated.cid;
					metadata = { ...validated.metadata, name: body.name, symbol: body.symbol };
				} catch (error) {
					if (error instanceof FlapMetadataError) throw badRequest(error.code, error.message);
					throw error;
				}
			}
			const bundleBot = readLaunchAddress("BUNDLE_BOT_ADDRESS", "LAUNCH_BUNDLE_BOT_ADDRESS") ?? creator;
			const commissionReceiver =
				readLaunchAddress("PLATFORM_COMMISSION_RECEIVER", "WAIFU_PLATFORM_FEE_WALLET") ?? creator;
			const platformReceiver =
				(body.platformReceiver as `0x${string}` | undefined) ??
				readLaunchAddress("PLATFORM_RECEIVER", "WAIFU_PLATFORM_FEE_WALLET") ??
				commissionReceiver;
			const patronAddress = (body.patron ?? creator) as `0x${string}`;
			const agentSafeOwners = (body.agentSafeOwners ?? [creator]) as `0x${string}`[];
			const mineInput: MineSaltInput = { creator };
			if (process.env.LAUNCH_VANITY_SUFFIX !== undefined) mineInput.suffix = process.env.LAUNCH_VANITY_SUFFIX;
			if (process.env.LAUNCH_VANITY_MINING_MAX_ITERATIONS !== undefined) {
				mineInput.maxIterations = Number(process.env.LAUNCH_VANITY_MINING_MAX_ITERATIONS);
			}
			let mined: ReturnType<typeof mineVanitySalt>;
			try {
				mined = mineVanitySalt(mineInput);
			} catch (error) {
				c.get("logger")?.error({ error }, "vanity salt mining failed");
				throw new ApiError(503, "SALT_MINING_FAILED", "could not derive a launch address, please retry");
			}

			const input: CreateLaunchInput = {
				name: body.name,
				symbol: body.symbol,
				metadataURI: metadataUri,
				metaCid: flapMetaCid ?? metadataUri,
				creator: creator as `0x${string}`,
				bundleBot: bundleBot as `0x${string}`,
				commissionReceiver: commissionReceiver as `0x${string}`,
				platformReceiver: platformReceiver as `0x${string}`,
				patron: patronAddress,
				agentSafeOwners,
				agentSafeThreshold: body.agentSafeThreshold,
				platformBps: body.platformBps,
				patronBps: body.patronBps,
				tier,
				buyTaxBps: body.buyTaxBps ?? Number(process.env.LAUNCH_BUY_TAX_BPS ?? 300),
				sellTaxBps: body.sellTaxBps ?? Number(process.env.LAUNCH_SELL_TAX_BPS ?? 300),
				taxDuration: Number(process.env.LAUNCH_TAX_DURATION_SECONDS ?? 365 * 24 * 60 * 60),
				antiFarmerDuration: Number(process.env.LAUNCH_ANTI_FARMER_DURATION_SECONDS ?? 60 * 60),
				closeTimestamp: closeTs,
				vanitySalt: mined.vanitySalt,
				predictedTokenAddress: mined.predictedTokenAddress as `0x${string}`,
			};

			const onchain = await service.createLaunchOnchain(input);

			const tierConfig = getLaunchTierConfigSnapshot(tier, input.buyTaxBps);

			const row = await launchRepo.insertLaunch(db, {
				tokenAddress: onchain.token,
				vaultAddress: onchain.vault,
				routerAddress: onchain.router,
				taxSplitterAddress: onchain.taxSplitter,
				agentSafeAddress: onchain.agentSafe,
				platformBps: input.platformBps,
				patronBps: input.patronBps,
				agentSafeOwners: input.agentSafeOwners,
				agentSafeThreshold: input.agentSafeThreshold,
				creator: input.creator,
				tier: Number(tier),
				presaleCap: tierConfig.presaleCap,
				v2BuyBnb: tierConfig.v2BuyBnb,
				vestingEnabled: tierConfig.vestingEnabled,
				buyTaxBps: input.buyTaxBps,
				sellTaxBps: input.sellTaxBps,
				closeTimestamp: BigInt(closeTs),
				metadata,
				metadataUri: input.metadataURI,
				predictedTokenAddress: mined.predictedTokenAddress,
				vanitySalt: mined.vanitySalt,
				flapMetaCid: flapMetaCid ?? null,
				bundleTipBnb: process.env.BUNDLE_TIP_BNB ?? "0.03",
				createTxHash: onchain.txHash,
				createBlockNumber: onchain.blockNumber,
			});

			return respondAccepted(c, {
				id: row.id,
				status: "created",
				token: row.tokenAddress,
				// `tokenAddress` alias kept so older FE clients reading the
				// pre-Wave M response shape keep working through the rollout.
				tokenAddress: row.tokenAddress,
				predictedTokenAddress: row.predictedTokenAddress,
				vault: row.vaultAddress,
				router: row.routerAddress,
				taxSplitter: row.taxSplitterAddress ?? null,
				agentSafe: row.agentSafeAddress ?? null,
				taxSplit: buildTaxSplit(row.platformBps, row.patronBps),
				agentSafeConfig: buildAgentSafeConfig(row.agentSafeOwners, row.agentSafeThreshold),
				platformReceiver,
				treasuryReserve: onchain.treasuryReserve,
				presaleUrl: onchain.presaleUrl,
				txHash: onchain.txHash,
			});
		},
	);

	// GET /v2/launches — paginated list with filters.
	app.get("/", async (c) => {
		const url = new URL(c.req.url);
		const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			throw badRequest("INVALID_QUERY", "Invalid query parameters", parsed.error.flatten());
		}
		const db = resolveDb();
		const result = await launchRepo.listLaunches(db, {
			creator: parsed.data.creator,
			state: parsed.data.state,
			tier: parsed.data.tier,
			limit: parsed.data.limit,
			offset: parsed.data.offset,
		});

		return respondOk(c, {
			launches: result.launches.map((row) => serializeAgentLaunch(row)),
			total: result.total,
			limit: parsed.data.limit,
			offset: parsed.data.offset,
		});
	});

	// GET /v2/launches/by-token/:tokenAddress — single launch keyed by the
	// ERC-20 token address. Used by the post-launch agent page (W50) to detect
	// whether a v3 LaunchFactory-deployed token has graduated and should
	// surface the tier ladder, burn counter, claim, and tax stream sections.
	app.get("/by-token/:tokenAddress{0x[0-9a-fA-F]{40}}", async (c) => {
		const tokenAddress = c.req.param("tokenAddress");
		if (!tokenAddress) throw badRequest("INVALID_TOKEN", "Invalid token address");

		const db = resolveDb();
		const row = await launchRepo.getLaunchByToken(db, tokenAddress);
		if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

		const base = serializeAgentLaunch(row);
		if (!base) return c.notFound();

		return respondOk(c, base);
	});

	// GET /v2/launches/:id — single launch with full state.
	//
	// Constrained to UUID-shaped ids so the legacy GET /:id (which serves the
	// patron-authorize `launches` table by varied id formats) still resolves
	// for non-UUID requests. agent_launches IDs are always UUIDs (see schema).
	app.get("/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}", async (c) => {
		const id = c.req.param("id");
		if (!id || id.length > 128) throw badRequest("INVALID_ID", "Invalid launch id");

		const db = resolveDb();
		const row = await launchRepo.getLaunchById(db, id);
		if (!row) {
			throw notFound("LAUNCH_NOT_FOUND", "Launch not found");
		}

		// Best-effort live state refresh from chain. Failures are non-fatal —
		// we still return the persisted snapshot.
		let live: Awaited<ReturnType<LaunchService["readVaultState"]>> | null = null;
		try {
			const service = options.launchService ?? options.getService?.() ?? defaultService();
			if (service) {
				live = await service.readVaultState(row.vaultAddress as `0x${string}`);
			}
		} catch {
			live = null;
		}

		const base = serializeAgentLaunch(row);
		if (!base) return c.notFound();

		const merged = live
			? {
					...base,
					state: live.state,
					totalDeposited: live.totalDeposited.toString(),
					bonusPool: live.bonusPool.toString(),
					depositorCount: live.depositorCount,
					launchTimestamp: live.launchTimestamp !== null ? Number(live.launchTimestamp) : base.launchTimestamp,
				}
			: base;

		return respondOk(c, merged);
	});

	// GET /v2/launches/:id/bundle-status — bundle lifecycle snapshot.
	app.get(
		"/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/bundle-status",
		async (c) => {
			const id = c.req.param("id");
			const db = resolveDb();
			const row = await launchRepo.getLaunchById(db, id);
			if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");
			return respondOk(c, {
				id: row.id,
				bundleStatus: row.bundleStatus,
				bundleTxHash: row.bundleTxHash,
				bundleAttempt: row.bundleAttempt,
				bundleTipBnb: row.bundleTipBnb,
				bundleFailureReason: row.bundleFailureReason,
				predictedTokenAddress: row.predictedTokenAddress,
				flapTokenAddress: row.flapTokenAddress,
			});
		},
	);

	// GET /v2/launches/:id/depositors — full depositor list (with claimables).
	app.get("/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/depositors", async (c) => {
		const id = c.req.param("id");
		const url = new URL(c.req.url);
		const parsed = depositorListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			throw badRequest("INVALID_QUERY", "Invalid query parameters", parsed.error.flatten());
		}
		const db = resolveDb();
		const row = await launchRepo.getLaunchById(db, id);
		if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

		const { limit, offset } = parsed.data;
		const [aggregates, total] = await Promise.all([
			launchRepo.listDepositors(db, id, { limit, offset }),
			launchRepo.countDepositors(db, id),
		]);

		// Optionally enrich with on-chain claimable state. If the service is
		// not configured, we return aggregates with claimable=null.
		const service = options.launchService ?? options.getService?.() ?? defaultService();
		const enrichOne = async (agg: (typeof aggregates)[number]) => {
			let claimable: string | null = null;
			if (service) {
				try {
					const pos = await service.readDepositorPosition(
						row.vaultAddress as `0x${string}`,
						agg.address as `0x${string}`,
					);
					claimable = pos.claimable.toString();
				} catch {
					claimable = null;
				}
			}
			return {
				address: agg.address,
				deposited: agg.netDeposit,
				grossDeposited: agg.deposited,
				withdrawn: agg.withdrawn,
				claimed: agg.claimed,
				claimable,
			};
		};
		// Bound the RPC fan-out: this endpoint is public and `limit` defaults to 1000
		// (max 5000), so an unbounded Promise.all would fire up to thousands of
		// concurrent reads at the shared provider per request. Page through in small
		// concurrent batches instead.
		const RPC_CONCURRENCY = 12;
		const enriched: Awaited<ReturnType<typeof enrichOne>>[] = [];
		for (let i = 0; i < aggregates.length; i += RPC_CONCURRENCY) {
			enriched.push(...(await Promise.all(aggregates.slice(i, i + RPC_CONCURRENCY).map(enrichOne))));
		}

		return respondOk(c, { depositors: enriched, count: enriched.length, total, limit, offset });
	});

	// GET /v2/launches/:id/depositors/:address — single user position.
	app.get(
		"/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/depositors/:address",
		async (c) => {
			const id = c.req.param("id");
			const userAddress = c.req.param("address");
			if (!userAddress || !addressRegex.test(userAddress)) {
				throw badRequest("INVALID_ADDRESS", "Invalid EVM address");
			}
			const normalized = userAddress.toLowerCase() as `0x${string}`;

			const db = resolveDb();
			const row = await launchRepo.getLaunchById(db, id);
			if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

			const aggregate = await launchRepo.getDepositorAggregate(db, id, normalized);

			const service = options.launchService ?? options.getService?.() ?? defaultService();
			let onchain: Awaited<ReturnType<LaunchService["readDepositorPosition"]>> | null = null;
			if (service) {
				try {
					onchain = await service.readDepositorPosition(row.vaultAddress as `0x${string}`, normalized);
				} catch {
					onchain = null;
				}
			}

			return respondOk(c, {
				address: normalized,
				deposited: onchain ? onchain.deposited.toString() : (aggregate?.netDeposit ?? "0"),
				totalAllocation: onchain ? onchain.totalAllocation.toString() : null,
				claimed: onchain ? onchain.claimed.toString() : (aggregate?.claimed ?? "0"),
				claimable: onchain ? onchain.claimable.toString() : null,
				vestingProgress: onchain?.vestingProgress ?? 0,
			});
		},
	);

	// POST /v2/launches/:id/preview — preview token allocation for a deposit.
	app.post("/:id{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}/preview", async (c) => {
		const id = c.req.param("id");
		const body = await parseJsonBody(c, previewBodySchema);

		const db = resolveDb();
		const row = await launchRepo.getLaunchById(db, id);
		if (!row) throw notFound("LAUNCH_NOT_FOUND", "Launch not found");

		const service = resolveService();
		const result = await service.previewAllocation(row.vaultAddress as `0x${string}`, {
			bnbAmount: body.bnbAmount,
		});

		return respondOk(c, {
			tokens: result.tokens.toString(),
			share: result.share,
			projectedValue: result.projectedValueBnb.toString(),
		});
	});

	return app;
}

// Default export wired to env-driven dependencies (used by v2/index.ts).
export default createAgentLaunchRoutes();
