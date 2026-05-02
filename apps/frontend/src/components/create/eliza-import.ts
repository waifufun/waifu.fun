/**
 * Eliza character file parser.
 *
 * Best-effort import: validates `name` exists, derives ticker, bio, and persona
 * prompt from the well-known fields. Missing optional fields are tolerated.
 *
 * Eliza character shape (common fields):
 *   - name: string (required)
 *   - bio: string | string[]
 *   - description / system: string
 *   - style: { all?: string[]; chat?: string[]; post?: string[] }
 *   - topics: string[]
 *   - adjectives: string[]
 *   - messageExamples: nested arrays (ignored here)
 *
 * Returns either a populated persona patch or a typed error.
 */

const MAX_BIO = 240;
const MAX_PROMPT = 2000;
const MAX_NAME = 48;
const MAX_TICKER = 10;

export type ElizaImportPersona = {
	name: string;
	ticker: string;
	bio: string;
	personaPrompt: string;
	avatarDataUrl: string | null;
};

export type ElizaImportResult =
	| { ok: true; persona: ElizaImportPersona; warnings: string[] }
	| { ok: false; error: string };

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is string => typeof v === "string");
}

function deriveTicker(name: string): string {
	const cleaned = name
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, MAX_TICKER);
	if (cleaned.length >= 2) return cleaned;
	// Pad with X if name was too short / mostly punctuation
	return `${cleaned}XXXX`.slice(0, 4);
}

function pickBio(raw: unknown, description: string | null): string {
	if (typeof raw === "string") return raw.slice(0, MAX_BIO);
	if (Array.isArray(raw)) {
		const first = raw.find((v): v is string => typeof v === "string" && v.trim().length > 0);
		if (first) return first.slice(0, MAX_BIO);
	}
	if (description) return description.slice(0, MAX_BIO);
	return "";
}

function buildPersonaPrompt(record: Record<string, unknown>): string {
	const parts: string[] = [];

	const system = asString(record.system);
	if (system) parts.push(system.trim());

	const description = asString(record.description);
	if (description && !system) parts.push(description.trim());

	const style = record.style;
	if (style && typeof style === "object" && !Array.isArray(style)) {
		const styleRec = style as Record<string, unknown>;
		const all = asStringArray(styleRec.all);
		const chat = asStringArray(styleRec.chat);
		const post = asStringArray(styleRec.post);
		const styleLines = [...all, ...chat, ...post];
		if (styleLines.length > 0) {
			parts.push(`Style:\n- ${styleLines.join("\n- ")}`);
		}
	}

	const adjectives = asStringArray(record.adjectives);
	if (adjectives.length > 0) {
		parts.push(`Adjectives: ${adjectives.join(", ")}`);
	}

	const topics = asStringArray(record.topics);
	if (topics.length > 0) {
		parts.push(`Topics: ${topics.join(", ")}`);
	}

	return parts.join("\n\n").slice(0, MAX_PROMPT);
}

/**
 * Parse a raw character JSON string into a wizard persona patch.
 * Never throws — returns a typed error result on bad input.
 */
export function parseElizaCharacter(input: string): ElizaImportResult {
	const trimmed = input.trim();
	if (!trimmed) {
		return { ok: false, error: "paste a character file first" };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return { ok: false, error: "couldn't parse character file. is it valid JSON?" };
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, error: "expected a JSON object at the top level" };
	}

	const record = parsed as Record<string, unknown>;

	const rawName = asString(record.name);
	if (!rawName || !rawName.trim()) {
		return { ok: false, error: "missing required field: name" };
	}

	const name = rawName.trim().slice(0, MAX_NAME);
	const ticker = deriveTicker(name);
	const description = asString(record.description);
	const bio = pickBio(record.bio, description);
	const personaPrompt = buildPersonaPrompt(record);

	const warnings: string[] = [];
	if (!bio) warnings.push("no bio in character file; you'll need to add one");
	if (!personaPrompt) warnings.push("no style/system; persona prompt left empty");

	return {
		ok: true,
		persona: {
			name,
			ticker,
			bio,
			personaPrompt,
			avatarDataUrl: null,
		},
		warnings,
	};
}
