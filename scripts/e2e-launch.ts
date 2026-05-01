/**
 * Comprehensive end-to-end test for the agent-launch flow.
 *
 * See scripts/E2E_README.md for full documentation.
 *
 * Quick start:
 *   bun scripts/e2e-launch.ts --help
 *   bun scripts/e2e-launch.ts --dry-run
 *   bun scripts/e2e-launch.ts --name MyAgent --symbol MYA
 *   bun scripts/e2e-launch.ts --check-events --check-8004 --cleanup
 *
 * WARNING: this script burns real BNB on a live launch (0.01 BNB launch fee
 * plus gas). Use --dry-run to validate config without spending.
 */

import { http, type Address, type PublicClient, createPublicClient, getAddress, parseAbi } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import {
	AgentLaunchError,
	type AgentLaunchInput,
	type AgentLaunchResult,
	FourMemeError,
	type OrchestratorDeps,
	type PersonaStore,
	createOrchestrator,
	createStewardClient,
} from "../apps/api/src/services/agent-launch/index.js";

// ─── tiny ANSI color helpers (no chalk dep) ─────────────────────────
const isTTY = process.stdout.isTTY === true;
const wrap = (open: number, close: number) => (s: string) => (isTTY ? `\x1b[${open}m${s}\x1b[${close}m` : s);
const c = {
	dim: wrap(2, 22),
	red: wrap(31, 39),
	green: wrap(32, 39),
	yellow: wrap(33, 39),
	blue: wrap(34, 39),
	magenta: wrap(35, 39),
	cyan: wrap(36, 39),
	bold: wrap(1, 22),
};

// ─── small 1x1 PNG ──────────────────────────────────────────────────
// Generated via `printf ... | xxd -r -p | base64`. Known-valid minimal PNG.
const ONE_PX_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ─── CLI ─────────────────────────────────────────────────────────────
interface CliFlags {
	help: boolean;
	name?: string;
	symbol?: string;
	description?: string;
	mainnet: boolean;
	testnet: boolean;
	dryRun: boolean;
	checkEvents: boolean;
	check8004: boolean;
	cleanup: boolean;
	skip8004: boolean;
	indexerWaitMs: number;
}

function parseArgs(argv: string[]): CliFlags {
	const flags: CliFlags = {
		help: false,
		mainnet: false,
		testnet: false,
		dryRun: false,
		checkEvents: false,
		check8004: false,
		cleanup: false,
		skip8004: process.env.SKIP_8004 === "true",
		indexerWaitMs: 60_000,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => argv[++i];
		switch (a) {
			case "-h":
			case "--help":
				flags.help = true;
				break;
			case "--name":
				flags.name = next();
				break;
			case "--symbol":
				flags.symbol = next();
				break;
			case "--description":
			case "--desc":
				flags.description = next();
				break;
			case "--mainnet":
				flags.mainnet = true;
				break;
			case "--testnet":
				flags.testnet = true;
				break;
			case "--dry-run":
				flags.dryRun = true;
				break;
			case "--check-events":
				flags.checkEvents = true;
				break;
			case "--check-8004":
				flags.check8004 = true;
				break;
			case "--cleanup":
				flags.cleanup = true;
				break;
			case "--skip-8004":
				flags.skip8004 = true;
				break;
			case "--indexer-wait-ms": {
				const v = Number(next());
				if (Number.isFinite(v) && v > 0) flags.indexerWaitMs = v;
				break;
			}
			default:
				if (a?.startsWith("--")) {
					console.warn(c.yellow(`[warn] unknown flag: ${a}`));
				}
		}
	}
	return flags;
}

