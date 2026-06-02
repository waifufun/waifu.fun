#!/usr/bin/env bun
/**
 * launch-smoke.mjs
 *
 * End-to-end SMOKE TEST for the waifu.fun Wave H / Wave J agent launch flow.
 *
 * It walks the WHOLE agent launch path documented in
 * apps/frontend/public/skill.md and reports PASS / FAIL at each step:
 *
 *   1. gate check        GET  /v2/launches/gate?inviteCode=...
 *   2. auth probe        confirm the agk_ key resolves (authed nonce call)
 *   3. upload-metadata   POST /v2/launches/upload-metadata (multipart)
 *   4. nonce             POST /v2/launches/nonce
 *   5. SIWE sign         build the canonical launch SIWE message + sign it
 *   6. create            POST /v2/launches  (GUARDED: dry-run by default)
 *   7. poll              GET  /v2/launches/:id  +  /:id/bundle-status
 *
 * This is what an operator runs AFTER arming the bundle bot to prove the
 * launch flow is end-to-end ready.
 *
 * SAFETY
 * ------
 * The create step (6) submits a real on-chain LaunchFactory transaction and
 * cannot be undone. The script therefore defaults to --dry-run: it validates
 * and signs everything up to (but NOT including) the create POST, then prints
 * the exact payload it WOULD send. To actually create a launch you must pass
 * BOTH --live AND --i-understand-this-spends-gas.
 *
 * It never prints the agent api key or the private key.
 *
 * USAGE
 * -----
 *   bun scripts/launch-smoke.mjs                # dry-run against prod
 *   bun scripts/launch-smoke.mjs --live --i-understand-this-spends-gas
 *
 * INPUTS (env or flags; flags win)
 * --------------------------------
 *   WAIFU_API_BASE     base url, default https://api.waifu.fun   (--api-base)
 *   AGENT_API_KEY      agk_... agent api key                     (--agent-key)
 *   INVITE_CODE        WF-XXXXX-XXXXX curated invite code         (--invite-code)
 *   TEST_PRIVATE_KEY   0x... private key for the creator wallet   (--private-key)
 *   TIER               80 | 90 | 95 | 98, default 80             (--tier)
 *   NAME               token name, default "SmokeTest"           (--name)
 *   SYMBOL             ticker, default "SMOKE"                    (--symbol)
 *   DESCRIPTION        one-liner                                 (--description)
 *
 * viem (for SIWE signing) is resolved from apps/api/node_modules so the script
 * runs from any cwd without a root-level install.
 */

import { createRequire } from "node:module";

// ─── resolve viem from apps/api (workspace dep, not hoisted to root) ──
const apiRequire = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { privateKeyToAccount } = await import(apiRequire.resolve("viem/accounts"));

// ─── tiny ANSI helpers (no chalk dep) ────────────────────────────────
const isTTY = process.stdout.isTTY === true;
const wrap = (open, close) => (s) => (isTTY ? `\x1b[${open}m${s}\x1b[${close}m` : s);
const col = {
	dim: wrap(2, 22),
	red: wrap(31, 39),
	green: wrap(32, 39),
	yellow: wrap(33, 39),
	blue: wrap(34, 39),
	cyan: wrap(36, 39),
	bold: wrap(1, 22),
};

// ─── CLI parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith("--")) {
			flags[key] = true;
		} else {
			flags[key] = next;
			i++;
		}
	}
	return flags;
}

const flags = parseArgs(process.argv.slice(2));

if (flags.help || flags.h) {
	console.log(`launch-smoke.mjs — waifu.fun agent launch end-to-end smoke test

Usage:
  bun scripts/launch-smoke.mjs [flags]

Modes:
  (default)                         dry-run: validate + sign everything up to
                                    the create POST, then print the payload.
  --live --i-understand-this-spends-gas
                                    actually submit POST /v2/launches (spends
                                    gas, creates a real on-chain launch).

Flags (override the matching env var):
  --api-base <url>        WAIFU_API_BASE   (default https://api.waifu.fun)
  --agent-key <agk_...>   AGENT_API_KEY
  --invite-code <code>    INVITE_CODE
  --private-key <0x...>   TEST_PRIVATE_KEY
  --tier <80|90|95|98>    TIER             (default 80 = SMOL)
  --name <name>           NAME             (default SmokeTest)
  --symbol <SYM>          SYMBOL           (default SMOKE)
  --description <text>    DESCRIPTION
  --close-seconds <n>     presale window length in seconds (default 7 days)
  --poll-attempts <n>     status poll attempts after a live create (default 3)
  --help                  this help

Safety: the agent key and private key are never printed.`);
	process.exit(0);
}

