import { describe, expect, it } from "bun:test";

import { type NavHistoryPoint, selectPnlSeries } from "./pnl";

describe("selectPnlSeries", () => {
	it("returns empty on null/undefined", () => {
		expect(selectPnlSeries(null)).toEqual([]);
		expect(selectPnlSeries(undefined)).toEqual([]);
	});

	it("returns empty on empty array", () => {
		expect(selectPnlSeries([])).toEqual([]);
	});

	it("returns empty when only one point is present (cannot delta)", () => {
		const pts: NavHistoryPoint[] = [{ t: "2026-05-22T00:00:00Z", nav: 1000 }];
		expect(selectPnlSeries(pts)).toEqual([]);
	});

	it("computes deltas relative to the first point", () => {
		const pts: NavHistoryPoint[] = [
			{ t: "2026-05-22T00:00:00Z", nav: 1000 },
			{ t: "2026-05-23T00:00:00Z", nav: 1050 },
			{ t: "2026-05-24T00:00:00Z", nav: 980 },
		];
		const series = selectPnlSeries(pts);
		expect(series.length).toBe(3);
		expect(series[0]?.pnl).toBe(0);
		expect(series[1]?.pnl).toBe(50);
		expect(series[2]?.pnl).toBe(-20);
	});

	it("drops non-finite values", () => {
		const pts: NavHistoryPoint[] = [
			{ t: "2026-05-22T00:00:00Z", nav: 1000 },
			{ t: "not-a-date", nav: 1050 },
			{ t: "2026-05-24T00:00:00Z", nav: Number.NaN },
			{ t: "2026-05-25T00:00:00Z", nav: 1100 },
		];
		const series = selectPnlSeries(pts);
		expect(series.length).toBe(2);
		expect(series[0]?.pnl).toBe(0);
		expect(series[1]?.pnl).toBe(100);
	});
});
