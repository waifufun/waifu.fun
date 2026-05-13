import { describe, expect, it } from "vitest";

import {
	type VanityState,
	bscscanTokenUrl,
	flapTokenUrl,
	formatVanityAddress,
	hasVanitySuffix,
	nextVanityState,
	pancakeSwapUrl,
} from "./vanity-address";

const REAL = "0x1234567890abcdef1234567890abcdef12347777";
const NON_VANITY = "0x1234567890abcdef1234567890abcdef12340000";

describe("nextVanityState", () => {
	it("returns idle before submission", () => {
		expect(nextVanityState({ kind: "idle" }, null, false)).toEqual({ kind: "idle" });
		expect(nextVanityState({ kind: "idle" }, REAL, false)).toEqual({ kind: "idle" });
	});

	it("returns mining when submitted but no predicted address yet", () => {
		expect(nextVanityState({ kind: "idle" }, null, true)).toEqual({ kind: "mining" });
		expect(nextVanityState({ kind: "idle" }, undefined, true)).toEqual({ kind: "mining" });
		expect(nextVanityState({ kind: "idle" }, "", true)).toEqual({ kind: "mining" });
	});

	it("returns error on a malformed address from the backend", () => {
		const r = nextVanityState({ kind: "mining" }, "not-an-address", true);
		expect(r.kind).toBe("error");
	});

	it("returns ready when the backend lands a real address", () => {
		const r = nextVanityState({ kind: "mining" }, REAL, true);
		expect(r).toEqual({ kind: "ready", address: REAL });
	});

	it("preserves identity when ready and the address didn't change", () => {
		const prev: VanityState = { kind: "ready", address: REAL };
		expect(nextVanityState(prev, REAL.toUpperCase(), true)).toBe(prev);
	});

	it("still surfaces ready when suffix doesn't match (defense-in-depth)", () => {
		const r = nextVanityState({ kind: "mining" }, NON_VANITY, true);
		expect(r.kind).toBe("ready");
		expect((r as { address: string }).address).toBe(NON_VANITY);
	});
});

describe("formatVanityAddress", () => {
	it("placeholders when no address is known", () => {
		expect(formatVanityAddress(null)).toBe("0x…7777");
		expect(formatVanityAddress(undefined)).toBe("0x…7777");
		expect(formatVanityAddress("nope")).toBe("0x…7777");
	});
	it("truncates real addresses with prefix and 4-char suffix", () => {
		expect(formatVanityAddress(REAL)).toBe("0x1234…7777");
	});
});

describe("hasVanitySuffix", () => {
	it("matches the 7777 suffix", () => {
		expect(hasVanitySuffix(REAL)).toBe(true);
	});
	it("rejects non-vanity addresses", () => {
		expect(hasVanitySuffix(NON_VANITY)).toBe(false);
		expect(hasVanitySuffix("0x")).toBe(false);
		expect(hasVanitySuffix(null)).toBe(false);
	});
});

describe("explorer urls", () => {
	it("builds bscscan + flap + pancake links from a real address", () => {
		expect(bscscanTokenUrl(REAL)).toBe(`https://bscscan.com/token/${REAL}`);
		expect(flapTokenUrl(REAL)).toBe(`https://flap.sh/token/${REAL}`);
		expect(pancakeSwapUrl(REAL)).toBe(`https://pancakeswap.finance/swap?outputCurrency=${REAL}`);
	});
	it("returns null when no real address yet", () => {
		expect(bscscanTokenUrl(null)).toBeNull();
		expect(flapTokenUrl(null)).toBeNull();
		expect(pancakeSwapUrl("garbage")).toBeNull();
	});
});
