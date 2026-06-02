import { and, eq, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { SignJWT } from "jose";
import { http, createPublicClient, erc20Abi, formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { z } from "zod";

import { agentPersonas, agentWallets, agents, getDatabase, tokens } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { type RequirePatronBindings, requirePatron } from "../middleware/patron-auth.js";
import {
	type ElizaAgentRuntimeStatus,
	type ElizaCloudClient,
	type ElizaCreditCheckoutResult,
	createElizaCloudClient,
	resolveElizaCloudApiKey,
} from "../services/eliza-client.js";

const app = new Hono<RequirePatronBindings>();

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

const runtimeActivationSchema = z
	.object({
		billingMode: z.enum(["owner_credits", "waifu_treasury_subsidy", "hybrid"]).optional(),
		character: z
			.object({
				name: z.string().trim().min(1).max(100).optional(),
				bio: z.string().trim().max(10_000).optional(),
				avatar: z.string().trim().max(2048).optional(),
			})
			.optional(),
	})
	.default({});

const creditTopUpSchema = z
	.object({
		creditsAmount: z.number().positive().optional(),
		amountUsdCents: z.number().int().positive().optional(),
		amountUsd: z.number().positive().optional(),
	})
	.default({});

export type TokenRuntimeRow = {
	token: typeof tokens.$inferSelect;
	agent: typeof agents.$inferSelect | null;
	persona: typeof agentPersonas.$inferSelect | null;
};

type CreditTopUpInput = z.infer<typeof creditTopUpSchema>;
type ChatAccessRole = "guest" | "user" | "admin";

type TokenBalanceSnapshot = {
	balance: bigint;
	decimals: number;
};

type ChatAccessDeps = {
	readTokenBalance?: (input: {
		chainId: number;
		tokenAddress: string;
		walletAddress: string;
	}) => Promise<TokenBalanceSnapshot>;
	now?: () => Date;
	signingSecret?: string;
};

const GUEST_MIN_TOKENS = 1_000;
const USER_MIN_TOKENS = 100_000;
let chatAccessDepsForTest: ChatAccessDeps = {};
let dbForTest: Database | undefined;
let elizaClientForTest: ElizaCloudClient | undefined;

export function __setOwnerTokenChatAccessDepsForTest(deps: ChatAccessDeps): void {
	chatAccessDepsForTest = deps;
}

export function __setOwnerTokenDbForTest(db: Database | undefined): void {
	dbForTest = db;
}

export function __setOwnerTokenElizaClientForTest(client: ElizaCloudClient | undefined): void {
	elizaClientForTest = client;
}

function requireDb(): Database | null {
	if (dbForTest) return dbForTest;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function normalizeAddress(value: string): string {
	return value.toLowerCase();
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
	const raw = value[key];
	return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function getProvisioning(persona: TokenRuntimeRow["persona"]): Record<string, unknown> {
	return recordFromUnknown(recordFromUnknown(persona?.metadata).provisioning);
}

function getContainerId(row: TokenRuntimeRow): string | null {
	const provisioning = getProvisioning(row.persona);
	return (
		stringField(provisioning, "containerId") ??
		stringField(provisioning, "cloudAgentId") ??
		stringField(provisioning, "runtimeAgentId") ??
		row.agent?.bridgeUrl ??
		row.agent?.cloudAgentId ??
		null
	);
}

function getCloudAgentId(row: TokenRuntimeRow): string | null {
	const provisioning = getProvisioning(row.persona);
	return (
		stringField(provisioning, "cloudAgentId") ??
		stringField(provisioning, "runtimeAgentId") ??
		row.agent?.cloudAgentId ??
		null
	);
}

// Sol conflict-resolution (#896): the DISPLAY/hosted-URL returned to the frontend
// keeps develop's `webUiUrl ?? containerUrl` fallback, so containerUrl-only agents
// (no webUiUrl yet) still surface a URL. #896's webUiUrl-only check is honored for
// the LIVE-STATE gate only (see getHostedLiveUrl below).
function getHostedWebUiUrl(row: TokenRuntimeRow): string | null {
	const provisioning = getProvisioning(row.persona);
	return (
		stringField(provisioning, "webUiUrl") ?? stringField(provisioning, "containerUrl") ?? row.agent?.webUiUrl ?? null
	);
}

// Live-state GATE value: webUiUrl-only (no containerUrl fallback), per #896's intent
// that an agent only flips to "live"/"running" once a real webUiUrl exists.
function getHostedLiveUrl(row: TokenRuntimeRow): string | null {
	const provisioning = getProvisioning(row.persona);
	return stringField(provisioning, "webUiUrl") ?? row.agent?.webUiUrl ?? null;
}

function serializeRuntime(row: TokenRuntimeRow) {
	const cloudAgentId = getCloudAgentId(row);
	const webUiUrl = getHostedWebUiUrl(row);
	const status = row.agent?.agentStatus ?? row.token.agentStatus ?? "none";
	return {
		mint: row.token.contractAddress,
		chain: "evm",
		chainId: row.token.chainId,
		claimStatus: row.token.ownerClaimStatus,
		claimedAt: null,
		creatorWallet: row.token.creatorAddress,
		cloudAgentId: cloudAgentId ?? undefined,
		agentStatus: status,
		agentLifecycleState: row.agent?.lifecycleState ?? null,
		webUiUrl: webUiUrl ?? undefined,
		billingMode: row.agent?.billingMode ?? "owner_credits",
		infraReserveUsd: row.agent?.infraReserveUsd == null ? 5 : Number(row.agent.infraReserveUsd),
		lastHeartbeatAt: row.agent?.lastHeartbeatAt?.toISOString() ?? null,
		suspendedReason: row.agent?.suspendedReason ?? null,
		hasAgent: Boolean(cloudAgentId || webUiUrl || status !== "none"),
	};
}

function isHostedRuntimeRunning(status: string | null | undefined): boolean {
	return ["running", "ready", "online", "active", "started"].includes(String(status ?? "").toLowerCase());
}

function runtimeOverlayFromStatus(
	row: TokenRuntimeRow,
	cloudAgentId: string,
	status: ElizaAgentRuntimeStatus | null | undefined,
): {
	cloudAgentId: string;
	containerId: string | null;
	webUiUrl: string | null;
	agentStatus: string;
	lifecycleState: string;
	suspendedReason: string | null;
} {
	const runtimeStatus = status?.status ?? row.agent?.agentStatus ?? row.token.agentStatus ?? "provisioning";
	// Display URL keeps the containerUrl fallback; the live gate uses webUiUrl-only.
	const webUiUrl = status?.webUiUrl ?? getHostedWebUiUrl(row);
	const liveUrl = status?.webUiUrl ?? getHostedLiveUrl(row);
	const running = isHostedRuntimeRunning(runtimeStatus) && Boolean(liveUrl);
	const agentStatus = running
		? "running"
		: isHostedRuntimeRunning(runtimeStatus)
			? "provisioning"
			: String(runtimeStatus || "provisioning");
	return {
		cloudAgentId,
		containerId: status?.containerId ?? getContainerId(row),
		webUiUrl,
		agentStatus,
		lifecycleState: running ? "live" : "birth",
		suspendedReason: running ? null : (row.agent?.suspendedReason ?? null),
	};
}

async function runtimeOverlayAfterControl(
	client: ElizaCloudClient,
	row: TokenRuntimeRow,
	cloudAgentId: string,
	fallbackStatus: ElizaAgentRuntimeStatus,
): Promise<ReturnType<typeof runtimeOverlayFromStatus>> {
	if (!client.getAgentRuntimeStatus) return runtimeOverlayFromStatus(row, cloudAgentId, fallbackStatus);
	const status = await client.getAgentRuntimeStatus(cloudAgentId);
	return runtimeOverlayFromStatus(row, cloudAgentId, status);
}

async function loadTokenRuntime(
	db: Database,
	chainId: number,
	contractAddress: string,
): Promise<TokenRuntimeRow | null> {
	const [row] = await db
		.select({
			token: tokens,
			agent: agents,
			persona: agentPersonas,
		})
		.from(tokens)
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.leftJoin(agentPersonas, sql`lower(${agentPersonas.tokenAddress}) = lower(${tokens.contractAddress})`)
		.where(and(eq(tokens.chainId, chainId), eq(tokens.contractAddress, normalizeAddress(contractAddress))))
		.limit(1);
	return row ?? null;
}

async function loadAgentWalletAddress(db: Database, agentId: string): Promise<string | null> {
	const [wallet] = await db
		.select({ walletAddress: agentWallets.walletAddress })
		.from(agentWallets)
		.where(eq(agentWallets.internalAgentId, agentId))
		.limit(1);
	return wallet?.walletAddress ?? null;
}

async function ensureAgentOverlay(
	db: Database,
	row: TokenRuntimeRow,
	input: {
		cloudAgentId?: string | null;
		webUiUrl?: string | null;
		containerId?: string | null;
		agentStatus: string;
		lifecycleState: string;
		billingMode?: string | null;
		infraReserveUsd?: number | null;
		suspendedReason?: string | null;
	},
): Promise<void> {
	const now = new Date();
	if (row.agent) {
		await db
			.update(agents)
			.set({
				...(input.cloudAgentId !== undefined ? { cloudAgentId: input.cloudAgentId } : {}),
				runtimeProvider: "eliza-cloud",
				agentStatus: input.agentStatus,
				lifecycleState: input.lifecycleState,
				...(input.webUiUrl !== undefined ? { webUiUrl: input.webUiUrl } : {}),
				...(input.containerId !== undefined ? { bridgeUrl: input.containerId } : {}),
				...(input.billingMode ? { billingMode: input.billingMode } : {}),
				...(input.infraReserveUsd != null ? { infraReserveUsd: String(input.infraReserveUsd) } : {}),
				...(input.suspendedReason !== undefined ? { suspendedReason: input.suspendedReason } : {}),
				updatedAt: now,
			})
			.where(eq(agents.id, row.agent.id));
	} else {
		const [created] = await db
			.insert(agents)
			.values({
				tokenId: row.token.id,
				name: row.token.name,
				bio: row.token.description ?? null,
				avatarUrl: row.token.imageUrl ?? null,
				cloudAgentId: input.cloudAgentId ?? null,
				runtimeProvider: "eliza-cloud",
				agentStatus: input.agentStatus,
				lifecycleState: input.lifecycleState,
				webUiUrl: input.webUiUrl ?? null,
				bridgeUrl: input.containerId ?? null,
				billingMode: input.billingMode ?? "owner_credits",
				infraReserveUsd: String(input.infraReserveUsd ?? 5),
				suspendedReason: input.suspendedReason ?? null,
			})
			.returning({ id: agents.id });
		if (created) {
			await db.update(tokens).set({ agentId: created.id, updatedAt: now }).where(eq(tokens.id, row.token.id));
		}
	}

	await db
		.update(tokens)
		.set({
			agentStatus: input.agentStatus,
			ownerClaimStatus: row.token.ownerClaimStatus === "unclaimed" ? "claimed" : row.token.ownerClaimStatus,
			updatedAt: now,
		})
		.where(eq(tokens.id, row.token.id));

	if (input.cloudAgentId && row.persona?.agentId) {
		const metadata = recordFromUnknown(row.persona.metadata);
		const provisioning = recordFromUnknown(metadata.provisioning);
		await db
			.update(agentPersonas)
			.set({
				elizaCloudAgentId: input.cloudAgentId,
				metadata: {
					...metadata,
					provisioning: {
						...provisioning,
						runtimeKind: "eliza-cloud",
						provider: "eliza-cloud",
						cloudAgentId: input.cloudAgentId,
						runtimeAgentId: input.cloudAgentId,
						containerId: input.containerId ?? provisioning.containerId ?? null,
						containerUrl: provisioning.containerUrl ?? null,
						webUiUrl: input.webUiUrl ?? provisioning.webUiUrl ?? null,
						status: input.agentStatus,
						updatedAt: now.toISOString(),
					},
				},
				updatedAt: now,
			})
			.where(eq(agentPersonas.agentId, row.persona.agentId));
	}
}

function getElizaClient() {
	if (elizaClientForTest) return elizaClientForTest;
	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://elizacloud.ai";
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY;
	const apiKey = resolveElizaCloudApiKey();
	if (!serviceKey && !apiKey) throw new Error("Eliza Cloud is not configured (set ELIZA_CLOUD_SERVICE_KEY)");
	return createElizaCloudClient({
		baseUrl,
		...(serviceKey ? { serviceKey } : {}),
		...(apiKey ? { apiKey } : {}),
		logger: console,
	});
}

async function requireOwnedToken(c: Context<RequirePatronBindings>) {
	const db = requireDb();
	if (!db) return { response: c.json({ success: false, error: "DATABASE_UNAVAILABLE" }, 503), row: null, db: null };

	const chainId = Number(c.req.param("chainId"));
	const contractAddress = c.req.param("contractAddress");
	if (!Number.isFinite(chainId) || !contractAddress || !addressRegex.test(contractAddress)) {
		return { response: c.json({ success: false, error: "INVALID_TOKEN" }, 400), row: null, db };
	}

	const row = await loadTokenRuntime(db, chainId, contractAddress);
	if (!row) return { response: c.json({ success: false, error: "TOKEN_NOT_FOUND" }, 404), row: null, db };

	const patron = c.get("patron");
	const owner = row.token.creatorAddress?.toLowerCase();
	const patronWallet = patron?.primaryAddress?.toLowerCase();
	if (!owner || !patronWallet || owner !== patronWallet) {
		return {
			response: c.json({ success: false, error: "FORBIDDEN", message: "wallet does not own token" }, 403),
			row: null,
			db,
		};
	}

	return { response: null, row, db };
}

async function loadAccessibleToken(c: Context<RequirePatronBindings>) {
	const db = requireDb();
	if (!db) return { response: c.json({ success: false, error: "DATABASE_UNAVAILABLE" }, 503), row: null, db: null };

	const chainId = Number(c.req.param("chainId"));
	const contractAddress = c.req.param("contractAddress");
	if (!Number.isFinite(chainId) || !contractAddress || !addressRegex.test(contractAddress)) {
		return { response: c.json({ success: false, error: "INVALID_TOKEN" }, 400), row: null, db };
	}

	const row = await loadTokenRuntime(db, chainId, contractAddress);
	if (!row) return { response: c.json({ success: false, error: "TOKEN_NOT_FOUND" }, 404), row: null, db };

	return { response: null, row, db };
}

export async function resolveTokenChatAccess(
	row: TokenRuntimeRow,
	walletAddress: string,
	deps: ChatAccessDeps = {},
): Promise<{ role: ChatAccessRole | null; balanceTokens: number }> {
	const canonicalWallet = getAddress(walletAddress);
	if (
		sameAddress(canonicalWallet, row.token.creatorAddress) ||
		sameAddress(canonicalWallet, row.persona?.ownerAddress)
	) {
		return { role: "admin", balanceTokens: Number.POSITIVE_INFINITY };
	}

	const readTokenBalance = deps.readTokenBalance ?? readErc20TokenBalance;
	const snapshot = await readTokenBalance({
		chainId: row.token.chainId,
		tokenAddress: row.token.contractAddress,
		walletAddress: canonicalWallet,
	});
	const userThreshold = parseUnits(String(USER_MIN_TOKENS), snapshot.decimals);
	const guestThreshold = parseUnits(String(GUEST_MIN_TOKENS), snapshot.decimals);
	const balanceTokens = Number(formatUnits(snapshot.balance, snapshot.decimals));

	if (snapshot.balance > userThreshold) return { role: "user", balanceTokens };
	if (snapshot.balance > guestThreshold) return { role: "guest", balanceTokens };
	return { role: null, balanceTokens };
}

async function signChatAccessToken(input: {
	row: TokenRuntimeRow;
	walletAddress: string;
	role: ChatAccessRole;
	balanceTokens: number;
	secret?: string | null;
	now: Date;
}): Promise<string> {
	if (!input.secret) {
		throw new Error("WAIFU_CHAT_ACCESS_JWT_SECRET is required to issue hosted chat sessions");
	}
	const cloudAgentId = getCloudAgentId(input.row);
	const encoder = new TextEncoder();
	return new SignJWT({
		role: input.role,
		walletAddress: input.walletAddress,
		tokenAddress: input.row.token.contractAddress,
		chainId: input.row.token.chainId,
		cloudAgentId,
		balanceTokens: Number.isFinite(input.balanceTokens) ? input.balanceTokens : null,
		guestMinTokens: GUEST_MIN_TOKENS,
		userMinTokens: USER_MIN_TOKENS,
		thresholdMode: "strict_gt",
	})
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setIssuer("waifu.fun")
		.setAudience("eliza-cloud-chat")
		.setSubject(input.walletAddress)
		.setIssuedAt(Math.floor(input.now.getTime() / 1000))
		.setExpirationTime(Math.floor(input.now.getTime() / 1000) + 15 * 60)
		.sign(encoder.encode(input.secret));
}

async function readErc20TokenBalance(input: {
	chainId: number;
	tokenAddress: string;
	walletAddress: string;
}): Promise<TokenBalanceSnapshot> {
	const chain = input.chainId === 97 ? bscTestnet : bsc;
	const rpcUrl =
		input.chainId === 97
			? (process.env.BSC_TESTNET_RPC_URL ?? process.env.BSC_RPC_URL ?? process.env.RPC_URL)
			: (process.env.BSC_RPC_URL ?? process.env.RPC_URL ?? "https://bsc-dataseed.binance.org");
	const client = createPublicClient({ chain, transport: http(rpcUrl) });
	const [balance, decimals] = await Promise.all([
		client.readContract({
			address: getAddress(input.tokenAddress),
			abi: erc20Abi,
			functionName: "balanceOf",
			args: [getAddress(input.walletAddress)],
		}),
		client.readContract({
			address: getAddress(input.tokenAddress),
			abi: erc20Abi,
			functionName: "decimals",
		}),
	]);
	return { balance, decimals };
}

function appendChatAccessToken(chatUrl: string, token: string): string {
	try {
		const url = new URL(chatUrl);
		url.searchParams.set("waifu_access_token", token);
		return url.toString();
	} catch {
		const separator = chatUrl.includes("?") ? "&" : "?";
		return `${chatUrl}${separator}waifu_access_token=${encodeURIComponent(token)}`;
	}
}

app.use("/tokens/*", requirePatron());

app.post("/tokens/:chain/:chainId/:contractAddress/claim", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;
	await resolved.db
		.update(tokens)
		.set({ ownerClaimStatus: "claimed", updatedAt: new Date() })
		.where(eq(tokens.id, resolved.row.token.id));
	const fresh = await loadTokenRuntime(resolved.db, resolved.row.token.chainId, resolved.row.token.contractAddress);
	return c.json({ success: true, claim: fresh ? serializeRuntime(fresh) : serializeRuntime(resolved.row) });
});

app.get("/tokens/:chain/:chainId/:contractAddress/runtime", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;
	return c.json({ success: true, runtime: serializeRuntime(resolved.row) });
});

app.get("/tokens/:chain/:chainId/:contractAddress/chat-session", async (c) => {
	const resolved = await loadAccessibleToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;

	const patron = c.get("patron");
	const walletAddress = patron?.primaryAddress;
	if (!walletAddress || !isAddress(walletAddress)) {
		return c.json({ success: false, error: "WALLET_REQUIRED", message: "connect an EVM wallet to chat" }, 401);
	}

	const cloudAgentId = getCloudAgentId(resolved.row);
	const chatUrl = getHostedWebUiUrl(resolved.row);
	if (!cloudAgentId || !chatUrl) {
		return c.json(
			{
				success: false,
				error: "CHAT_UNAVAILABLE",
				message: "agent chat is not provisioned yet",
				cloudAgentId: cloudAgentId ?? null,
				hasChatUrl: Boolean(chatUrl),
			},
			409,
		);
	}
	if (!isHostedRuntimeRunning(resolved.row.agent?.agentStatus ?? resolved.row.token.agentStatus)) {
		return c.json(
			{
				success: false,
				error: "CHAT_UNAVAILABLE",
				message: "agent chat is not running",
				agentStatus: resolved.row.agent?.agentStatus ?? resolved.row.token.agentStatus ?? "none",
			},
			409,
		);
	}

	const access = await resolveTokenChatAccess(resolved.row, walletAddress, chatAccessDepsForTest);
	if (!access.role) {
		return c.json(
			{
				success: false,
				error: "INSUFFICIENT_TOKEN_BALANCE",
				message: `hold more than ${GUEST_MIN_TOKENS} tokens for guest chat access`,
				balanceTokens: access.balanceTokens,
				requiredTokens: GUEST_MIN_TOKENS,
				thresholdMode: "strict_gt",
			},
			403,
		);
	}

	let token: string;
	try {
		const secret = chatAccessDepsForTest.signingSecret ?? process.env.WAIFU_CHAT_ACCESS_JWT_SECRET ?? null;
		token = await signChatAccessToken({
			row: resolved.row,
			walletAddress: getAddress(walletAddress),
			role: access.role,
			balanceTokens: access.balanceTokens,
			secret,
			now: chatAccessDepsForTest.now?.() ?? new Date(),
		});
	} catch (err) {
		if (err instanceof Error && err.message.includes("WAIFU_CHAT_ACCESS_JWT_SECRET")) {
			return c.json({ success: false, error: "CHAT_ACCESS_NOT_CONFIGURED", message: err.message }, 503);
		}
		throw err;
	}

	return c.json({
		success: true,
		chatUrl: appendChatAccessToken(chatUrl, token),
		role: access.role,
		balanceTokens: access.balanceTokens,
		expiresInSeconds: 15 * 60,
		thresholds: {
			guestMinTokens: GUEST_MIN_TOKENS,
			userMinTokens: USER_MIN_TOKENS,
			mode: "strict_gt",
		},
	});
});

app.get("/tokens/:chain/:chainId/:contractAddress/billing", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;
	const runtime = serializeRuntime(resolved.row);
	return c.json({
		success: true,
		billingMode: runtime.billingMode,
		infraReserveUsd: runtime.infraReserveUsd,
		agentStatus: runtime.agentStatus,
		estimatedDailyBurnUsd: null,
		currentPeriodCostUsd: null,
		fundingSource: runtime.billingMode,
	});
});

app.post("/tokens/:chain/:chainId/:contractAddress/runtime/activate", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;

	const body = runtimeActivationSchema.parse(await c.req.json().catch(() => ({})));
	const persona = resolved.row.persona;
	const agentId = persona?.agentId ?? `token-${resolved.row.token.id}`;
	const agentWalletAddress = persona?.agentId ? await loadAgentWalletAddress(resolved.db, persona.agentId) : null;
	if (!agentWalletAddress) {
		return c.json(
			{
				success: false,
				error: "AGENT_WALLET_NOT_FOUND",
				message: "Eliza Cloud activation requires the agent EVM wallet managed by Steward.",
			},
			409,
		);
	}

	await ensureAgentOverlay(resolved.db, resolved.row, {
		agentStatus: "provisioning",
		lifecycleState: "birth",
		billingMode: body.billingMode ?? "owner_credits",
		infraReserveUsd: 5,
	});

	const client = getElizaClient();
	const bio = body.character?.bio ?? resolved.row.token.description;
	const avatar = body.character?.avatar ?? resolved.row.token.imageUrl;
	const cloud = await client.provisionWaifuAgent?.({
		agentId,
		tokenContractAddress: resolved.row.token.contractAddress,
		chain: c.req.param("chain") || "bsc",
		chainId: resolved.row.token.chainId,
		tokenName: resolved.row.token.name,
		tokenTicker: resolved.row.token.ticker,
		launchType: resolved.row.token.isImported ? "imported" : "native",
		character: {
			name: body.character?.name ?? resolved.row.token.name,
			...(bio ? { bio } : {}),
			...(avatar ? { avatar } : {}),
			config: { persona: persona?.metadata ?? {}, ownerRuntimeActivation: true },
		},
		billing: { mode: body.billingMode ?? "owner_credits", initialReserveUsd: 5 },
		account: {
			primaryWalletAddress: agentWalletAddress,
			walletKeyRef: `steward:${agentId}`,
		},
		access: {
			guestMinTokens: 1_000,
			userMinTokens: 100_000,
			adminWallets: [resolved.row.token.creatorAddress],
		},
	});
	if (!cloud) throw new Error("Eliza Cloud client did not return a provisioning result");

	const hasHostedRuntimeUrl = Boolean(cloud.webUiUrl);
	const isRunningWithHostedRuntime = isHostedRuntimeRunning(cloud.status) && hasHostedRuntimeUrl;
	await ensureAgentOverlay(resolved.db, resolved.row, {
		cloudAgentId: cloud.cloudAgentId,
		webUiUrl: cloud.webUiUrl ?? null,
		containerId: cloud.containerId ?? null,
		agentStatus: isRunningWithHostedRuntime ? "running" : "provisioning",
		lifecycleState: isRunningWithHostedRuntime ? "live" : "birth",
		billingMode: body.billingMode ?? "owner_credits",
		infraReserveUsd: 5,
		suspendedReason: null,
	});

	const fresh = await loadTokenRuntime(resolved.db, resolved.row.token.chainId, resolved.row.token.contractAddress);
	return c.json({ success: true, runtime: fresh ? serializeRuntime(fresh) : serializeRuntime(resolved.row), cloud });
});

