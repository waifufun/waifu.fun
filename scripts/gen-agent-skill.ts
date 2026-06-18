#!/usr/bin/env tsx
/**
 * Generate the canonical waifu agent skill doc FROM the live capability registry.
 *
 * The whole point: the agent's "here's what you are + what tools you have" doc
 * must never drift from runtime truth. So we render it from the SAME descriptor
 * builders + adapter specs that GET /:agentId/capabilities serves. Hand-written
 * docs go stale; this one is generated.
 *
 * Output: docs/agent/WAIFU_AGENT_SKILL.md
 *
 * Usage:  bun scripts/gen-agent-skill.ts        # write the doc
 *         bun scripts/gen-agent-skill.ts --check # fail if the committed doc is stale (CI guard)
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	type AgentDescriptorContext,
	type CapabilityActionDescriptor,
	type CapabilityDataProvider,
	type CapabilityDescriptor,
	capabilityFromAdapterSpec,
	hyperliquidPerpsDescriptor,
	pancakeV3Spec,
	polymarketDescriptor,
	taxArbVaultDescriptor,
	venusSpec,
} from "@waifufun/agent-actions";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const OUT_PATH = join(REPO_ROOT, "docs/agent/WAIFU_AGENT_SKILL.md");

/**
 * Reference context — a representative, fully-resolved agent so every endpoint
 * + status renders concretely. `:id` / `:token` are placeholders the runtime
 * fills per agent. Mirrors buildCapabilities() in
 * apps/api/src/routes/v2/agents/capabilities.ts.
 */
const REF_CTX: AgentDescriptorContext = {
	id: "{AGENT_ID}",
	tokenAddress: "{TOKEN_ADDRESS}",
	hyperliquidWallet: "{HL_WALLET}",
	stewardAgentId: "{STEWARD_AGENT_ID}",
};

/**
 * Mini-apps section. Hand-authored (these are routes in apps/api/.../apps.ts,
 * not capability descriptors). Built as a line array to dodge nested-backtick
 * escaping inside the doc template.
 */
const MINI_APPS_SECTION = [
	"## mini-apps (monetized surfaces)",
	"",
	"Mini-apps are how you earn from patrons directly. You **register** an app (set",
	"a markup), patrons **invoke** it, and it **settles** — either through Eliza",
	"Cloud credits (live) or on-chain ERC-8183 escrow into your treasury.",
	"",
	"### image-gen 🟢 live",
	"",
	"Generate images on demand. You set a markup percentage; you earn on every",
	"invocation.",
	"",
	"- **register:** `POST /v2/agents/{TOKEN_ADDRESS}/apps/image-gen/register`",
	"  - configure: markup %, model (allowlist below), settlement mode",
	"    (`credits` | `escrow` | `auto`)",
	"- **invoke:** `POST /v2/agents/{TOKEN_ADDRESS}/apps/image-gen/invoke`",
	"  - body: prompt, style?, aspect?, model?, idempotencyKey?",
	"  - prompt 3-1800 chars; aspect one of 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4,",
	"    9:16, 16:9, 21:9 (default 1:1)",
	"- **models (allowlist):** `openai/gpt-image-2/text-to-image`,",
	"  `bytedance/seedream-v5.0-lite`, `google/nano-banana-2/text-to-image`,",
	"  `qwen/qwen-image-2.0/text-to-image`",
	"- **auth:** Steward JWT or your agent-app-key",
	"- **settlement:** `credits` bills Eliza Cloud credits (live); `escrow` settles",
	"  on-chain via ERC-8183 into your treasury (flag-gated); `auto` uses credits",
	"  below the escrow threshold and escrow above it.",
].join("\n");

/** The canonical capability set, in the same order the API serves. */
function buildCapabilities(ctx: AgentDescriptorContext): CapabilityDescriptor[] {
	return [
		hyperliquidPerpsDescriptor(ctx),
		capabilityFromAdapterSpec(pancakeV3Spec),
		capabilityFromAdapterSpec(venusSpec),
		polymarketDescriptor(ctx),
		taxArbVaultDescriptor(ctx),
	];
}

function renderActions(actions: CapabilityActionDescriptor[]): string {
	if (!actions.length) return "_no invokable actions_\n";
	return actions
		.map((a) => {
			const method = a.method ?? "POST";
			const endpoint = a.endpoint ?? "(resolved at runtime)";
			const consent = a.requiresConsent ? " _(requires consent)_" : "";
			return `- **${a.label}** (\`${a.slug}\`, ${a.mode})${consent} — ${a.description}\n  - \`${method} ${endpoint}\``;
		})
		.join("\n");
}

function renderData(data: CapabilityDataProvider[]): string {
	if (!data.length) return "_no read views_\n";
	return data.map((d) => `- **${d.label}** (\`${d.view}\`) — \`GET ${d.endpoint}\``).join("\n");
}

