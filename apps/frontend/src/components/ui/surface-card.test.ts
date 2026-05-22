import { describe, expect, it } from "vitest";

import { surfaceCardVariants } from "./surface-card-variants";

/**
 * The canonical card recipe is asserted at the variant level. We don't
 * render the component (vitest is configured with node env, no jsdom);
 * the cva-generated class string is the contract we care about.
 */
describe("surfaceCardVariants", () => {
	it("default variant uses the canonical recipe (white/10 border, #08080a fill, rounded-sm)", () => {
		const cls = surfaceCardVariants({});
		expect(cls).toContain("border-white/10");
		expect(cls).toContain("bg-[#08080a]");
		expect(cls).toContain("rounded-sm");
	});

	it("interactive variant adds accent hover ring + pointer cursor", () => {
		const cls = surfaceCardVariants({ variant: "interactive" });
		expect(cls).toContain("hover:border-[#00ff87]/30");
		expect(cls).toContain("hover:bg-[#0a0a0c]");
		expect(cls).toContain("cursor-pointer");
	});

	it("accent variant uses tinted accent border", () => {
		const cls = surfaceCardVariants({ variant: "accent" });
		expect(cls).toContain("border-[#00ff87]/30");
	});

	it("danger variant uses tinted red border", () => {
		const cls = surfaceCardVariants({ variant: "danger" });
		expect(cls).toContain("border-red-500/25");
	});

	it("padding scale exposes none/sm/md/lg with the documented values", () => {
		expect(surfaceCardVariants({ padding: "none" })).not.toContain(" p-");
		expect(surfaceCardVariants({ padding: "sm" })).toContain("p-3");
		expect(surfaceCardVariants({ padding: "md" })).toContain("p-4");
		expect(surfaceCardVariants({ padding: "lg" })).toContain("p-5");
	});

	it("nested tone darkens the fill one step (#0a0a0c)", () => {
		const cls = surfaceCardVariants({ tone: "nested" });
		expect(cls).toContain("bg-[#0a0a0c]");
	});

	it("panel tone uses the elevated #111114 fill", () => {
		const cls = surfaceCardVariants({ tone: "panel" });
		expect(cls).toContain("bg-[#111114]");
	});
});