app.post("/tokens/:chain/:chainId/:contractAddress/runtime/suspend", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;
	const cloudAgentId = getCloudAgentId(resolved.row);
	if (!cloudAgentId) return c.json({ success: false, error: "RUNTIME_NOT_FOUND" }, 409);
	await getElizaClient().pauseAgent(cloudAgentId);
	await ensureAgentOverlay(resolved.db, resolved.row, {
		cloudAgentId,
		containerId: getContainerId(resolved.row),
		agentStatus: "suspended",
		lifecycleState: "dormant",
		suspendedReason: "owner_requested",
	});
	const fresh = await loadTokenRuntime(resolved.db, resolved.row.token.chainId, resolved.row.token.contractAddress);
	return c.json({ success: true, runtime: fresh ? serializeRuntime(fresh) : serializeRuntime(resolved.row) });
});

app.post("/tokens/:chain/:chainId/:contractAddress/runtime/resume", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;
	const cloudAgentId = getCloudAgentId(resolved.row);
	if (!cloudAgentId) return c.json({ success: false, error: "RUNTIME_NOT_FOUND" }, 409);
	const client = getElizaClient();
	await client.resumeAgent(cloudAgentId);
	const overlay = await runtimeOverlayAfterControl(client, resolved.row, cloudAgentId, { status: "running" });
	await ensureAgentOverlay(resolved.db, resolved.row, overlay);
	const fresh = await loadTokenRuntime(resolved.db, resolved.row.token.chainId, resolved.row.token.contractAddress);
	return c.json({ success: true, runtime: fresh ? serializeRuntime(fresh) : serializeRuntime(resolved.row) });
});