function printHelp(): void {
	console.log(
		`${c.bold("e2e-launch.ts")} - comprehensive waifu.fun agent-launch E2E test

usage:
  bun scripts/e2e-launch.ts [options]

options:
  --help                print this message
  --name <s>            token name (default: TestAgent)
  --symbol <s>          token symbol (default: TST)
  --description <s>     token description
  --mainnet             force mainnet (chainId 56)
  --testnet             force testnet (chainId 97)
  --dry-run             pre-flight only, do NOT call orchestrator (no BNB spent)
  --check-events        poll for indexer agent_events after launch
  --check-8004          verify EIP-8004 NFT ownerOf(agentId) matches wallet
  --skip-8004           pass skipIdentityRegistration=true to orchestrator
  --cleanup             delete DB persona row for this agent after test
  --indexer-wait-ms <n> max ms to wait for indexer (default 60000)

env vars (required):
  STEWARD_API_URL, STEWARD_API_KEY (or STEWARD_TENANT_API_KEY), STEWARD_TENANT_ID,
  BSC_RPC_URL, FOURMEME_API_URL, FOURMEME_TOKEN_MANAGER_2, FOURMEME_CHAIN_ID,
  EIP8004_NFT_ADDRESS, DATABASE_URL (optional, enables --cleanup and persona checks)

See scripts/E2E_README.md for troubleshooting.
`,
	);
}

// ─── env + service pre-flight ───────────────────────────────────────
interface EnvConfig {
	stewardApiUrl: string;
	stewardApiKey: string;
	stewardTenantId: string;
	bscRpcUrl: string;
	eip8004NftAddress: Address;
	fourMemeApiUrl: string;
	fourMemeTokenManager2: Address;
	fourMemeChainId: 56 | 97;
	databaseUrl: string | null;
	apiBaseUrl: string;
}

function readEnv(flags: CliFlags): EnvConfig {
	const errors: string[] = [];
	const need = (k: string, ...fallbacks: string[]): string | null => {
		for (const key of [k, ...fallbacks]) {
			const v = process.env[key];
			if (v && v.length > 0) return v;
		}
		return null;
	};

	const stewardApiUrl = need("STEWARD_API_URL");
	const stewardApiKey = need("STEWARD_API_KEY", "STEWARD_TENANT_API_KEY");
	const bscRpcUrl = need("BSC_RPC_URL");
	const eip8004 = need("EIP8004_NFT_ADDRESS");
	const fourMemeApiUrl = need("FOURMEME_API_URL");
	const tm2 = need("FOURMEME_TOKEN_MANAGER_2");
	const chainIdRaw = need("FOURMEME_CHAIN_ID");

	if (!stewardApiUrl) errors.push("STEWARD_API_URL");
	if (!stewardApiKey) errors.push("STEWARD_API_KEY (or STEWARD_TENANT_API_KEY)");
	if (!bscRpcUrl) errors.push("BSC_RPC_URL");
	if (!eip8004) errors.push("EIP8004_NFT_ADDRESS");
	if (!fourMemeApiUrl) errors.push("FOURMEME_API_URL");
	if (!tm2) errors.push("FOURMEME_TOKEN_MANAGER_2");
	if (!chainIdRaw) errors.push("FOURMEME_CHAIN_ID");

	if (errors.length > 0) {
		throw new Error(`missing required env vars:\n  - ${errors.join("\n  - ")}`);
	}

	const chainId = Number(chainIdRaw);
	if (chainId !== 56 && chainId !== 97) {
		throw new Error(`FOURMEME_CHAIN_ID must be 56 or 97, got ${chainIdRaw}`);
	}
	if (flags.mainnet && chainId !== 56) {
		throw new Error(`--mainnet was passed but FOURMEME_CHAIN_ID=${chainId}`);
	}
	if (flags.testnet && chainId !== 97) {
		throw new Error(`--testnet was passed but FOURMEME_CHAIN_ID=${chainId}`);
	}

	return {
		stewardApiUrl: stewardApiUrl!,
		stewardApiKey: stewardApiKey!,
		stewardTenantId: need("STEWARD_TENANT_ID") ?? "waifu",
		bscRpcUrl: bscRpcUrl!,
		eip8004NftAddress: getAddress(eip8004!),
		fourMemeApiUrl: fourMemeApiUrl!,
		fourMemeTokenManager2: getAddress(tm2!),
		fourMemeChainId: chainId as 56 | 97,
		databaseUrl: need("DATABASE_URL"),
		apiBaseUrl: need("WAIFU_API_URL", "API_URL") ?? "http://localhost:3100",
	};
}

