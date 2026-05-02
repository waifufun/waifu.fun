import { type Context, Hono } from "hono";
import { getAddress, isAddress, parseEther } from "viem";

import { type Database, agentPersonaQueries, agentSafeQueries, getDatabase } from "@waifufun/db";
import {
	type CreateTokenParams,
	type LaunchpadAdapter,
	type LaunchpadFeeConfig,
	type LaunchpadId,
	getAdapter,
	getDefaultPlatformCutBps,
} from "@waifufun/launchpad";

import {
	type RequireAgentOwnershipBindings,
	requireAgentOwnership,
	requirePatron,
} from "../../middleware/patron-auth.js";
import {
	type DeployAgentSafeParams,
	type DeployAgentSafeResult,
	type UpdateAgentAutonomyConfig,
	deployAgentSafe,
	updateAgentAutonomy,
} from "../../services/agent-launch/index.js";

const CHAINS = new Set(["bsc", "solana", "base", "ethereum"]);

type JsonRecord = Record<string, unknown>;

type V3RouteOptions = {
	db?: Database;
	getLaunchpadAdapter?: (id: LaunchpadId) => LaunchpadAdapter | undefined;
	deployAgentSafe?: typeof deployAgentSafe;
};

type RouteContext = Context<RequireAgentOwnershipBindings>;

function requireDb(options?: V3RouteOptions): Database | null {
	if (options?.db) return options.db;
	const url = process.env.DATABASE_URL;
	if (!url) return null;
	return getDatabase(url).db;
}

function slugifyAgentId(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return `waifu-${slug || "agent"}-${crypto.randomUUID().slice(0, 8)}`;
}

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readBodyString(body: JsonRecord, snake: string, camel: string): string | undefined {
	const value = body[snake] ?? body[camel];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bigintToJson(value: unknown): unknown {
	if (typeof value === "bigint") return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(bigintToJson);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, entry]) => [key, bigintToJson(entry)]));
	}
	return value;
}

function withPlatformCutDefault(feeConfig: LaunchpadFeeConfig): LaunchpadFeeConfig {
	if (feeConfig.kind !== "four-meme-tax" && feeConfig.kind !== "flap") return feeConfig;
	if (typeof feeConfig.platformCutBps === "number") return feeConfig;
	return { ...feeConfig, platformCutBps: getDefaultPlatformCutBps() } as LaunchpadFeeConfig;
}

function resolveFeeConfig(adapter: LaunchpadAdapter, personaConfig: unknown, body: JsonRecord): LaunchpadFeeConfig {
	const defaultFeeConfig = adapter.getDefaultFeeConfig();
	const bodyFee = asRecord(body.fee_config ?? body.feeConfig);
	const personaRecord = asRecord(personaConfig);
	const personaFee = asRecord(personaRecord?.feeConfig ?? personaRecord?.fee_config);
	const kindOnlyPersona = personaRecord?.kind === defaultFeeConfig.kind ? personaRecord : null;
	return withPlatformCutDefault({
		...defaultFeeConfig,
		...(kindOnlyPersona ?? {}),
		...(personaFee ?? {}),
		...(bodyFee ?? {}),
	} as LaunchpadFeeConfig);
}

function resolveLaunchpadId(personaLaunchpadId: string | null, body: JsonRecord): LaunchpadId | null {
	const raw = readBodyString(body, "launchpad_id", "launchpadId") ?? personaLaunchpadId ?? null;
	return raw as LaunchpadId | null;
}

function resolvePatronAddress(c: RouteContext, body: JsonRecord) {
	const bodyAddress = readBodyString(body, "patron_address", "patronAddress");
	if (bodyAddress && isAddress(bodyAddress)) return getAddress(bodyAddress);
	const ownership = c.get("patronAgent");
	if (ownership?.ownerAddress && isAddress(ownership.ownerAddress)) {
		return getAddress(ownership.ownerAddress);
	}
	const patron = c.get("patron");
	if (patron?.primaryAddress && isAddress(patron.primaryAddress)) return getAddress(patron.primaryAddress);
	return null;
}

