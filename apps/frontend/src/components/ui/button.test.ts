import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button-variants";

/**
 * Lock the canonical button contract. Asserts:
 *  - `default` / `primary` resolve to the canonical accent CTA recipe
 *    (no more transparent-CTA regression from the missing token bug).
 *  - `ghost` is the canonical low-emphasis variant (transparent, white/10 ring).
 *  - `accentOutline` is the bordered accent variant used by deposit-form
 *    quick-amount buttons.
 *  - `danger` is the canonical destructive CTA.
 *  - Size scale stays at 8 / 10 / 11 (sm / lg / default) to avoid breaking
 *    callers that compose with adjacent inputs.
 */
describe("buttonVariants", () => {
	it("default and primary resolve to the canonical accent recipe", () => {
		const primary = buttonVariants({ variant: "primary" });
		const def = buttonVariants({ variant: "default" });
		for (const cls of [primary, def]) {
			expect(cls).toContain("bg-[#00ff87]");
			expect(cls).toContain("text-black");
			expect(cls).toContain("hover:bg-[#00ff87]/90");
		}
	});

	it("ghost variant uses transparent fill + white/10 ring", () => {
		const cls = buttonVariants({ variant: "ghost" });
		expect(cls).toContain("bg-transparent");
		expect(cls).toContain("border-white/10");
		expect(cls).toContain("hover:bg-white/5");
	});

	it("accentOutline variant has tinted accent border + green text", () => {
		const cls = buttonVariants({ variant: "accentOutline" });
		expect(cls).toContain("text-[#00ff87]");
		expect(cls).toContain("border-[#00ff87]/30");
	});

	it("danger variant ships the red CTA recipe", () => {
		const cls = buttonVariants({ variant: "danger" });
		expect(cls).toContain("bg-[#f87171]");
		expect(cls).toContain("text-black");
	});

	it("size scale stays at sm/h-8, default/h-11, lg/h-10", () => {
		expect(buttonVariants({ size: "sm" })).toContain("h-8");
		expect(buttonVariants({})).toContain("h-11");
		expect(buttonVariants({ size: "lg" })).toContain("h-10");
		expect(buttonVariants({ size: "icon" })).toContain("size-11");
	});

	it("base recipe applies the canonical rounded-sm radius", () => {
		expect(buttonVariants({})).toContain("rounded-sm");
	});

	it("legacy aliases (outline, secondary, glass, link, destructive) still resolve", () => {
		for (const variant of ["outline", "secondary", "glass", "link", "destructive"] as const) {
			expect(buttonVariants({ variant })).toBeTruthy();
		}
	});
});
