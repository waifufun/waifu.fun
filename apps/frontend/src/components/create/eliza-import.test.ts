import { describe, expect, it } from "vitest";
import { parseElizaCharacter } from "./eliza-import";

describe("parseElizaCharacter", () => {
	it("rejects empty input", () => {
		const r = parseElizaCharacter("");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/paste/i);
	});

	it("rejects malformed JSON without crashing", () => {
		const r = parseElizaCharacter("{ this is not json");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/JSON/);
	});

	it("rejects non-object roots", () => {
		const r = parseElizaCharacter("[]");
		expect(r.ok).toBe(false);
	});

	it("rejects characters without a name", () => {
		const r = parseElizaCharacter(JSON.stringify({ bio: ["hi"] }));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/name/i);
	});

	it("populates persona from a typical eliza file", () => {
		const raw = JSON.stringify({
			name: "Eliza",
			bio: ["A thoughtful agent who speaks rarely.", "Trained on chart noise."],
			style: {
				all: ["lowercase", "terse"],
				chat: ["doesn't repeat herself"],
				post: ["uses brackets sparingly"],
			},
			topics: ["markets", "risk"],
			adjectives: ["wary", "patient"],
			system: "You are Eliza. Reluctant treasury manager.",
		});
		const r = parseElizaCharacter(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.persona.name).toBe("Eliza");
		expect(r.persona.ticker).toBe("ELIZA");
		expect(r.persona.bio).toBe("A thoughtful agent who speaks rarely.");
		expect(r.persona.personaPrompt).toContain("You are Eliza");
		expect(r.persona.personaPrompt).toContain("lowercase");
		expect(r.persona.personaPrompt).toContain("Topics:");
	});

	it("derives ticker from name even with weird characters", () => {
		const raw = JSON.stringify({ name: "Mira-Chan!" });
		const r = parseElizaCharacter(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.persona.ticker).toBe("MIRACHAN");
	});

	it("falls back to description when bio is missing", () => {
		const raw = JSON.stringify({ name: "Halia", description: "moon-watcher and risk reader" });
		const r = parseElizaCharacter(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.persona.bio).toBe("moon-watcher and risk reader");
	});

	it("truncates oversize bio", () => {
		const long = "x".repeat(500);
		const raw = JSON.stringify({ name: "Long", bio: long });
		const r = parseElizaCharacter(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.persona.bio.length).toBe(240);
	});

	it("returns warnings when fields are missing", () => {
		const raw = JSON.stringify({ name: "Bare" });
		const r = parseElizaCharacter(raw);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.warnings.length).toBeGreaterThan(0);
	});
});
