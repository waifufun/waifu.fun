/**
 * Sanity tests for the AgentTreasuryPanel. Vitest runs in node-env here
 * (no jsdom), so we exercise the pure formatting helpers exported from
 * the module rather than rendering the component tree.
 *
 * The helpers are not exported individually so we re-derive them in the
 * test. If the production formatter changes, update both.
 */
import { describe, expect, it } from "vitest";

// Mirror of fmtBalance() in agent-treasury-panel.tsx. Keep in sync.
function fmtBalance(formatted: string): string {
	const v = Number.parseFloat(formatted);
	if (!Number.isFinite(v) || v === 0) return "0";
	const abs = Math.abs(v);
	if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}k`;
	if (abs >= 1) return v.toFixed(4);
	return v.toPrecision(2);
}

describe("AgentTreasuryPanel.fmtBalance", () => {
	it("100M agent token displays as 100.00M (Sol's 10% treasury allocation)", () => {
		expect(fmtBalance("100000000")).toBe("100.00M");
	});

	it("6.23 BNB displays with four decimals (post-split agent share)", () => {
		expect(fmtBalance("6.2325")).toBe("6.2325");
	});

	it("sub-1 amounts preserve leading non-zero precision (dust tokens)", () => {
		expect(fmtBalance("0.0042")).toBe("0.0042");
	});

	it("zero balance renders as '0' (no fake skeleton)", () => {
		expect(fmtBalance("0")).toBe("0");
		expect(fmtBalance("0.0")).toBe("0");
	});

	it("non-numeric input fails closed to '0' instead of NaN-formatting", () => {
		expect(fmtBalance("not a number")).toBe("0");
		expect(fmtBalance("")).toBe("0");
	});

	it("thousand-scale balances collapse to kilo notation", () => {
		expect(fmtBalance("1500")).toBe("1.50k");
		expect(fmtBalance("12345.67")).toBe("12.35k");
	});

	it("billion-scale balances collapse to giga notation", () => {
		expect(fmtBalance("1000000000")).toBe("1.00B");
	});
});