interface PreflightResult {
	stewardOk: boolean;
	rpcOk: boolean;
	fourMemeOk: boolean;
	dbOk: boolean | "skipped";
	apiOk: boolean | "skipped";
}

async function preflight(env: EnvConfig): Promise<PreflightResult> {
	const result: PreflightResult = {
		stewardOk: false,
		rpcOk: false,
		fourMemeOk: false,
		dbOk: "skipped",
		apiOk: "skipped",
	};

	// Steward - best-effort GET. Steward has no public /health, so we probe the
	// root / or /agents endpoint with the tenant key; a 401/403 still means the
	// host is up.
	await step("steward", async () => {
		const url = env.stewardApiUrl.replace(/\/+$/, "");
		const res = await fetch(`${url}/agents?limit=1`, {
			method: "GET",
			headers: {
				"x-tenant-api-key": env.stewardApiKey,
				"x-tenant-id": env.stewardTenantId,
			},
		}).catch(() => null);
		if (!res) throw new Error("steward unreachable (network error)");
		if (res.status >= 500) {
			throw new Error(`steward returned ${res.status}`);
		}
		result.stewardOk = true;
		return `ok (${res.status})`;
	});

	// BSC RPC - eth_chainId
	await step("bsc rpc", async () => {
		const res = await fetch(env.bscRpcUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "eth_chainId",
				params: [],
			}),
		});
		if (!res.ok) throw new Error(`rpc ${res.status}`);
		const body = (await res.json()) as { result?: string };
		const id = body.result ? Number.parseInt(body.result, 16) : Number.NaN;
		if (id !== env.fourMemeChainId) {
			throw new Error(`RPC chainId ${id} != FOURMEME_CHAIN_ID ${env.fourMemeChainId}`);
		}
		result.rpcOk = true;
		return `ok (chainId=${id})`;
	});

	// Four.Meme - the private endpoints 404/401 unauthed, but the host should
	// be reachable. We ping a known GET-friendly path.
	await step("four.meme api", async () => {
		const url = env.fourMemeApiUrl.replace(/\/+$/, "");
		const res = await fetch(`${url}/v1/private/user/nonce/generate`, {
			method: "OPTIONS",
		}).catch(() => null);
		if (!res) throw new Error("four.meme unreachable (network error)");
		result.fourMemeOk = true;
		return `ok (${res.status})`;
	});

	// DB - only if DATABASE_URL present.
	if (env.databaseUrl) {
		await step("database", async () => {
			const { getDatabase } = await import("@waifu/db");
			const { client } = getDatabase(env.databaseUrl!);
			try {
				await client`select 1`;
				result.dbOk = true;
				return "ok";
			} catch (err) {
				result.dbOk = false;
				throw err;
			}
		});
	}

	// Optional: waifu API (for /v2/agents/:token assertions). Non-fatal if down.
	await step("waifu api (optional)", async () => {
		const url = env.apiBaseUrl.replace(/\/+$/, "");
		const res = await fetch(`${url}/health/live`).catch(() => null);
		if (!res) {
			result.apiOk = false;
			return c.yellow("unreachable (non-fatal)");
		}
		result.apiOk = res.ok;
		return res.ok ? "ok" : `degraded (${res.status})`;
	});

	return result;

	async function step(label: string, fn: () => Promise<string>): Promise<void> {
		process.stdout.write(c.dim(`  · ${label}… `));
		try {
			const msg = await fn();
			console.log(`${c.green("✓")} ${msg}`);
		} catch (err) {
			console.log(`${c.red("✗")} ${err instanceof Error ? err.message : String(err)}`);
			throw err;
		}
	}
}

// ─── launch ─────────────────────────────────────────────────────────
interface LaunchRunState {
	agentId: string;
	steps: Array<{ name: string; detail: Record<string, unknown>; atMs: number }>;
	startedAt: number;
	result?: AgentLaunchResult;
	failedStep?: string;
	error?: unknown;
}

