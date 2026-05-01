/**
 * demo/agent-brain.ts
 *
 * Minimal "agent brain" demo for the four.meme hackathon. Pretends to be
 * any agent runtime (ElizaOS, OCPlatform, Hermes). It reads a character
 * file, generates token params, calls the waifu.fun launch API with its
 * own API key, and announces the result.
 *
 * Run:
 *   WAIFU_API_URL=https://api.waifu.fun \
 *   WAIFU_AGENT_KEY=agk_... \
 *   tsx demo/agent-brain.ts
 *
 * Or with a local API:
 *   WAIFU_API_URL=http://localhost:3100 \
 *   WAIFU_AGENT_KEY=agk_... \
 *   tsx demo/agent-brain.ts
 *
 * The "decision to launch" is rule-based for the demo (always yes). In a
 * real runtime this would be a model call. The rest of the flow is the
 * genuine article: character → params → http → announce.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CharacterFile {
	id: string;
	name: string;
	bio: string[];
	persona?: Record<string, unknown>;
	launch?: {
		capable: boolean;
		preferences?: {
			tickerRoot?: string;
			chain?: string;
			pair?: string;
			imageUrl?: string;
			label?: string;
		};
	};
	settings?: Record<string, unknown>;
}

interface PrepareResult {
	agentId: string;
	walletAddress: string;
	treasuryAddress: string;
	claimUrl: string;
	claimToken: string;
	claimExpiresAt: string;
	fourMeme: {
		nonce: string;
		imageUrl: string;
		createArgHash: string;
	};
	agentIdentity?: {
		agentId: string;
		txHash: string;
		contractAddress: string;
	};
}

interface PrepareError {
	error?: string | { code?: string; message?: string };
	message?: string;
	step?: string;
	detail?: string;
}

function log(stage: string, msg: string, extra?: Record<string, unknown>) {
	const line = `[${new Date().toISOString()}] ${stage.padEnd(12)} ${msg}`;
	if (extra) {
		console.log(line, JSON.stringify(extra, null, 2));
	} else {
		console.log(line);
	}
}

async function loadCharacter(path: string): Promise<CharacterFile> {
	const raw = await readFile(path, "utf8");
	const parsed = JSON.parse(raw) as CharacterFile;
	if (!parsed.id || !parsed.name) throw new Error("character: missing id or name");
	if (!parsed.launch?.capable) {
		throw new Error("character: launch.capable must be true for launch flow");
	}
	return parsed;
}

function decideLaunch(char: CharacterFile): boolean {
	// Rule-based for the demo. A real runtime would query a model here with
	// prompt like: "given your character, current context, and holders, do
	// you want to launch? output yes/no and reasoning."
	log("DECIDE", "launching: yes (demo, always-yes policy)");
	log("DECIDE", `character: ${char.name} (${char.id})`);
	return true;
}

function deriveTokenParams(char: CharacterFile) {
	const tickerRoot = char.launch?.preferences?.tickerRoot ?? char.name.toUpperCase().slice(0, 4);
	const ticker = tickerRoot.replace(/[^A-Z0-9]/g, "").slice(0, 10);
	const description = char.bio.join(" ").slice(0, 500);
	const imageUrl = char.launch?.preferences?.imageUrl ?? "https://waifu.fun/brand/previews/site-og.png";

	return {
		agentId: char.id,
		name: char.name,
		symbol: ticker,
		description,
		imageUrl,
		label: (char.launch?.preferences?.label ?? "AI") as "AI",
		twitterUrl: undefined,
		webUrl: "https://waifu.fun",
	};
}

async function callPrepareApi(
	apiUrl: string,
	apiKey: string,
	params: ReturnType<typeof deriveTokenParams>,
): Promise<PrepareResult> {
	log("REQUEST", `POST ${apiUrl}/v2/agents/prepare`);
	log("REQUEST", "body=", params);

	const res = await fetch(`${apiUrl}/v2/agents/prepare`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"User-Agent": "waifu-demo-agent-brain/1.0",
		},
		body: JSON.stringify(params),
	});

	const rawText = await res.text();
	let json: PrepareResult | PrepareError | null = null;
	try {
		json = JSON.parse(rawText);
	} catch {
		/* non-json body */
	}

	if (!res.ok) {
		const err = json as PrepareError | null;
		const code = typeof err?.error === "string" ? err.error : (err?.error?.code ?? `HTTP_${res.status}`);
		const msg =
			err?.message ??
			err?.detail ??
			(typeof err?.error === "object" ? err?.error?.message : undefined) ??
			rawText.slice(0, 200);
		throw new Error(`prepare failed (${code}): ${msg}`);
	}

	return json as PrepareResult;
}

function announce(char: CharacterFile, data: PrepareResult) {
	// v3 announce: agents DON'T self-launch. They prepare, then wait for a
	// human patron to claim + fund + trigger launch. The announce line is
	// a message the agent posts to its channel (X, discord, etc.) with the
	// one-time claim URL. Only the agent's chosen human sees this.
	console.log(`\n${"=".repeat(60)}`);
	console.log(`  ${char.name.toUpperCase()} // ready to launch, awaiting patron`);
	console.log("=".repeat(60));
	console.log(`  agent id:       ${data.agentId}`);
	console.log(`  wallet:         ${data.walletAddress}`);
	console.log(`  treasury:       ${data.treasuryAddress}`);
	if (data.agentIdentity) {
		console.log(`  EIP-8004 id:    ${data.agentIdentity.agentId}`);
	}
	console.log(`  claim URL:      ${data.claimUrl}`);
	console.log(`  expires:        ${data.claimExpiresAt}`);
	console.log("=".repeat(60));
	console.log(`  "${char.bio[0] ?? ""}"`);
	console.log("  get rich or die trying.");
	console.log(`${"=".repeat(60)}\n`);
	console.log(`  send this link to the human you've chosen as patron.`);
	console.log("  they sign in with x, fund the launch, trigger the tx.");
	console.log("  the claim token is single-use and the URL is unguessable.");
	console.log("");
}

async function main() {
	const apiUrl = process.env.WAIFU_API_URL ?? "https://api.waifu.fun";
	const apiKey = process.env.WAIFU_AGENT_KEY;

	if (!apiKey) {
		console.error("ERROR: set WAIFU_AGENT_KEY (agk_...)");
		process.exit(1);
	}

	const characterPath = process.argv[2] ?? join(__dirname, "character.json");

	log("BOOT", `reading character from ${characterPath}`);
	const character = await loadCharacter(characterPath);

	log("BOOT", `identity: ${character.name} (${character.id})`);
	log("BOOT", `bio: ${character.bio[0]}`);

	const shouldLaunch = decideLaunch(character);
	if (!shouldLaunch) {
		log("DECIDE", "not launching. exiting.");
		return;
	}

	const params = deriveTokenParams(character);
	log("PARAMS", "derived token params from character:", {
		name: params.name,
		symbol: params.symbol,
		description: `${params.description.slice(0, 60)}...`,
	});

	const result = await callPrepareApi(apiUrl, apiKey, params);
	log("SUCCESS", "prepare completed — claim URL minted");

	announce(character, result);
}

main().catch((err) => {
	console.error("\n[ERROR]", err instanceof Error ? err.message : String(err));
	process.exit(1);
});
