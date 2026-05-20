/**
 * Token price formatting that handles sub-cent decimals gracefully.
 *
 * Examples:
 *   123.45      -> { display: "$123.45" }
 *   1.0234      -> { display: "$1.0234" }
 *   0.001028    -> { display: "$0.001028" }
 *   0.00001028  -> { display: "$0.0", subscript: 4, suffix: "1028" }  (dexscreener style)
 *   0           -> { display: "$0.00" }
 */

export type FormattedPrice = {
	display: string; // e.g. "$0.0"
	subscript: number | null; // number of leading zeros to render small
	suffix: string; // e.g. "1028"
	full: string; // full formatted string with subscript flattened, e.g. "$0.00001028"
};

export function formatTokenPrice(price: number): FormattedPrice {
	if (!Number.isFinite(price) || price <= 0) {
		return { display: "$0.00", subscript: null, suffix: "", full: "$0.00" };
	}

	if (price >= 1) {
		const s = price.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 4,
		});
		const out = `$${s}`;
		return { display: out, subscript: null, suffix: "", full: out };
	}

	// price < 1
	if (price >= 0.01) {
		const s = price.toFixed(4);
		const out = `$${s}`;
		return { display: out, subscript: null, suffix: "", full: out };
	}

	// price < 0.01: count leading zeros after the decimal point
	const str = price.toFixed(20).replace(/0+$/, "");
	const [, decRaw = ""] = str.split(".");
	// count zeros
	let zeros = 0;
	for (const ch of decRaw) {
		if (ch === "0") zeros++;
		else break;
	}
	const significant = decRaw.slice(zeros).slice(0, 4); // 4 sig figs
	if (zeros <= 1) {
		// e.g. 0.0428 → "$0.0428"
		const out = `$${price.toFixed(Math.min(8, zeros + 4))}`.replace(/0+$/, "");
		const cleaned = out.endsWith(".") ? `${out}0` : out;
		return { display: cleaned, subscript: null, suffix: "", full: cleaned };
	}

	// dexscreener / pump.fun convention: $0.0₃428 means "$0." then 3 zeros then 428
	return {
		display: "$0.0",
		subscript: zeros,
		suffix: significant,
		full: `$0.${"0".repeat(zeros)}${significant}`,
	};
}

export function formatPercent(pct: number): string {
	const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
	return `${sign}${pct.toFixed(2)}%`;
}

export function formatCompactUsd(usd: number): string {
	if (!Number.isFinite(usd)) return "$0";
	const abs = Math.abs(usd);
	if (abs >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `$${(usd / 1e3).toFixed(2)}K`;
	return `$${usd.toFixed(2)}`;
}

export function formatCompactNum(n: number): string {
	if (!Number.isFinite(n)) return "0";
	const abs = Math.abs(n);
	if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
	return n.toFixed(0);
}