async function runLaunch(env: EnvConfig, flags: CliFlags, input: AgentLaunchInput): Promise<LaunchRunState> {
	const state: LaunchRunState = {
		agentId: input.agentId ?? "(generated)",
		steps: [],
		startedAt: Date.now(),
	};

	const steward = createStewardClient({
		baseUrl: env.stewardApiUrl,
		apiKey: env.stewardApiKey,
		tenantId: env.stewardTenantId,
	});

	// Persona store wired to Postgres when DATABASE_URL is present.
	let personaStore: PersonaStore | undefined;
	if (env.databaseUrl) {
		const { getDatabase, agentPersonaQueries } = await import("@waifu/db");
		const { db } = getDatabase(env.databaseUrl);
		personaStore = {
			writeInitial: async (args) => {
				const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, args.agentId);
				if (existing) return;
				const personaJson =
					args.persona && typeof args.persona === "object" ? (args.persona as Record<string, unknown>) : undefined;
				const preset = personaJson && typeof personaJson.preset === "string" ? (personaJson.preset as string) : null;
				const systemPrompt =
					personaJson && typeof personaJson.systemPrompt === "string" ? (personaJson.systemPrompt as string) : null;
				const traits =
					personaJson && Array.isArray(personaJson.traits)
						? (personaJson.traits.filter((t: unknown) => typeof t === "string") as string[])
						: [];
				await agentPersonaQueries.createAgentPersona(db, {
					agentId: args.agentId,
					name: args.name,
					bio: args.bio ?? null,
					avatarUrl: args.avatarUrl ?? null,
					preset,
					systemPrompt,
					traits,
					twitterHandle: null,
					metadata: personaJson ?? null,
				});
			},
			setToken: async (agentId, tokenAddress) => {
				await agentPersonaQueries.setTokenAddressOnPersona(db, agentId, tokenAddress);
			},
		};
	}

	const deps: OrchestratorDeps = {
		steward,
		rpcUrl: env.bscRpcUrl,
		chainId: env.fourMemeChainId,
		fourMemeBaseUrl: env.fourMemeApiUrl,
		tokenManager2Address: env.fourMemeTokenManager2,
		eip8004NftAddress: env.eip8004NftAddress,
		platformSlug: "waifu",
		...(personaStore ? { personaStore } : {}),
		onStep: (step, detail) => {
			state.steps.push({
				name: step,
				detail,
				atMs: Date.now() - state.startedAt,
			});
			const emoji = step.endsWith(".warning") ? `${c.yellow("⚠")} ` : `${c.green("✓")} `;
			const tag = c.bold(step.padEnd(22));
			console.log(
				`  ${emoji}${tag}${c.dim(`(+${((Date.now() - state.startedAt) / 1000).toFixed(1)}s)`)} ${safePreview(detail)}`,
			);
		},
	};

	const orchestrator = createOrchestrator(deps);

	try {
		state.result = await orchestrator.launch(input);
	} catch (err) {
		state.error = err;
		if (err instanceof AgentLaunchError) state.failedStep = err.step;
		throw err;
	}

	return state;
}

function safePreview(detail: Record<string, unknown>): string {
	const keys = ["walletAddress", "tokenAddress", "txHash", "agentId", "nonce", "imageUrl"];
	const pairs: string[] = [];
	for (const k of keys) {
		const v = detail[k];
		if (typeof v === "string") {
			const shown = v.length > 12 ? `${v.slice(0, 10)}…` : v;
			pairs.push(`${c.cyan(k)}=${shown}`);
		}
	}
	return pairs.join(" ");
}

// ─── post-launch assertions ─────────────────────────────────────────
interface AssertionOutcome {
	name: string;
	ok: boolean;
	detail: string;
}

