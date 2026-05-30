import { type AgentEventType, isAgentEventType } from "../schema/agent-events.js";

export type AccentColor = "positive" | "negative" | "neutral";

export type RenderedEvent = {
	template: string;
	renderedText: string;
	iconKey?: string;
	accentColor?: AccentColor;
	category?: "trading" | "treasury" | "social" | "safety" | "identity" | "apps" | "build" | "system";
};

export type EventRenderer = (payload: Record<string, unknown>) => RenderedEvent;

function str(payload: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "string" && value.trim().length > 0) return value;
	}
	return null;
}

function num(payload: Record<string, unknown>, ...keys: string[]): number | null {
	for (const key of keys) {
		const value = payload[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function usd(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "$0.00";
	const abs = Math.abs(value);
	const formatted = abs >= 1000 ? abs.toLocaleString("en-US", { maximumFractionDigits: 2 }) : abs.toFixed(2);
	return `${value < 0 ? "-" : ""}$${formatted}`;
}

function signedUsd(value: number | null): string {
	if (value === null) return "$0.00";
	return `${value > 0 ? "+" : ""}${usd(value)}`;
}

function pct(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "";
	return ` (${value > 0 ? "+" : ""}${value.toFixed(2)}%)`;
}

function size(value: number | null): string {
	if (value === null) return "0";
	return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function asset(payload: Record<string, unknown>): string {
	return (str(payload, "asset", "coin", "symbol", "tokenSymbol") ?? "asset").toLowerCase();
}

function firstLine(value: string): string {
	return value.split(/\r?\n/, 1)[0] ?? value;
}

function clip(value: string, max: number): string {
	return value.length > max ? value.slice(0, max) : value;
}

function shortAddress(value: string | null): string {
	if (!value) return "unknown";
	if (value.length <= 12) return value;
	return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function withDefaults(
	template: string,
	renderedText: string,
	rest: Omit<RenderedEvent, "template" | "renderedText"> = {},
): RenderedEvent {
	return {
		template,
		renderedText,
		iconKey: rest.iconKey ?? "Activity",
		accentColor: rest.accentColor ?? "neutral",
		...rest,
	};
}

export const RENDERERS: Partial<Record<AgentEventType, EventRenderer>> = {
	"commit.pushed": (p) =>
		withDefaults(
			"commit.pushed",
			`shipped ${clip(str(p, "sha") ?? "commit", 7)} · ${str(p, "repoLabel") ?? "github"} · ${clip(firstLine(str(p, "message") ?? "commit"), 60)}`,
			{ iconKey: "GitCommit", category: "build" },
		),
	"pr.merged": (p) =>
		withDefaults(
			"pr.merged",
			`merged PR #${num(p, "number") ?? str(p, "number") ?? "?"} · ${str(p, "repoLabel") ?? "github"} · ${clip(str(p, "title") ?? "pull request", 60)}`,
			{ iconKey: "GitMerge", accentColor: "positive", category: "build" },
		),
	"trade.open": (p) => {
		const a = asset(p);
		const side = str(p, "side") ?? "position";
		const notional = num(p, "notionalUsd", "marginUsd", "usd");
		const lev = num(p, "leverage");
		const entry = num(p, "entryPrice", "price");
		return withDefaults(
			"trade.open",
			`opened ${a} ${side} ${usd(notional)} ${lev ? `${lev}x ` : ""}at ${usd(entry)}`.replace(/ {2,}/g, " "),
			{
				iconKey: "hyperliquid",
				accentColor: "positive",
				category: "trading",
			},
		);
	},
	"trade.close": (p) =>
		withDefaults(
			"trade.close",
			`closed ${asset(p)} ${str(p, "side") ?? "position"} for ${signedUsd(num(p, "pnlUsd", "closedPnl"))}${pct(num(p, "pnlPct"))}`,
			{
				iconKey: "hyperliquid",
				accentColor: (num(p, "pnlUsd", "closedPnl") ?? 0) < 0 ? "negative" : "positive",
				category: "trading",
			},
		),
	"trade.fill": (p) =>
		withDefaults(
			"trade.fill",
			`filled ${str(p, "side") ?? "trade"} ${size(num(p, "size", "sz"))} ${asset(p)} at ${usd(num(p, "price", "px"))}`,
			{
				iconKey: "hyperliquid",
				category: "trading",
			},
		),
	"trade.liquidation": (p) =>
		withDefaults(
			"trade.liquidation",
			`🚨 liquidated ${asset(p)} ${str(p, "side") ?? "position"} at ${usd(num(p, "price", "px"))} (margin call)`,
			{
				iconKey: "ShieldAlert",
				accentColor: "negative",
				category: "trading",
			},
		),
	hl_funding: (p) => {
		const amount = num(p, "amountUsd", "usdc") ?? 0;
		return withDefaults(
			"hl_funding",
			`${amount >= 0 ? "received" : "paid"} ${usd(Math.abs(amount))} ${asset(p)} funding`,
			{
				iconKey: "hyperliquid",
				accentColor: amount >= 0 ? "positive" : "negative",
				category: "trading",
			},
		);
	},
	"transfer.in": (p) =>
		withDefaults(
			"transfer.in",
			`received ${size(num(p, "amount", "amountFormatted"))} ${(str(p, "symbol", "tokenSymbol") ?? "tokens").toUpperCase()} from ${shortAddress(str(p, "from"))}`,
			{
				iconKey: "ArrowDownToLine",
				accentColor: "positive",
				category: "treasury",
			},
		),
	"transfer.out": (p) =>
		withDefaults(
			"transfer.out",
			`sent ${size(num(p, "amount", "amountFormatted"))} ${(str(p, "symbol", "tokenSymbol") ?? "tokens").toUpperCase()} to ${shortAddress(str(p, "to"))}`,
			{
				iconKey: "ArrowUpFromLine",
				accentColor: "negative",
				category: "treasury",
			},
		),
	"tax.received": (p) =>
		withDefaults("tax.received", `received ${usd(num(p, "usd", "amountUsd"))} platform fees`, {
			iconKey: "Coins",
			accentColor: "positive",
			category: "treasury",
		}),
	"bridge.initiated": (p) =>
		withDefaults(
			"bridge.initiated",
			`started bridge ${str(p, "fromChain") ?? "source"} → ${str(p, "toChain") ?? "destination"}`,
			{ iconKey: "Bridge", category: "treasury" },
		),
	"bridge.completed": (p) =>
		withDefaults(
			"bridge.completed",
			`bridge completed ${str(p, "fromChain") ?? "source"} → ${str(p, "toChain") ?? "destination"}`,
			{ iconKey: "Bridge", accentColor: "positive", category: "treasury" },
		),
	"bridge.failed": (p) =>
		withDefaults("bridge.failed", `bridge failed: ${str(p, "reason", "error") ?? "unknown reason"}`, {
			iconKey: "Bridge",
			accentColor: "negative",
			category: "treasury",
		}),
	"hl.deposit": (p) =>
		withDefaults(
			"hl.deposit",
			`deposited ${str(p, "amount") ?? "?"} ${(str(p, "asset") ?? "USDC").toUpperCase()} to hyperliquid`,
			{ iconKey: "ArrowDownToLine", accentColor: "positive", category: "treasury" },
		),
	"hl.withdrawal": (p) =>
		withDefaults(
			"hl.withdrawal",
			`withdrew ${str(p, "amount") ?? "?"} ${(str(p, "asset") ?? "USDC").toUpperCase()} from hyperliquid`,
			{ iconKey: "ArrowUpFromLine", category: "treasury" },
		),
	"safe.tx.proposed": (p) =>
		withDefaults("safe.tx.proposed", `safe tx proposed ${shortAddress(str(p, "safeTxHash", "txHash"))}`, {
			iconKey: "Shield",
			category: "safety",
		}),
	"safe.tx.signed": (p) =>
		withDefaults("safe.tx.signed", `safe tx signed by ${str(p, "signer", "actor") ?? "steward"}`, {
			iconKey: "ShieldCheck",
			accentColor: "positive",
			category: "safety",
		}),
	"safe.tx.executed": (p) =>
		withDefaults("safe.tx.executed", `safe tx executed ${shortAddress(str(p, "txHash", "safeTxHash"))}`, {
			iconKey: "ShieldCheck",
			accentColor: "positive",
			category: "safety",
		}),
	"safe.tx": (p) =>
		withDefaults(
			"safe.tx",
			`safe tx ${str(p, "status") ?? "updated"} ${shortAddress(str(p, "txHash", "safeTxHash"))}`,
			{ iconKey: "Shield", category: "safety" },
		),
	"policy.applied": (p) =>
		withDefaults("policy.applied", `policy applied: ${str(p, "policy", "name") ?? "agent policy"}`, {
			iconKey: "ShieldCheck",
			accentColor: "positive",
			category: "safety",
		}),
	"policy.denied": (p) =>
		withDefaults("policy.denied", `policy denied: ${str(p, "reason") ?? "blocked by policy"}`, {
			iconKey: "ShieldAlert",
			accentColor: "negative",
			category: "safety",
		}),
	"policy.needs_manual": (p) =>
		withDefaults("policy.needs_manual", `policy needs manual review: ${str(p, "reason") ?? "review required"}`, {
			iconKey: "ShieldQuestion",
			category: "safety",
		}),
	"session.opened": (p) =>
		withDefaults("session.opened", `session opened ${str(p, "sessionId") ?? ""}`.trim(), {
			iconKey: "KeyRound",
			category: "safety",
		}),
	"session.revoked": (p) =>
		withDefaults("session.revoked", `session revoked ${str(p, "sessionId") ?? ""}`.trim(), {
			iconKey: "KeyRound",
			accentColor: "negative",
			category: "safety",
		}),
	"inference.spent": (p) =>
		withDefaults("inference.spent", `spent ${usd(num(p, "usd", "costUsd", "amountUsd"))} on inference`, {
			iconKey: "Brain",
			accentColor: "negative",
			category: "system",
		}),
	"credits.topped_up": (p) =>
		withDefaults("credits.topped_up", `credits topped up ${usd(num(p, "usd", "amountUsd"))}`, {
			iconKey: "BatteryCharging",
			accentColor: "positive",
			category: "system",
		}),
	"identity.registered": (p) =>
		withDefaults(
			"identity.registered",
			`identity registered ${str(p, "name", "handle") ?? shortAddress(str(p, "address"))}`,
			{ iconKey: "BadgeCheck", accentColor: "positive", category: "identity" },
		),
	"identity.card_updated": (p) =>
		withDefaults("identity.card_updated", "identity card updated", { iconKey: "BadgeCheck", category: "identity" }),
	"x.posted": (p) =>
		withDefaults("x.posted", `posted on x: ${str(p, "text", "content") ?? shortAddress(str(p, "tweetId"))}`, {
			iconKey: "x",
			category: "social",
		}),
	"x.replied": (p) =>
		withDefaults("x.replied", `replied on x: ${str(p, "text", "content") ?? shortAddress(str(p, "tweetId"))}`, {
			iconKey: "x",
			category: "social",
		}),
	"discord.posted": (p) =>
		withDefaults("discord.posted", `posted to discord: ${str(p, "text", "content") ?? "message"}`, {
			iconKey: "discord",
			category: "social",
		}),
	"telegram.posted": (p) =>
		withDefaults("telegram.posted", `posted to telegram: ${str(p, "text", "content") ?? "message"}`, {
			iconKey: "telegram",
			category: "social",
		}),
};

export function renderEvent(type: AgentEventType, payload: Record<string, unknown> = {}): RenderedEvent {
	if (!isAgentEventType(type)) throw new Error(`unknown agent event type: ${type}`);
	const renderer = RENDERERS[type];
	if (renderer) return renderer(payload);
	const fallback = str(payload, "renderedText", "message", "title") ?? type.replace(/[._]/g, " ");
	return withDefaults(type, fallback, {
		category: type.startsWith("system.") || type.startsWith("agent.") ? "system" : "apps",
	});
}

export function renderEventData(type: AgentEventType, payload: Record<string, unknown> = {}): Record<string, unknown> {
	const rendered = renderEvent(type, payload);
	return { ...payload, ...rendered };
}