function safeMetadata(row: NonNullable<Awaited<ReturnType<typeof agentSafeQueries.getSafeByAgentId>>>) {
	return {
		...row,
		rolesModifierAddress: row.rolesModifierAddress ?? row.zodiacModifierAddress,
		autonomy: {
			zodiacModifierAddress: row.zodiacModifierAddress ?? row.rolesModifierAddress,
			rolesModifierAddress: row.rolesModifierAddress ?? row.zodiacModifierAddress,
			agentRoleId: row.agentRoleId,
			patronRoleId: row.patronRoleId,
		},
	};
}

export function createV3AgentRoutes(options?: V3RouteOptions) {
	const app = new Hono<RequireAgentOwnershipBindings>();

	app.post("/", async (c) => {
		const db = requireDb(options);
		if (!db) return c.json({ error: "database unavailable" }, 503);

		let body: Record<string, unknown>;
		try {
			body = (await c.req.json()) as Record<string, unknown>;
		} catch {
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name) return c.json({ error: "name is required" }, 400);

		const chain = typeof body.chain === "string" ? body.chain : undefined;
		if (chain && !CHAINS.has(chain)) {
			return c.json({ error: "invalid chain", allowed: [...CHAINS] }, 400);
		}

		const agentId =
			typeof body.agent_id === "string" && body.agent_id.trim()
				? body.agent_id.trim()
				: typeof body.agentId === "string" && body.agentId.trim()
					? body.agentId.trim()
					: slugifyAgentId(name);

		const persona = await agentPersonaQueries.createAgentPersona(db, {
			agentId,
			name,
			bio: typeof body.bio === "string" ? body.bio : null,
			avatarUrl: typeof body.avatar_url === "string" ? body.avatar_url : null,
			launchpadId: typeof body.launchpad_id === "string" ? body.launchpad_id : null,
			launchpadConfig: body.launchpad_config ?? null,
			chain: chain ?? null,
			metadata: body.metadata ?? null,
		});

		return c.json({ ok: true, agent: persona }, 201);
	});

	app.post("/:id/launch", requirePatron(), requireAgentOwnership(), async (c) => {
		const db = requireDb(options);
		if (!db) return c.json({ error: "database unavailable" }, 503);

		let body: JsonRecord;
		try {
			body = ((await c.req.json()) ?? {}) as JsonRecord;
		} catch {
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const ownedAgent = c.get("patronAgent");
		const persona =
			(await agentPersonaQueries.getAgentPersonaById(db, ownedAgent.id)) ??
			(await agentPersonaQueries.getAgentPersonaByAgentId(db, ownedAgent.agentId));
		if (!persona) return c.json({ ok: false, error: "agent not found" }, 404);

		const launchpadId = resolveLaunchpadId(persona.launchpadId, body);
		if (!launchpadId) return c.json({ ok: false, error: "launchpad_id is required" }, 400);
		const adapter = (options?.getLaunchpadAdapter ?? getAdapter)(launchpadId);
		if (!adapter) return c.json({ ok: false, error: "unknown launchpad", launchpadId }, 400);
		if (adapter.descriptor.status !== "live") {
			return c.json({ ok: false, error: "launchpad is not live", launchpadId }, 400);
		}

		const chain = readBodyString(body, "chain", "chain") ?? persona.chain ?? adapter.descriptor.chain;
		if (!CHAINS.has(chain) || chain !== adapter.descriptor.chain) {
			return c.json(
				{
					ok: false,
					error: "launchpad chain mismatch",
					chain,
					launchpadChain: adapter.descriptor.chain,
				},
				400,
			);
		}

		const feeConfig = resolveFeeConfig(adapter, persona.launchpadConfig, body);
		const validation = adapter.validateFeeConfig(feeConfig, "prod");
		if (!validation.ok) {
			return c.json({ ok: false, error: "invalid feeConfig", details: validation.errors }, 400);
		}

		const patronAddress = resolvePatronAddress(c, body);
		if (!patronAddress) {
			return c.json({ ok: false, error: "patron EVM wallet required to deploy agent Safe" }, 400);
		}
		const agentEoaRaw = readBodyString(body, "agent_eoa_address", "agentEoaAddress") ?? patronAddress;
		if (!isAddress(agentEoaRaw)) {
			return c.json({ ok: false, error: "agent_eoa_address must be an EVM address" }, 400);
		}

		let safe = await agentSafeQueries.getSafeByAgentId(db, persona.id, chain);
		if (!safe) {
			let deployed: DeployAgentSafeResult;
			try {
				deployed = await (options?.deployAgentSafe ?? deployAgentSafe)({
					agentId: persona.agentId,
					chain: chain as DeployAgentSafeParams["chain"],
					patronAddresses: [patronAddress],
					agentEoaAddress: getAddress(agentEoaRaw),
				});
			} catch (error) {
				return c.json({ ok: false, error: "safe deploy failed", message: (error as Error).message }, 502);
			}
			safe = await agentSafeQueries.insertAgentSafe(db, {
				agentId: persona.id,
				chain,
				chainId: 56,
				safeAddress: deployed.safeAddress,
				zodiacModifierAddress: deployed.modifierAddress,
				rolesModifierAddress: deployed.modifierAddress,
				agentRoleId: deployed.agentRoleId,
				patronRoleId: deployed.patronRoleId,
				deployTxHash: null,
			});
		}

		const name = readBodyString(body, "name", "name") ?? persona.name;
		const ticker = readBodyString(body, "ticker", "ticker") ?? readBodyString(body, "symbol", "symbol");
		const description = readBodyString(body, "description", "description") ?? persona.bio ?? name;
		const logoUrl = readBodyString(body, "logo_url", "logoUrl") ?? persona.avatarUrl;
		if (!ticker) return c.json({ ok: false, error: "ticker is required" }, 400);
		if (!logoUrl) return c.json({ ok: false, error: "logo_url is required" }, 400);

		const txParams: CreateTokenParams & { fourMemeSignedPayload?: unknown } = {
			name,
			ticker,
			description,
			logoUrl,
			feeConfig,
			founderAddress: safe.safeAddress,
		};
		const socials = asRecord(body.socials) as CreateTokenParams["socials"] | null;
		if (socials) txParams.socials = socials;
		if (body.initial_buy_bnb || body.initialBuyBnb) {
			txParams.initialBuyWei = parseEther(String(body.initial_buy_bnb ?? body.initialBuyBnb));
		}
		if (body.fourMemeSignedPayload) txParams.fourMemeSignedPayload = body.fourMemeSignedPayload;

		let tx: Awaited<ReturnType<LaunchpadAdapter["buildCreateTokenTx"]>>;
		try {
			tx = await adapter.buildCreateTokenTx(txParams);
		} catch (error) {
			return c.json({ ok: false, error: "launch transaction build failed", message: (error as Error).message }, 400);
		}

		const plan = {
			agentId: persona.agentId,
			personaId: persona.id,
			launchpadId,
			chain,
			safeAddress: safe.safeAddress,
			feeConfig,
			tx,
		};

		const signedPayload = asRecord(body.fourMemeSignedPayload);
		const personaUpdate: Parameters<typeof agentPersonaQueries.updateAgentPersona>[2] = {
			agentLaunchStatus: "prepared",
			launchpadId,
			launchpadConfig: {
				...(asRecord(persona.launchpadConfig) ?? {}),
				feeConfig,
				launchPlan: bigintToJson(plan),
			},
			chain,
			prelaunchParams: bigintToJson(txParams) as never,
		};
		if (typeof signedPayload?.createArg === "string") {
			personaUpdate.prelaunchCreateArg = signedPayload.createArg;
		}
		if (typeof signedPayload?.signature === "string") {
			personaUpdate.prelaunchSignature = signedPayload.signature;
		}
		await agentPersonaQueries.updateAgentPersona(db, persona.id, personaUpdate);

		return c.json({ ok: true, launchPlan: bigintToJson(plan), safe: safeMetadata(safe) }, 200);
	});

	app.get("/:id/safe", async (c) => {
		const db = requireDb(options);
		if (!db) return c.json({ error: "database unavailable" }, 503);

		const chain = c.req.query("chain");
		const routeId = c.req.param("id");
		const persona =
			(await agentPersonaQueries.getAgentPersonaById(db, routeId)) ??
			(await agentPersonaQueries.getAgentPersonaByAgentId(db, routeId));
		const safe = await agentSafeQueries.getSafeByAgentId(db, persona?.id ?? routeId, chain);
		if (!safe) return c.json({ error: "safe not found" }, 404);
		return c.json({ ok: true, safe: safeMetadata(safe) }, 200);
	});

	app.patch("/:id/autonomy", requirePatron(), requireAgentOwnership(), async (c) => {
		const db = requireDb(options);
		if (!db) return c.json({ error: "database unavailable" }, 503);

		let body: JsonRecord;
		try {
			body = ((await c.req.json()) ?? {}) as JsonRecord;
		} catch {
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const ownedAgent = c.get("patronAgent");
		const persona =
			(await agentPersonaQueries.getAgentPersonaById(db, ownedAgent.id)) ??
			(await agentPersonaQueries.getAgentPersonaByAgentId(db, ownedAgent.agentId));
		if (!persona) return c.json({ ok: false, error: "agent not found" }, 404);

		const chain = readBodyString(body, "chain", "chain") ?? persona.chain ?? "bsc";
		const safe = await agentSafeQueries.getSafeByAgentId(db, persona.id, chain);
		if (!safe) return c.json({ ok: false, error: "safe not found" }, 404);
		const modifierAddress = safe.zodiacModifierAddress ?? safe.rolesModifierAddress;
		if (!modifierAddress) {
			return c.json({ ok: false, error: "safe has no Zodiac roles modifier configured" }, 409);
		}

		try {
			const autonomyConfig: UpdateAgentAutonomyConfig = {};
			if (typeof body.maxPercentPortfolioPerTrade === "number") {
				autonomyConfig.maxPercentPortfolioPerTrade = body.maxPercentPortfolioPerTrade;
			}
			if (typeof body.maxTradesPer24h === "number") {
				autonomyConfig.maxTradesPer24h = body.maxTradesPer24h;
			}
			const whitelistedTargets = asRecord(body.whitelistedTargets);
			if (whitelistedTargets) autonomyConfig.whitelistedTargets = whitelistedTargets as never;
			const whitelistedTokens = asRecord(body.whitelistedTokens);
			if (whitelistedTokens) autonomyConfig.whitelistedTokens = whitelistedTokens as never;
			const agentEoaAddress = readBodyString(body, "agent_eoa_address", "agentEoaAddress");
			if (agentEoaAddress) autonomyConfig.agentEoaAddress = agentEoaAddress as `0x${string}`;
			const agentTokenAddress =
				readBodyString(body, "agent_token_address", "agentTokenAddress") ?? persona.tokenAddress;
			if (agentTokenAddress) {
				autonomyConfig.agentTokenAddress = agentTokenAddress as `0x${string}`;
			}
			const txs = updateAgentAutonomy(
				safe.safeAddress as `0x${string}`,
				modifierAddress as `0x${string}`,
				autonomyConfig,
			);
			return c.json({ ok: true, safe: safeMetadata(safe), transactions: bigintToJson(txs) }, 200);
		} catch (error) {
			return c.json({ ok: false, error: "invalid autonomy config", message: (error as Error).message }, 400);
		}
	});

	return app;
}

export default createV3AgentRoutes();