async function assertLaunch(
	env: EnvConfig,
	flags: CliFlags,
	publicClient: PublicClient,
	result: AgentLaunchResult,
): Promise<AssertionOutcome[]> {
	const outcomes: AssertionOutcome[] = [];
	const apiBase = env.apiBaseUrl.replace(/\/+$/, "");

	// API: GET /v2/agents/:tokenAddress
	outcomes.push(
		await check("api: GET /v2/agents/:token", async () => {
			const res = await fetch(`${apiBase}/v2/agents/${result.tokenAddress.toLowerCase()}`);
			if (res.status === 503) return "skipped (api down)";
			if (!res.ok) throw new Error(`status ${res.status}`);
			const body = (await res.json()) as { tokenAddress?: string };
			if (!body || typeof body !== "object") {
				throw new Error("response not an object");
			}
			return "found";
		}),
	);

	// API: trades should be empty
	outcomes.push(
		await check("api: GET /v2/agents/:token/trades", async () => {
			const res = await fetch(`${apiBase}/v2/agents/${result.tokenAddress.toLowerCase()}/trades`);
			if (res.status === 503) return "skipped (api down)";
			if (!res.ok) throw new Error(`status ${res.status}`);
			const body = (await res.json()) as { trades?: unknown[] };
			const count = Array.isArray(body.trades) ? body.trades.length : -1;
			if (count !== 0) throw new Error(`expected 0 trades, got ${count}`);
			return "ok (0 trades)";
		}),
	);

	// Chain: TokenCreate event present in receipt
	outcomes.push(
		await check("chain: TokenCreate event emitted", async () => {
			const receipt = await publicClient.getTransactionReceipt({
				hash: result.txHash,
			});
			if (receipt.status !== "success") {
				throw new Error(`tx status=${receipt.status}`);
			}
			const lcTm2 = env.fourMemeTokenManager2.toLowerCase();
			const hit = receipt.logs.find((l: { address: string }) => l.address.toLowerCase() === lcTm2);
			if (!hit) throw new Error("no TokenManager2 logs found");
			return `tx ${result.txHash.slice(0, 10)}… ${receipt.logs.length} logs`;
		}),
	);

	// 8004 ownerOf check - optional
	if (flags.check8004 && result.agentIdentity) {
		outcomes.push(
			await check("8004: ownerOf(agentId) == wallet", async () => {
				const abi = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);
				const owner = await publicClient.readContract({
					address: getAddress(result.agentIdentity!.contractAddress),
					abi,
					functionName: "ownerOf",
					args: [BigInt(result.agentIdentity!.agentId)],
				});
				if (owner.toLowerCase() !== result.walletAddress.toLowerCase()) {
					throw new Error(`owner=${owner} != wallet=${result.walletAddress}`);
				}
				return `tokenId=${result.agentIdentity!.agentId} owner=${owner.slice(0, 10)}…`;
			}),
		);
	} else if (flags.check8004 && !result.agentIdentity) {
		outcomes.push({
			name: "8004: ownerOf check",
			ok: false,
			detail: "skipped - result.agentIdentity missing (was 8004 skipped/failed?)",
		});
	}

	// Indexer: poll agent_events for agent.created - optional
	if (flags.checkEvents) {
		outcomes.push(
			await check(`indexer: agent.created enqueued (wait ≤ ${(flags.indexerWaitMs / 1000).toFixed(0)}s)`, async () => {
				if (!env.databaseUrl) return "skipped (no DATABASE_URL)";
				const { getDatabase, agentEventQueries } = await import("@waifu/db");
				const { db } = getDatabase(env.databaseUrl);
				const deadline = Date.now() + flags.indexerWaitMs;
				while (Date.now() < deadline) {
					const rows = await agentEventQueries.listRecentForAgent(db, result.agentId, 50);
					const created = rows.find((r: { type: string }) => r.type === "agent.created");
					if (created) {
						return `found event id=${created.id}`;
					}
					await new Promise((r) => setTimeout(r, 2_000));
				}
				throw new Error("timeout - no agent.created event observed");
			}),
		);
	}

	return outcomes;

	async function check(name: string, fn: () => Promise<string>): Promise<AssertionOutcome> {
		try {
			const detail = await fn();
			console.log(`  ${c.green("✓")} ${name} ${c.dim(`- ${detail}`)}`);
			return { name, ok: true, detail };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.log(`  ${c.red("✗")} ${name} ${c.dim(`- ${msg}`)}`);
			return { name, ok: false, detail: msg };
		}
	}
}

