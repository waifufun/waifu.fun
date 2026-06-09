import { describe, expect, it } from "vitest";

import { LAUNCH_TIERS } from "@/lib/launch-vault/tiers";

import { buildLaunchFaq } from "./launch-faq-data";

describe("buildLaunchFaq", () => {
	it("returns 4 questions regardless of tier", () => {
		for (const tier of Object.values(LAUNCH_TIERS)) {
			const items = buildLaunchFaq(tier);
			expect(items).toHaveLength(4);
		}
	});

	it("tier 80 does not pitch v2 lp graduation", () => {
		const items = buildLaunchFaq(LAUNCH_TIERS.TIER_80);
		const body = items.map((i) => i.a).join(" ");
		// negative copy is fine ("no separate v2 lp"); we just don't pitch graduation.
		expect(body).not.toMatch(/added to pcs v2 lp/i);
		expect(body).not.toMatch(/graduates to pcs v2/i);
		expect(body).toMatch(/bonding curve/i);
	});

	it("tier 80 claim copy is 100% at tge (no vesting)", () => {
		const items = buildLaunchFaq(LAUNCH_TIERS.TIER_80);
		const claim = items.find((i) => i.q === "when can i claim?")?.a ?? "";
		expect(claim).toMatch(/100% unlocks at tge/);
		expect(claim).not.toMatch(/30d/);
	});

	it("tier 90 mentions v2 lp + 30d vesting", () => {
		const items = buildLaunchFaq(LAUNCH_TIERS.TIER_90);
		const bnb = items.find((i) => i.q === "what happens to the bnb?")?.a ?? "";
		const claim = items.find((i) => i.q === "when can i claim?")?.a ?? "";
		expect(bnb).toMatch(/pcs v2 lp/);
		expect(bnb).toMatch(/90%/);
		expect(claim).toMatch(/30d/);
		expect(claim).toMatch(/50% unlocks/);
	});

	it("tier 98 surfaces its display name in burn copy", () => {
		const items = buildLaunchFaq(LAUNCH_TIERS.TIER_98);
		const burn = items.find((i) => i.q === "what gets burned?")?.a ?? "";
		expect(burn).toMatch(/GIGACHAD/);
		expect(burn).toMatch(/320m/);
	});

	it("refund question is uniform across tiers", () => {
		for (const tier of Object.values(LAUNCH_TIERS)) {
			const items = buildLaunchFaq(tier);
			const refund = items.find((i) => i.q === "what if the bundle fails?")?.a ?? "";
			expect(refund).toMatch(/refunds enable/i);
			expect(refund).toMatch(/bonus pool/i);
		}
	});

	it("contains no em-dashes", () => {
		for (const tier of Object.values(LAUNCH_TIERS)) {
			const items = buildLaunchFaq(tier);
			for (const item of items) {
				expect(item.q.includes("\u2014"), `q has em-dash: ${item.q}`).toBe(false);
				expect(item.a.includes("\u2014"), `a has em-dash: ${item.a}`).toBe(false);
			}
		}
	});
});