app.post("/tokens/:chain/:chainId/:contractAddress/runtime/restart", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;
	const cloudAgentId = getCloudAgentId(resolved.row);
	if (!cloudAgentId) return c.json({ success: false, error: "RUNTIME_NOT_FOUND" }, 409);
	const client = getElizaClient();
	if (client.restartHostedAgent) {
		await client.restartHostedAgent(cloudAgentId);
	} else {
		await client.pauseAgent(cloudAgentId);
		await client.resumeAgent(cloudAgentId);
	}
	const overlay = await runtimeOverlayAfterControl(client, resolved.row, cloudAgentId, { status: "running" });
	await ensureAgentOverlay(resolved.db, resolved.row, overlay);
	const fresh = await loadTokenRuntime(resolved.db, resolved.row.token.chainId, resolved.row.token.contractAddress);
	return c.json({ success: true, runtime: fresh ? serializeRuntime(fresh) : serializeRuntime(resolved.row) });
});

app.post("/tokens/:chain/:chainId/:contractAddress/billing/top-up", async (c) => {
	const resolved = await requireOwnedToken(c);
	if (!resolved.db || !resolved.row) return resolved.response;

	const body = creditTopUpSchema.parse(await c.req.json().catch(() => ({})));
	const result = await topUpOwnedTokenRuntime(resolved.db, resolved.row, body, getElizaClient()).catch((err) => {
		if (err instanceof Error && err.message === "INVALID_CREDITS_AMOUNT") return null;
		if (err instanceof Error && err.message === "RUNTIME_NOT_FOUND") return "RUNTIME_NOT_FOUND" as const;
		throw err;
	});
	if (!result) {
		return c.json({ success: false, error: "INVALID_CREDITS_AMOUNT" }, 400);
	}
	if (result === "RUNTIME_NOT_FOUND") {
		return c.json(
			{
				success: false,
				error: "RUNTIME_NOT_FOUND",
				message: "Eliza Cloud top-up requires a provisioned cloud agent.",
			},
			409,
		);
	}

	const fresh = await loadTokenRuntime(resolved.db, resolved.row.token.chainId, resolved.row.token.contractAddress);
	return c.json({
		success: true,
		creditsAmount: result.creditsAmount,
		creditsUnit: "usd_cents",
		checkout: result.checkout,
		checkoutUrl: result.checkoutUrl,
		runtime: fresh ? serializeRuntime(fresh) : serializeRuntime(resolved.row),
	});
});