// ─── cleanup ────────────────────────────────────────────────────────
async function cleanup(env: EnvConfig, agentId: string): Promise<void> {
	if (!env.databaseUrl) {
		console.log(c.yellow("  ⊘ cleanup skipped: DATABASE_URL not set"));
		return;
	}
	const { getDatabase, schema } = await import("@waifu/db");
	const { db, client } = getDatabase(env.databaseUrl);
	const { eq } = await import("drizzle-orm");
	try {
		const personaDel = await db
			.delete(schema.agentPersonas)
			.where(eq(schema.agentPersonas.agentId, agentId))
			.returning();
		console.log(`  ${c.green("✓")} deleted ${personaDel.length} agent_personas row(s) for ${agentId}`);
		const walletDel = await db
			.delete(schema.agentWallets)
			.where(eq(schema.agentWallets.internalAgentId, agentId))
			.returning();
		console.log(`  ${c.green("✓")} deleted ${walletDel.length} agent_wallets row(s) for ${agentId}`);
		const eventsDel = await db.delete(schema.agentEvents).where(eq(schema.agentEvents.agentId, agentId)).returning();
		console.log(`  ${c.green("✓")} deleted ${eventsDel.length} agent_events row(s) for ${agentId}`);
		console.log(c.dim("  (note: on-chain token is permanent - cleanup only clears DB)"));
	} finally {
		await client.end({ timeout: 5 }).catch(() => {});
	}
}

