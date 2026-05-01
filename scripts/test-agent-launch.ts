/**
 * End-to-end test for the agent-launch orchestrator.
 *
 * Usage (mock mode — no third-party calls):
 *   bun scripts/test-agent-launch.ts
 *
 * Usage (real Four.Meme, but read-only simulation of the on-chain step):
 *   STEWARD_API_URL=https://eliza.steward.fi \
 *   STEWARD_TENANT_API_KEY=stw_... \
 *   STEWARD_TENANT_ID=waifu \
 *   BSC_RPC_URL=https://bsc-dataseed.binance.org \
 *   REAL=1 \
 *   bun scripts/test-agent-launch.ts
 *
 * The mock mode wires fake Steward + Four.Meme + BSC responses so the full
 * control flow is exercised without spending any BNB or hitting third-party
 * APIs. REAL=1 only runs the Four.Meme-side flow against mainnet (nonce +
 * login + upload + create) and stops before broadcasting the tx — it prints
 * the `(createArg, signature)` tuple and the encoded calldata so you can
 * inspect before paying 0.01 BNB.
 */

import {
	http,
	type Address,
	type Hex,
	createPublicClient,
	encodeAbiParameters,
	encodeEventTopics,
	encodeFunctionData,
	keccak256,
	parseEther,
	toBytes,
	toHex,
	zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

import { TokenManager2Abi } from "@waifu/fourmeme";

import {
	AgentLaunchError,
	type AgentLaunchInput,
	FourMemeError,
	createOrchestrator,
	createStewardClient,
} from "../apps/api/src/services/agent-launch/index.js";
import type {
	StewardAgentIdentity,
	StewardClient,
	StewardSignMessageResult,
	StewardSignTxResult,
} from "../apps/api/src/services/agent-launch/steward.js";

const MOCK_AGENT_ADDRESS = "0x000000000000000000000000000000000000A1E5" as Address;
const MOCK_TOKEN_ADDRESS = "0xdead000000000000000000000000000000000B0B" as Address;
const MOCK_TX_HASH = "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff" as Hex;
const MOCK_FOURMEME_BASE = "https://mock.four.meme/meme-api";

async function runMock(): Promise<void> {
	console.log("[test] running mock end-to-end flow");

	const fetchImpl = buildMockFetch();
	const steward = buildMockStewardClient();

	const orchestrator = createOrchestrator({
		steward,
		rpcUrl: "https://mock.bsc.invalid",
		chainId: 56,
		fourMemeBaseUrl: MOCK_FOURMEME_BASE,
		fetchImpl,
		onStep: (step, detail) => console.log(`[step] ${step}`, detail),
	});

	// Replace the chain clients with our mocked one by monkey-patching at
	// orchestrator level via prototype — we inject a readContract/public client
	// that returns a fake receipt with a TokenCreate event.
	patchPublicClientForMock(orchestrator);

	const input: AgentLaunchInput = {
		name: "TestAgent",
		symbol: "TA",
		description: "unit test agent",
		imageBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
		imageMimeType: "image/png",
		imageFilename: "test.png",
		label: "AI",
		preSale: "0",
		feePlan: false,
		tax: {
			feeRate: 3,
			burnRate: 10,
			divideRate: 40,
			liquidityRate: 30,
			recipientRate: 20,
			minSharing: 1_000_000,
		},
		persona: { system: "be cute, be useful" },
		existingAgent: {
			agentId: "waifu-test-1",
			walletAddress: MOCK_AGENT_ADDRESS,
		},
	};

	try {
		const result = await orchestrator.launch(input);
		console.log("\n[test] ✓ launched (mock)", result);
	} catch (err) {
		if (err instanceof AgentLaunchError) {
			console.error(`\n[test] ✗ failed at step ${err.step}:`, err.message, err.cause);
		} else if (err instanceof FourMemeError) {
			console.error("\n[test] ✗ Four.Meme error:", err.status, err.message, err.body);
		} else {
			console.error("\n[test] ✗ unexpected error:", err);
		}
		process.exitCode = 1;
	}
}

async function runReal(): Promise<void> {
	const stewardApiUrl = process.env.STEWARD_API_URL;
	const stewardApiKey = process.env.STEWARD_TENANT_API_KEY;
	const stewardTenantId = process.env.STEWARD_TENANT_ID ?? "waifu";
	const rpcUrl = process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org";

	if (!stewardApiUrl || !stewardApiKey) {
		console.error("[test] REAL=1 requires STEWARD_API_URL + STEWARD_TENANT_API_KEY env vars");
		process.exit(2);
	}

	console.log("[test] running live Four.Meme flow (dry-run — NO on-chain tx)");
	const steward = createStewardClient({
		baseUrl: stewardApiUrl,
		apiKey: stewardApiKey,
		tenantId: stewardTenantId,
	});

	const orchestrator = createOrchestrator({
		steward,
		rpcUrl,
		chainId: 56,
		platformSlug: "waifu-test",
		onStep: (step, detail) => console.log(`[step] ${step}`, detail),
	});

	// Short-circuit the on-chain step: we build the payload manually by calling
	// the orchestrator's private stages through the same module exports, but
	// that's more code than this smoke test needs. Instead: run the full flow
	// with `broadcast: false` by patching signTransaction to intercept.
	const originalSign = steward.signTransaction.bind(steward);
	steward.signTransaction = async (agentId, tx): Promise<StewardSignTxResult> => {
		console.log("\n[test] would broadcast tx:", {
			to: tx.to,
			value: tx.value,
			dataPrefix: tx.data?.slice(0, 20),
			chainId: tx.chainId,
		});
		console.log("[test] skipping real broadcast — set LIVE_BROADCAST=1 to actually send");
		if (process.env.LIVE_BROADCAST === "1") {
			return originalSign(agentId, tx);
		}
		// Return a fake broadcast result so the orchestrator moves to the
		// receipt step and then fails there (which is fine — we just wanted to
		// see the calldata).
		return { txHash: MOCK_TX_HASH } as StewardSignTxResult;
	};

	const input: AgentLaunchInput = {
		name: process.env.TEST_NAME ?? "WaifuTest",
		symbol: process.env.TEST_SYMBOL ?? "WFUT",
		description: process.env.TEST_DESC ?? "waifu.fun agent-launch smoke test (safe to ignore)",
		imageUrl: process.env.TEST_IMAGE_URL ?? "https://placehold.co/512x512/png?text=waifu",
		label: "AI",
		preSale: "0",
		feePlan: false,
	};

	try {
		const result = await orchestrator.launch(input);
		console.log("\n[test] ✓ launched (live)", result);
	} catch (err) {
		if (err instanceof AgentLaunchError && err.step === "chain.receipt") {
			console.log("\n[test] ✓ Four.Meme flow succeeded — receipt step failed as expected (dry-run)");
		} else if (err instanceof AgentLaunchError) {
			console.error(`\n[test] ✗ live run failed at step ${err.step}:`, err.message, err.cause);
			process.exitCode = 1;
		} else {
			console.error("\n[test] ✗ live run unexpected error:", err);
			process.exitCode = 1;
		}
	}
}

// ─── Mocks ────────────────────────────────────────────────────────

function buildMockStewardClient(): StewardClient {
	const client = {
		createWallet: async (agentId: string, name: string): Promise<StewardAgentIdentity> => ({
			id: agentId,
			tenantId: "waifu",
			name,
			walletAddress: MOCK_AGENT_ADDRESS,
			createdAt: new Date().toISOString(),
		}),
		getAgent: async (agentId: string): Promise<StewardAgentIdentity> => ({
			id: agentId,
			tenantId: "waifu",
			name: agentId,
			walletAddress: MOCK_AGENT_ADDRESS,
			createdAt: new Date().toISOString(),
		}),
		ensureAgent: async (agentId: string, name: string): Promise<StewardAgentIdentity> => ({
			id: agentId,
			tenantId: "waifu",
			name,
			walletAddress: MOCK_AGENT_ADDRESS,
			createdAt: new Date().toISOString(),
		}),
		signMessage: async (_agentId: string, message: string): Promise<StewardSignMessageResult> => {
			const pk = keccak256(toBytes(`mock-signer-${message}`));
			const account = privateKeyToAccount(pk);
			const sig = await account.signMessage({ message });
			return { signature: sig };
		},
		signTransaction: async (_agentId: string, _tx): Promise<StewardSignTxResult> => ({ txHash: MOCK_TX_HASH }),
	} as unknown as StewardClient;
	return client;
}

function buildMockFetch(): typeof fetch {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === "string" ? input : input.toString();

		if (url.endsWith("/v1/private/user/nonce/generate")) {
			return json({ code: "0", data: "mocknonce-abcdef" });
		}
		if (url.endsWith("/v1/private/user/login/dex")) {
			return json({ code: "0", data: "mocktoken.jwt.xxxxx" });
		}
		if (url.endsWith("/v1/private/token/upload")) {
			return json({
				code: "0",
				data: "https://static.four.meme/market/mock-image.png",
			});
		}
		if (url.endsWith("/v1/private/token/create")) {
			// Build a deterministic fake createArg + signature.
			const createArg = toHex(new Uint8Array(32).fill(0xaa));
			const signature = toHex(new Uint8Array(65).fill(0xbb));
			return json({
				code: "0",
				data: {
					createArg,
					signature,
					requestId: "4242",
				},
			});
		}
		// Base64 image fetch from resolveBlob when imageUrl is used.
		if (url.startsWith("https://placehold.co") || url.startsWith("https://static")) {
			return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
				status: 200,
				headers: { "content-type": "image/png" },
			});
		}
		throw new Error(`[mock fetch] unexpected URL: ${url} ${init?.method ?? "GET"}`);
	};
}

