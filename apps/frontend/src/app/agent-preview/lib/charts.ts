/**
 * Lightweight chart helpers. Pure SVG, no recharts at runtime.
 * Static-export friendly.
 */

export function buildSparkline(values: number[], width = 200, height = 40): string {
	if (values.length < 2) return "";
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const step = width / (values.length - 1);
	return values
		.map((v, i) => {
			const x = (i * step).toFixed(2);
			const y = (height - ((v - min) / range) * height).toFixed(2);
			return `${i === 0 ? "M" : "L"}${x},${y}`;
		})
		.join(" ");
}

/**
 * Build a synthetic 75-day "ship cadence" series from real PR mergedAt timestamps.
 * Returns an array of { day, count } where day=0 is today, day=74 is 75 days ago.
 */
export function buildShipHeatmap(prTimestamps: string[], days = 75, nowMs?: number): { day: number; count: number }[] {
	const now = nowMs ?? Date.now();
	const buckets = new Array(days).fill(0).map((_, i) => ({ day: i, count: 0 }));
	for (const iso of prTimestamps) {
		const t = new Date(iso).getTime();
		const ago = Math.floor((now - t) / 86400000);
		if (ago >= 0 && ago < days) {
			const bucket = buckets[ago];
			if (bucket) bucket.count++;
		}
	}
	return buckets;
}

export function heatColor(count: number, max: number): string {
	if (count === 0) return "rgba(255, 255, 255, 0.04)";
	const intensity = Math.min(1, count / Math.max(max, 1));
	// amber scale
	const alpha = 0.15 + intensity * 0.7;
	return `rgba(245, 158, 11, ${alpha.toFixed(3)})`;
}
