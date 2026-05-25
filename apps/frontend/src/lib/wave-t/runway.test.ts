import { describe, expect, it } from "vitest";

import { computeRunway, runwayColor } from "./runway";

describe("computeRunway", () => {
	it("returns null days when treasury is missing or zero", () => {
		expect(computeRunway(null, 420).days).toBeNull();
		expect(computeRunway(undefined, 420).days).toBeNull();
		expect(computeRunway(0, 420).days).toBeNull();
		expect(computeRunway(-100, 420).days).toBeNull();
	});

	it("returns null days when monthly burn is missing or zero", () => {
		expect(computeRunway(10_000, null).days).toBeNull();
		expect(computeRunway(10_000, undefined).days).toBeNull();
		expect(computeRunway(10_000, 0).days).toBeNull();
	});

	it("computes days = treasury / monthly * 30 floor", () => {
		// $4200 treasury, $420/mo burn -> 10 months of runway -> 300 days
		expect(computeRunway(4_200, 420).days).toBe(300);
		// $420 / $420 -> 30 days exactly
		expect(computeRunway(420, 420).days).toBe(30);
		// $200 / $420 -> ~14 days
		expect(computeRunway(200, 420).days).toBe(14);
	});

	it("assigns red tone under 30 days", () => {
		expect(computeRunway(200, 420).tone).toBe("negative");
	});

	it("assigns neutral tone 30..89 days", () => {
		expect(computeRunway(420, 420).tone).toBe("neutral");
		expect(computeRunway(1_000, 420).tone).toBe("neutral");
	});

	it("assigns positive tone at 90+ days", () => {
		expect(computeRunway(1_260, 420).tone).toBe("positive"); // 90d exactly
		expect(computeRunway(10_000, 420).tone).toBe("positive");
	});
});

describe("runwayColor", () => {
	it("maps tones to CSS vars", () => {
		expect(runwayColor("positive")).toBe("var(--positive)");
		expect(runwayColor("negative")).toBe("var(--negative)");
		expect(runwayColor("neutral")).toBe("var(--text-primary)");
	});
});