export async function topUpOwnedTokenRuntime(
	db: Database,
	row: TokenRuntimeRow,
	input: CreditTopUpInput,
	client: Pick<ElizaCloudClient, "topUpCredits">,
): Promise<{
	creditsAmount: number;
	containerId: string | null;
	checkout: ElizaCreditCheckoutResult;
	checkoutUrl: string | null;
}> {
	const creditsAmount = input.creditsAmount ?? input.amountUsdCents ?? Math.round((input.amountUsd ?? 5) * 100);
	if (!Number.isFinite(creditsAmount) || creditsAmount <= 0) {
		throw new Error("INVALID_CREDITS_AMOUNT");
	}
	const cloudAgentId = getCloudAgentId(row);
	if (!cloudAgentId) {
		throw new Error("RUNTIME_NOT_FOUND");
	}
	const containerId = getContainerId(row);
	const creditsUsd = creditsAmount / 100;
	const checkout = (await client.topUpCredits(cloudAgentId, creditsUsd)) ?? {};
	const checkoutUrl = checkoutUrlFromResult(checkout);

	const currentReserve = row.agent?.infraReserveUsd == null ? 0 : Number(row.agent.infraReserveUsd);
	await ensureAgentOverlay(db, row, {
		cloudAgentId: getCloudAgentId(row),
		webUiUrl: getHostedWebUiUrl(row),
		containerId,
		agentStatus: row.agent?.agentStatus ?? row.token.agentStatus ?? "provisioning",
		lifecycleState: row.agent?.lifecycleState ?? "birth",
		billingMode: row.agent?.billingMode ?? "owner_credits",
		infraReserveUsd: Number.isFinite(currentReserve) ? currentReserve : 0,
		suspendedReason: checkoutUrl ? "credits_checkout_pending" : (row.agent?.suspendedReason ?? null),
	});
	return { creditsAmount, containerId, checkout, checkoutUrl };
}

function checkoutUrlFromResult(checkout: ElizaCreditCheckoutResult): string | null {
	const url = checkout.url ?? checkout.checkoutUrl;
	return typeof url === "string" && url.length > 0 ? url : null;
}

export default app;
