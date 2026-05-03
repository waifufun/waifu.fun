import type { AgentEvent } from "./types";

/**
 * Short copy for the activity feed. One-line declarative, lowercase, no emoji.
 * Defensive on every data field: the backend schema is evolving (see W1.7 spec)
 * so we never assume a shape beyond what the event type guarantees.
 */
export function describeEvent(e: AgentEvent): string {
	const data = (e.data ?? {}) as Record<string, unknown>;

	switch (e.eventType) {
		case "token.created": {
			const symbol = str(data.symbol);
			return symbol ? `minted $${symbol} on four.meme` : "minted token on four.meme";
		}
		case "token.purchased": {
			const bnb = formatBnb(data.bnbIn);
			const tokens = formatAmount(data.tokenOut);
			const symbol = str(data.symbol);
			if (bnb && tokens && symbol) return `${bnb} → ${tokens} $${symbol}`;
			return "bought tokens";
		}
		case "token.sold": {
			const tokens = formatAmount(data.tokenIn);
			const bnb = formatBnb(data.bnbOut);
			const symbol = str(data.symbol);
			if (tokens && bnb && symbol) return `${tokens} $${symbol} → ${bnb}`;
			return "sold tokens";
		}
		case "tax.received": {
			const bnb = formatBnb(data.amount);
			return bnb ? `+${bnb} tax from trade` : "received tax";
		}
		case "treasury.swept": {
			const bnb = formatBnb(data.amount);
			return bnb ? `swept ${bnb} → inference credits` : "swept treasury → inference credits";
		}
		case "x.posted": {
			const text = str(data.text);
			return text ? `posted on x: "${truncate(text, 60)}"` : "posted on x";
		}
		case "x.connected":
			return "connected x account";
		case "x.disconnected":
			return "disconnected x account";
		case "inference.spent": {
			const cost = num(data.cost_usd);
			const model = str(data.model);
			if (cost !== null && model) return `spent $${cost.toFixed(4)} on ${model}`;
			if (cost !== null) return `spent $${cost.toFixed(4)} on inference`;
			return "spent on inference";
		}
		case "credits.low": {
			const days = num(data.runway_days);
			return days !== null ? `credits running low · ${Math.floor(days)}d runway` : "credits running low";
		}
		case "credits.topped_up": {
			const bnb = formatBnb(data.amount);
			return bnb ? `topped up ${bnb} in credits` : "topped up credits";
		}
		case "agent.paused": {
			const scope = str(data.scope);
			return scope ? `paused (${scope})` : "paused";
		}
		case "agent.resumed": {
			const scope = str(data.scope);
			return scope ? `resumed (${scope})` : "resumed";
		}
		case "adapter.enabled": {
			const slug = str(data.slug);
			return slug ? `enabled adapter ${slug}` : "enabled adapter";
		}
		case "adapter.disabled": {
			const slug = str(data.slug);
			return slug ? `disabled adapter ${slug}` : "disabled adapter";
		}
		default:
			return e.eventType.replace(/[._]/g, " ");
	}
}

/**
 * Event type → short bracket marker rendered next to the row. Keeps it ASCII
 * so the brand stays tidy: no icon libraries, no emoji.
 */
export function eventMarker(eventType: string): string {
	if (eventType.startsWith("token.")) return "[tx]";
	if (eventType.startsWith("tax.")) return "[tax]";
	if (eventType.startsWith("treasury.")) return "[tr]";
	if (eventType.startsWith("x.")) return "[x]";
	if (eventType.startsWith("inference.")) return "[inf]";
	if (eventType.startsWith("credits.")) return "[cr]";
	if (eventType.startsWith("agent.")) return "[sys]";
	if (eventType.startsWith("adapter.")) return "[adp]";
	return "[·]";
}

// ---------- formatters ----------

function str(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function num(v: unknown): number | null {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() !== "") {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

export function formatBnb(v: unknown): string {
	const n = num(v);
	if (n === null) return "";
	if (Math.abs(n) < 0.0001) return `${n.toExponential(2)} bnb`;
	if (Math.abs(n) < 1) return `${n.toFixed(4)} bnb`;
	return `${n.toFixed(3)} bnb`;
}

export function formatAmount(v: unknown): string {
	const n = num(v);
	if (n === null) return "";
	if (n === 0) return "0";
	const abs = Math.abs(n);
	if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
	if (abs < 0.01) return n.toExponential(2);
	return n.toFixed(2);
}

export function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1).trimEnd()}…`;
}
