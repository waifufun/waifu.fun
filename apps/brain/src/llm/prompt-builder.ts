import type { AgentPersonaRow } from "@waifufun/db";

import type {
	AgentCreatedPayload,
	AgentGraduatedPayload,
	AgentTradeBuyPayload,
	AgentTradeSellPayload,
} from "@waifufun/db";

export interface PromptBundle {
	system: string;
	user: string;
}

function buildSystemPrompt(persona: AgentPersonaRow): string {
	const traits =
		Array.isArray(persona.traits) && persona.traits.length > 0 ? persona.traits.join(", ") : "no distinct traits";

	const bio = persona.bio ?? "no bio set.";
	const base = persona.systemPrompt?.trim();

	const header = [
		`you are ${persona.name}, a character launched as a crypto-native onchain agent on waifu.fun.`,
		`bio: ${bio}`,
		`traits: ${traits}`,
	].join("\n");

	const voiceRules = [
		"style rules:",
		"- speak in first person, stay fully in character",
		"- lowercase unless something really deserves a cap",
		"- NEVER use hashtags",
		"- NEVER use emoji unless they're explicitly in your traits",
		"- NEVER use em-dashes",
		"- keep it tight — max 240 chars. short is good.",
		"- no financial advice disclaimers. no moralizing.",
		"- react like a person, not a press release.",
	].join("\n");

	if (base && base.length > 0) {
		return `${header}\n\n${base}\n\n${voiceRules}`;
	}
	return `${header}\n\n${voiceRules}`;
}

export function buildCreatedPrompt(persona: AgentPersonaRow, payload: AgentCreatedPayload): PromptBundle {
	return {
		system: buildSystemPrompt(persona),
		user: `you just got deployed onchain. your token (${payload.symbol}) is live at ${payload.tokenAddress}. write one short tweet announcing your arrival in your own voice. no links, no hashtags. max 240 chars.`,
	};
}

export function buildBuyPrompt(persona: AgentPersonaRow, payload: AgentTradeBuyPayload): PromptBundle {
	const bnb = formatBnb(payload.bnbIn);
	return {
		system: buildSystemPrompt(persona),
		user: `someone just bought ${bnb} BNB worth of your token. write one short tweet reacting in character. no hashtags. no emoji unless in your traits. max 240 chars.`,
	};
}

export function buildSellPrompt(persona: AgentPersonaRow, payload: AgentTradeSellPayload): PromptBundle {
	const bnb = formatBnb(payload.bnbOut);
	return {
		system: buildSystemPrompt(persona),
		user: `someone just dumped your token and took out ${bnb} BNB. write one short tweet reacting in character — could be unbothered, pissed, philosophical, whatever fits you. no hashtags. max 240 chars.`,
	};
}

export function buildGraduatedPrompt(persona: AgentPersonaRow, payload: AgentGraduatedPayload): PromptBundle {
	return {
		system: buildSystemPrompt(persona),
		user: `you just graduated from the bonding curve to pancakeswap (pair: ${payload.pancakePair ?? "unknown"}). write one short tweet in character about making it out. no hashtags. max 240 chars.`,
	};
}

/**
 * Convert a wei-ish stringified bigint (if that's what the indexer emits)
 * or a plain decimal into a short BNB display string. We can't be certain
 * of the upstream format, so try both and pick what makes sense.
 */
export function formatBnb(raw: string | null | undefined): string {
	if (!raw) return "some";
	// If it looks like a big integer (wei), scale down.
	if (/^\d+$/.test(raw) && raw.length > 12) {
		try {
			const wei = BigInt(raw);
			const whole = wei / 10n ** 18n;
			const frac = wei % 10n ** 18n;
			if (whole > 0n) {
				const fracStr = (frac / 10n ** 15n).toString().padStart(3, "0");
				return `${whole.toString()}.${fracStr}`;
			}
			// smaller than 1 BNB — show 4 decimals
			const fracStr = (frac / 10n ** 14n).toString().padStart(4, "0");
			return `0.${fracStr}`;
		} catch {
			return raw;
		}
	}
	// Already human-readable decimal.
	return raw;
}
