/**
 * Sanity checks for the wave-M agent surface. Vitest runs in node env
 * (no jsdom), so we exercise pure helpers and serialization edge cases
 * rather than rendering the component tree.
 */
import { describe, expect, it } from "vitest";

import { tierDisplay } from "@/components/agents-discover/agent-card-v2.helpers";

describe("agent-home-v2 tier surface", () => {
	it("hero badge name lookup returns SMOL/BASED/WAGMI/GIGACHAD in order", () => {
		expect(tierDisplay(80)?.name).toBe("SMOL");
		expect(tierDisplay(90)?.name).toBe("BASED");
		expect(tierDisplay(95)?.name).toBe("WAGMI");
		expect(tierDisplay(98)?.name).toBe("GIGACHAD");
	});

	it("only GIGACHAD earns the green accent tone (single-accent constraint)", () => {
		expect(tierDisplay(80)?.tone).not.toContain("#00ff87");
		expect(tierDisplay(90)?.tone).not.toContain("#00ff87");
		expect(tierDisplay(95)?.tone).not.toContain("#00ff87");
		expect(tierDisplay(98)?.tone).toContain("#00ff87");
	});

	it("legacy / pre-wave-M agents render no badge (null hero slice path)", () => {
		expect(tierDisplay(null)).toBeNull();
		expect(tierDisplay(undefined)).toBeNull();
	});
});