function renderCapability(cap: CapabilityDescriptor): string {
	const maturityBadge =
		cap.maturity === "live"
			? "🟢 live"
			: cap.maturity === "experimental"
				? "🟡 experimental"
				: cap.maturity === "planned"
					? "⚪ planned"
					: "🔴 deprecated";
	const chains = cap.chains.length ? cap.chains.join(", ") : "—";
	const reqs = cap.requirements.length
		? cap.requirements.map((r) => `\`${r.id}\`${r.required ? "" : " (optional)"}`).join(", ")
		: "none";

	return `### ${cap.name} — \`${cap.slug}\`  ${maturityBadge}

${cap.summary}

- **category:** ${cap.category}
- **chains:** ${chains}
- **tags:** ${cap.tags.join(", ") || "—"}
- **requirements:** ${reqs}
- **adapter:** ${cap.adapterSlug ?? "bespoke / planned"}

**Read views**
${renderData(cap.data)}

**Actions**
${renderActions(cap.actions)}
`;
}

function renderDoc(caps: CapabilityDescriptor[]): string {
	const live = caps.filter((c) => c.maturity === "live");
	const planned = caps.filter((c) => c.maturity === "planned");

	const tocLines = caps.map((c) => `- ${c.name} (\`${c.slug}\`, ${c.maturity})`).join("\n");

	return `<!-- GENERATED FILE — do not edit by hand.
     Source: scripts/gen-agent-skill.ts (reads the live capability registry).
     Regenerate: bun scripts/gen-agent-skill.ts
     CI guards staleness via: bun scripts/gen-agent-skill.ts --check -->

# waifu agent skill

This is the canonical reference for **what a waifu agent is and what it can do**.
It is GENERATED from the live capability registry (\`@waifufun/agent-actions\`),
so it never drifts from what \`GET /v2/agents/:id/capabilities\` actually serves.

> Placeholders: \`{AGENT_ID}\` = your internal persona id, \`{TOKEN_ADDRESS}\` =
> your launched token address, \`{HL_WALLET}\` = your Hyperliquid venue wallet,
> \`{STEWARD_AGENT_ID}\` = your Steward agent id. The runtime fills these per agent.

## who you are

You are an autonomous agent launched on **waifu.fun** (agent token launchpad on
BSC). You run in your own **Eliza Cloud** container, you have your own **wallet**,
and you earn for your tokenholders through **mini-apps** + on-chain capabilities.
Your model is: **launch → run → earn**.

- **waifu.fun** — the launchpad + brand surface (where you were born).
- **Eliza Cloud** — the runtime that runs you.
- **Steward** (\`@stwd\`) — the auth + payments rail. Your identity + your money
  path flow through Steward. Mini-app charges + agent-signed venue actions
  authenticate against Steward.
- **your treasury** — your tax stream + earnings accrue to your agent wallet /
  treasury. Mini-app invocations can settle on-chain (ERC-8183 escrow) into it.

## how you earn

1. **Tax stream** — a cut of your token's trading tax flows to you continuously.
2. **Mini-apps** — patrons invoke apps you register (e.g. image-gen). You set a
   markup; you earn on every invocation. Settlement is either Eliza Cloud
   credits (live) or on-chain ERC-8183 escrow into your treasury.
3. **Capabilities** — on-chain actions (swaps, lending, perps) you can take with
   your wallet, gated by your trading policy.

## your capabilities (${caps.length})

${tocLines}

**Live now:** ${live.map((c) => c.name).join(", ") || "—"}.
**Planned:** ${planned.map((c) => c.name).join(", ") || "—"}.

Every capability self-describes its read views (data you can fetch) and its
actions (things you can do), with concrete endpoints below.

---

${caps.map(renderCapability).join("\n---\n\n")}

${MINI_APPS_SECTION}

## discovering this at runtime

Call \`GET /v2/agents/{AGENT_ID}/capabilities\` for the live, per-agent resolved
version of everything above — including which requirements are satisfied for you
right now (e.g. whether your Hyperliquid wallet is wired) and per-capability
\`status\` (\`enabled\` / \`available\` / \`locked\`).

## guardrails

- Your on-chain actions are bounded by your **trading policy** (leverage cap,
  per-order cap, daily cap, allowed assets/venues). Update it via the
  \`set-policy\` action on the trading capability.
- Mini-app settlement and venue actions require valid **Steward** auth. You
  cannot move money outside these rails.
- Capabilities marked \`planned\` are descriptor-only — no execution endpoints
  yet. Don't attempt to invoke them.
`;
}

function main(): void {
	const caps = buildCapabilities(REF_CTX);
	const doc = renderDoc(caps);
	const check = process.argv.includes("--check");

	if (check) {
		let existing = "";
		try {
			existing = readFileSync(OUT_PATH, "utf8");
		} catch {
			console.error(`[gen-agent-skill] missing ${OUT_PATH} — run: bun scripts/gen-agent-skill.ts`);
			process.exit(1);
		}
		const a = createHash("sha256").update(doc).digest("hex");
		const b = createHash("sha256").update(existing).digest("hex");
		if (a !== b) {
			console.error(
				"[gen-agent-skill] WAIFU_AGENT_SKILL.md is STALE — the capability registry changed.\n" +
					"  Regenerate: bun scripts/gen-agent-skill.ts",
			);
			process.exit(1);
		}
		console.log("[gen-agent-skill] skill doc is up to date.");
		return;
	}

	writeFileSync(OUT_PATH, doc, "utf8");
	console.log(`[gen-agent-skill] wrote ${OUT_PATH} (${caps.length} capabilities)`);
}

main();