function json(data: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), {
		status: 200,
		...init,
		headers: {
			"content-type": "application/json",
			...(init?.headers ?? {}),
		},
	});
}

function patchPublicClientForMock(orchestrator: object): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyO = orchestrator as any;
	const original = anyO.buildChainClients?.bind(orchestrator);
	if (typeof original !== "function") return;

	anyO.buildChainClients = () => {
		const tokenManager2Address = "0x5c952063c7fc8610FFDB798152D69F0B9550762b" as Address;
		const topics = encodeEventTopics({
			abi: TokenManager2Abi,
			eventName: "TokenCreate",
		});
		const data = encodeMockTokenCreate(MOCK_TOKEN_ADDRESS);
		const fakePublicClient = {
			waitForTransactionReceipt: async () => ({
				status: "success",
				logs: [
					{
						address: tokenManager2Address,
						topics,
						data,
					},
				],
			}),
		};
		return { tokenManager2Address, publicClient: fakePublicClient };
	};
}

function encodeMockTokenCreate(token: Address): Hex {
	// Only `token` must match; all other fields are placeholders. V2 TokenCreate
	// is non-indexed for all 8 args, so they all go in `data` in ABI order.
	return encodeAbiParameters(
		[
			{ name: "creator", type: "address" },
			{ name: "token", type: "address" },
			{ name: "requestId", type: "uint256" },
			{ name: "name", type: "string" },
			{ name: "symbol", type: "string" },
			{ name: "totalSupply", type: "uint256" },
			{ name: "launchTime", type: "uint256" },
			{ name: "launchFee", type: "uint256" },
		],
		[zeroAddress, token, 0n, "Mock", "MCK", 1_000_000_000n * 10n ** 18n, 0n, parseEther("0.01")],
	);
}

// ─── entry ─────────────────────────────────────────────────────────

if (process.env.REAL === "1") {
	runReal().catch((err) => {
		console.error("[test] fatal", err);
		process.exit(1);
	});
} else {
	runMock().catch((err) => {
		console.error("[test] fatal", err);
		process.exit(1);
	});
}

// Ensure the imports above aren't tree-shaken in downstream builds.
void TokenManager2Abi;
void createPublicClient;
void http;
void bsc;
void encodeFunctionData;
