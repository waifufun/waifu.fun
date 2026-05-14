/**
 * Pure helper for the launch countdown timer.
 *   >= 1h: "2d 4h 17m" (with days when applicable) or "4h 17m"
 *   < 1h:  "47m 23s"
 *   <= 0 / non-finite: "closed"
 *
 * Extracted from `launch-countdown.tsx` so the formatting logic can be
 * unit-tested without rendering the component (vitest runs in node env).
 */
export function formatRemainingHumanized(remainingMs: number): string {
	if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "closed";
	const totalSec = Math.floor(remainingMs / 1000);
	const days = Math.floor(totalSec / 86400);
	const hours = Math.floor((totalSec % 86400) / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	const seconds = totalSec % 60;
	const totalHours = days * 24 + hours;
	if (totalHours >= 1) {
		return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
	}
	return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