const cfg = {
	apiBase: (flags["api-base"] ?? process.env.WAIFU_API_BASE ?? "https://api.waifu.fun").replace(/\/+$/, ""),
	agentKey: flags["agent-key"] ?? process.env.AGENT_API_KEY ?? "",
	inviteCode: flags["invite-code"] ?? process.env.INVITE_CODE ?? "",
	privateKey: flags["private-key"] ?? process.env.TEST_PRIVATE_KEY ?? "",
	tier: String(flags.tier ?? process.env.TIER ?? "80"),
	name: flags.name ?? process.env.NAME ?? "SmokeTest",
	symbol: (flags.symbol ?? process.env.SYMBOL ?? "SMOKE").toUpperCase(),
	description: flags.description ?? process.env.DESCRIPTION ?? "waifu.fun launch smoke test, please ignore.",
	closeSeconds: Number(flags["close-seconds"] ?? 7 * 24 * 60 * 60),
	pollAttempts: Number(flags["poll-attempts"] ?? 3),
	live: flags.live === true || flags.live === "true",
	gasAck: flags["i-understand-this-spends-gas"] === true || flags["i-understand-this-spends-gas"] === "true",
};

const VALID_TIERS = new Set(["80", "90", "95", "98"]);
const TIER_LABEL = { 80: "SMOL", 90: "BASED", 95: "WAGMI", 98: "GIGACHAD" };

// ─── result tracking ─────────────────────────────────────────────────
const steps = [];
function record(name, status, detail) {
	steps.push({ name, status, detail });
	const tag =
		status === "PASS"
			? col.green("PASS")
			: status === "FAIL"
				? col.red("FAIL")
				: status === "SKIP"
					? col.yellow("SKIP")
					: col.dim(status);
	console.log(`  [${tag}] ${col.bold(name)}${detail ? ` ${col.dim(`- ${detail}`)}` : ""}`);
}

function fatal(name, detail) {
	record(name, "FAIL", detail);
	printSummary();
	process.exit(1);
}

// ─── minimal valid 1x1 PNG (transparent) ─────────────────────────────
// Byte-validated against the API's PNG magic-byte sniff (89 50 4E 47 ...).
const ONE_PX_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwAChwGA60e6kgAAAABJRU5ErkJggg==";
function makeTestPng() {
	return Buffer.from(ONE_PX_PNG_BASE64, "base64");
}

// ─── http helper ─────────────────────────────────────────────────────
async function api(path, { method = "GET", headers = {}, body, auth = false } = {}) {
	const h = { ...headers };
	if (auth) {
		// The agent key is sent as a Bearer token per skill.md. Never logged.
		h.Authorization = `Bearer ${cfg.agentKey}`;
	}
	let res;
	try {
		res = await fetch(`${cfg.apiBase}${path}`, { method, headers: h, body });
	} catch (err) {
		return { ok: false, networkError: String(err?.message ?? err) };
	}
	let json = null;
	let text = null;
	try {
		text = await res.text();
		json = text ? JSON.parse(text) : null;
	} catch {
		// non-JSON body; keep text
	}
	return { ok: res.ok, httpStatus: res.status, json, text };
}

// redact-safe payload preview: hide nothing sensitive here (no keys in payload)
function previewPayload(obj) {
	return JSON.stringify(obj, null, 2)
		.split("\n")
		.map((l) => `    ${l}`)
		.join("\n");
}

// ─── canonical launch SIWE message (mirrors apps/frontend/src/lib/siwe.ts) ──
// The API validates: domain in allowed hosts, uri host in allowed hosts,
// uri path === /create/wizard, statement exact match, chainId === 56,
// nonce matches the one issued for this patron+address.
const SIWE_STATEMENT = "sign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.";
const SIWE_ORIGIN = "https://waifu.fun";
function buildLaunchSiweMessage({ address, nonce, now = new Date(), chainId = 56 }) {
	const url = new URL(SIWE_ORIGIN);
	const issuedAt = now.toISOString();
	const expirationTime = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
	return `${url.host} wants you to sign in with your Ethereum account:\n${address}\n\n${SIWE_STATEMENT}\n\nURI: ${url.origin}/create/wizard\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expirationTime}`;
}

// ─── summary ─────────────────────────────────────────────────────────
function printSummary() {
	const pass = steps.filter((s) => s.status === "PASS").length;
	const fail = steps.filter((s) => s.status === "FAIL").length;
	const skip = steps.filter((s) => s.status === "SKIP").length;
	console.log("");
	console.log(col.bold("Summary:"));
	console.log(
		`  ${col.green(`${pass} passed`)}, ${fail ? col.red(`${fail} failed`) : "0 failed"}, ${col.yellow(`${skip} skipped`)}`,
	);
}