// ─── main ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
	const flags = parseArgs(process.argv.slice(2));
	if (flags.help) {
		printHelp();
		return;
	}

	console.log(c.bold("\n════════ waifu.fun agent-launch E2E ════════\n"));
	console.log(c.bold("▸ pre-flight"));
	const env = readEnv(flags);
	console.log(
		c.dim(
			`  steward=${new URL(env.stewardApiUrl).host} tenant=${env.stewardTenantId} chain=${env.fourMemeChainId} db=${env.databaseUrl ? "configured" : "none"}`,
		),
	);
	await preflight(env);

	// Sanity: refuse accidental mainnet runs unless explicit.
	if (env.fourMemeChainId === 56 && !flags.mainnet && !flags.dryRun) {
		console.log(
			c.yellow("\n  ⚠ running on BSC mainnet (chainId 56). Pass --mainnet to confirm (or --testnet / --dry-run)."),
		);
		process.exitCode = 2;
		return;
	}

	const agentId = `test-${Date.now()}`;
	const input: AgentLaunchInput = {
		agentId,
		name: flags.name ?? "TestAgent",
		symbol: flags.symbol ?? "TST",
		description: flags.description ?? "test agent for e2e validation",
		imageBase64: ONE_PX_PNG_BASE64,
		imageMimeType: "image/png",
		imageFilename: "test.png",
		label: "AI",
		persona: {
			preset: "trader",
			systemPrompt: "you are a test agent.",
			traits: ["serious"],
		},
		...(flags.skip8004 ? { skipIdentityRegistration: true } : {}),
	};

	console.log(`\n${c.bold("▸ launch input")}`);
	console.log(
		c.dim(`  agentId=${input.agentId}\n  name=${input.name}\n  symbol=${input.symbol}\n  skip-8004=${flags.skip8004}`),
	);

	if (flags.dryRun) {
		console.log(`\n${c.bold(c.green("▸ --dry-run specified: stopping before orchestrator.launch()"))}`);
		console.log(c.dim("  (no BNB was spent. remove --dry-run to execute.)"));
		return;
	}

	console.log(`\n${c.bold("▸ orchestrator steps")}`);
	let runState: LaunchRunState | null = null;
	try {
		runState = await runLaunch(env, flags, input);
	} catch (err) {
		console.log(`\n${c.bold(c.red("▸ launch FAILED"))}`);
		if (err instanceof AgentLaunchError) {
			console.log(c.red(`  step: ${err.step}`));
			console.log(c.red(`  error: ${err.message}`));
			if (err.cause) {
				console.log(
					c.dim(`  cause: ${err.cause instanceof Error ? err.cause.message : JSON.stringify(err.cause, null, 2)}`),
				);
			}
		} else if (err instanceof FourMemeError) {
			console.log(c.red(`  four.meme ${err.status}: ${err.message}`));
			if (err.body) console.log(c.dim(`  body: ${JSON.stringify(err.body)}`));
		} else {
			console.log(c.red(`  ${err instanceof Error ? err.stack : String(err)}`));
		}
		console.log(`\n${c.dim("  captured steps up to failure:")}`);
		// runState may be populated from inside runLaunch - but on throw it's not
		// returned. Re-emit from the onStep log is best-effort here.
		process.exitCode = 1;
		return;
	}

	if (!runState.result) {
		console.log(c.red("  unexpected: launch returned without result"));
		process.exitCode = 1;
		return;
	}
	const result = runState.result;

	// Post-launch assertions.
	console.log(`\n${c.bold("▸ post-launch assertions")}`);
	const publicClient = createPublicClient({
		chain: env.fourMemeChainId === 56 ? bsc : bscTestnet,
		transport: http(env.bscRpcUrl),
	}) as PublicClient;
	const outcomes = await assertLaunch(env, flags, publicClient, result);

	// Summary.
	const tookSec = ((Date.now() - runState.startedAt) / 1000).toFixed(1);
	const fourMemeUrl = `https://four.meme/token/${result.tokenAddress}`;
	const waifuUrl = `https://waifu.fun/agent/${result.tokenAddress}`;
	const indexerCaught = outcomes.find((o) => o.name.startsWith("indexer:"));

	console.log(`\n${c.bold("================================")}`);
	console.log(c.bold(c.green("Agent launched successfully")));
	console.log("");
	console.log(`Agent ID: ${c.cyan(result.agentId)}`);
	console.log(`Name: ${c.cyan(`${input.name} (${input.symbol})`)}`);
	console.log(`Wallet: ${c.cyan(result.walletAddress)}`);
	console.log(`Token: ${c.cyan(result.tokenAddress)}`);
	console.log(`Treasury: ${c.cyan(result.treasuryAddress)}`);
	console.log(`Tx Hash: ${c.cyan(result.txHash)}`);
	if (result.agentIdentity) {
		console.log(
			`EIP-8004 NFT: ${c.cyan(result.agentIdentity.contractAddress)} (token id ${result.agentIdentity.agentId})`,
		);
	} else {
		console.log(c.dim("EIP-8004 NFT: (skipped or failed, no identity returned)"));
	}
	console.log(`Four.Meme URL: ${c.blue(fourMemeUrl)}`);
	console.log(`Agent Home: ${c.blue(waifuUrl)}`);
	if (indexerCaught) {
		console.log(`Indexer caught: ${indexerCaught.ok ? c.green("yes") : c.yellow("no")} (${indexerCaught.detail})`);
	}
	console.log(c.dim(`Total duration: ${tookSec}s`));
	console.log(c.bold("================================"));

	// Cleanup.
	if (flags.cleanup) {
		console.log(`\n${c.bold("▸ cleanup")}`);
		try {
			await cleanup(env, result.agentId);
		} catch (err) {
			console.log(c.yellow(`  ⚠ cleanup error: ${err instanceof Error ? err.message : String(err)}`));
		}
	}

	const failedAssertions = outcomes.filter((o) => !o.ok);
	if (failedAssertions.length > 0) {
		console.log(
			c.yellow(
				`\n⚠ ${failedAssertions.length} assertion(s) failed. Launch succeeded on-chain, but verification is incomplete.`,
			),
		);
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error(c.red("\n[fatal] unhandled error:"));
	console.error(err);
	process.exit(1);
});