// ─── main ────────────────────────────────────────────────────────────
async function main() {
	console.log(col.bold("\nwaifu.fun launch smoke test"));
	console.log(col.dim(`  api base : ${cfg.apiBase}`));
	console.log(col.dim(`  mode     : ${cfg.live ? "LIVE (will submit create)" : "dry-run (no create)"}`));
	console.log(col.dim(`  tier     : ${cfg.tier} (${TIER_LABEL[cfg.tier] ?? "?"})`));
	console.log("");

	// pre-flight input validation
	if (!VALID_TIERS.has(cfg.tier)) {
		fatal("input: tier", `tier must be one of 80,90,95,98 (got ${cfg.tier})`);
	}
	if (cfg.live && !cfg.gasAck) {
		fatal("input: live guard", "--live requires --i-understand-this-spends-gas (create spends real BNB/gas)");
	}

	// ── step 1: gate check ──────────────────────────────────────────
	if (!cfg.inviteCode) {
		record("1. gate check", "SKIP", "no INVITE_CODE provided");
	} else {
		const r = await api(`/v2/launches/gate?inviteCode=${encodeURIComponent(cfg.inviteCode)}`);
		if (r.networkError) {
			fatal("1. gate check", `network error: ${r.networkError}`);
		} else if (!r.ok || !r.json) {
			fatal("1. gate check", `http ${r.httpStatus}: ${r.text?.slice(0, 200)}`);
		} else {
			const data = r.json.data ?? r.json;
			if (data.allowed === true) {
				record(
					"1. gate check",
					"PASS",
					`allowed via ${data.accessSource ?? "?"}${data.remainingUses != null ? `, ${data.remainingUses} uses left` : ""}`,
				);
			} else {
				fatal("1. gate check", `allowed:false - ${data.reason ?? "invite rejected"}`);
			}
		}
	}

	// ── step 2: auth probe ──────────────────────────────────────────
	// We confirm the agk_ key resolves by doing the authed /nonce call. A 200
	// means auth + owner-patron resolution worked. 401/403 means the key is
	// missing/invalid or the persona has no owner-patron. This call doubles as
	// step 4 (nonce) below; we reuse its result.
	let creatorAddress = null;
	let account = null;
	if (!cfg.privateKey) {
		record("2. auth probe", "SKIP", "no TEST_PRIVATE_KEY; cannot derive creator address for nonce");
		record("4. nonce", "SKIP", "depends on step 2");
		record("5. SIWE sign", "SKIP", "depends on step 4");
	} else {
		try {
			account = privateKeyToAccount(cfg.privateKey.startsWith("0x") ? cfg.privateKey : `0x${cfg.privateKey}`);
			creatorAddress = account.address.toLowerCase();
		} catch {
			fatal("input: private key", "TEST_PRIVATE_KEY is not a valid 32-byte hex private key");
		}

		if (!cfg.agentKey) {
			record("2. auth probe", "SKIP", "no AGENT_API_KEY provided; nonce/create are auth-gated");
			record("4. nonce", "SKIP", "depends on step 2");
			record("5. SIWE sign", "SKIP", "depends on step 4");
		} else {
			const r = await api("/v2/launches/nonce", {
				method: "POST",
				auth: true,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ address: creatorAddress }),
			});
			if (r.networkError) {
				fatal("2. auth probe", `network error: ${r.networkError}`);
			} else if (r.httpStatus === 401) {
				fatal("2. auth probe", "401 unauthorized: agent api key invalid or missing");
			} else if (r.httpStatus === 403) {
				fatal(
					"2. auth probe",
					"403 forbidden: likely AGENT_OWNER_PATRON_NOT_FOUND - complete the give-skill flow first",
				);
			} else if (!r.ok || !r.json) {
				fatal("2. auth probe", `http ${r.httpStatus}: ${r.text?.slice(0, 200)}`);
			} else {
				record("2. auth probe", "PASS", `agent key resolved (creator ${creatorAddress})`);
				// step 4 already done by this same call
				const data = r.json.data ?? r.json;
				if (!data.nonce) {
					fatal("4. nonce", "response had no nonce field");
				}
				main._nonce = data.nonce;
				record("4. nonce", "PASS", `nonce issued (expires in ${data.expiresInSeconds ?? "?"}s)`);
			}
		}
	}

	// ── step 3: upload-metadata ─────────────────────────────────────
	let flapMetaCid = null;
	if (!cfg.agentKey) {
		record("3. upload-metadata", "SKIP", "no AGENT_API_KEY (endpoint is auth-gated)");
	} else {
		const form = new FormData();
		const png = makeTestPng();
		form.append("image", new Blob([png], { type: "image/png" }), "smoke.png");
		form.append("name", cfg.name);
		form.append("symbol", cfg.symbol);
		form.append("description", cfg.description);
		const r = await api("/v2/launches/upload-metadata", { method: "POST", auth: true, body: form });
		if (r.networkError) {
			fatal("3. upload-metadata", `network error: ${r.networkError}`);
		} else if (r.httpStatus === 401) {
			fatal("3. upload-metadata", "401 unauthorized: agent api key invalid");
		} else if (r.httpStatus === 403) {
			fatal("3. upload-metadata", "403 forbidden: AGENT_OWNER_PATRON_NOT_FOUND - finish give-skill");
		} else if (!r.ok || !r.json) {
			fatal("3. upload-metadata", `http ${r.httpStatus}: ${r.text?.slice(0, 200)}`);
		} else {
			const data = r.json.data ?? r.json;
			if (!data.flapMetaCid) {
				fatal("3. upload-metadata", "response had no flapMetaCid");
			}
			flapMetaCid = data.flapMetaCid;
			record("3. upload-metadata", "PASS", `flapMetaCid ${flapMetaCid}`);
		}
	}

	// ── step 5: SIWE sign ───────────────────────────────────────────
	let siwe = null;
	if (account && main._nonce) {
		const message = buildLaunchSiweMessage({ address: account.address, nonce: main._nonce });
		let signature;
		try {
			signature = await account.signMessage({ message });
		} catch (err) {
			fatal("5. SIWE sign", `signing failed: ${String(err?.message ?? err)}`);
		}
		siwe = { message, signature };
		record("5. SIWE sign", "PASS", `signed (${signature.length}-char sig)`);
	} else if (steps.find((s) => s.name === "5. SIWE sign") === undefined) {
		record("5. SIWE sign", "SKIP", "no nonce available to sign");
	}

	// ── step 6: create (GUARDED) ────────────────────────────────────
	const closeTimestamp = Math.floor(Date.now() / 1000) + cfg.closeSeconds;
	const createPayload = {
		name: cfg.name,
		symbol: cfg.symbol,
		flapMetaCid: flapMetaCid ?? "<from step 3>",
		creator: creatorAddress ?? "<from private key>",
		tier: cfg.tier,
		closeTimestamp,
		siwe: siwe ?? { message: "<built in step 5>", signature: "<signed in step 5>" },
	};

	let launchId = null;
	if (!cfg.live) {
		const ready = Boolean(flapMetaCid && siwe && creatorAddress && cfg.agentKey);
		record(
			"6. create",
			ready ? "DRY-RUN" : "DRY-RUN",
			ready
				? "would POST /v2/launches with payload below (all inputs valid)"
				: "would POST /v2/launches (some inputs were skipped; see above)",
		);
		console.log(col.dim("    --- payload that WOULD be sent ---"));
		console.log(col.dim(previewPayload(createPayload)));
		record("7. poll", "SKIP", "dry-run does not create a launch to poll");
	} else {
		if (!flapMetaCid || !siwe || !creatorAddress || !cfg.agentKey) {
			fatal("6. create", "cannot run live create: missing one of agent key / flapMetaCid / SIWE / creator");
		}
		const r = await api("/v2/launches", {
			method: "POST",
			auth: true,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(createPayload),
		});
		if (r.networkError) {
			fatal("6. create", `network error: ${r.networkError}`);
		} else if (!r.ok || !r.json) {
			fatal("6. create", `http ${r.httpStatus}: ${r.text?.slice(0, 300)}`);
		} else {
			const data = r.json.data ?? r.json;
			launchId = data.id;
			record(
				"6. create",
				"PASS",
				`launch ${launchId} created, token ${data.token ?? data.tokenAddress}, tx ${data.txHash ?? data.createTxHash}`,
			);
			console.log(col.dim(`    presale: https://waifu.fun/launch/${launchId}`));
		}

		// ── step 7: poll status ──────────────────────────────────────
		if (launchId) {
			for (let i = 1; i <= cfg.pollAttempts; i++) {
				const detail = await api(`/v2/launches/${launchId}`);
				const bundle = await api(`/v2/launches/${launchId}/bundle-status`);
				const dData = detail.json?.data ?? detail.json ?? {};
				const bData = bundle.json?.data ?? bundle.json ?? {};
				console.log(
					col.dim(
						`    poll ${i}/${cfg.pollAttempts}: state=${dData.state ?? dData.status ?? "?"} ` +
							`bundleStatus=${bData.bundleStatus ?? "?"} ` +
							`bundleTx=${bData.bundleTxHash ?? "-"}`,
					),
				);
				if (i < cfg.pollAttempts) await new Promise((res) => setTimeout(res, 5000));
			}
			record("7. poll", "PASS", `polled launch ${launchId} status ${cfg.pollAttempts}x`);
		}
	}

	printSummary();
	const failed = steps.some((s) => s.status === "FAIL");
	process.exit(failed ? 1 : 0);
}

main().catch((err) => {
	console.error(col.red(`\nunexpected error: ${err?.stack ?? err}`));
	process.exit(1);
});
