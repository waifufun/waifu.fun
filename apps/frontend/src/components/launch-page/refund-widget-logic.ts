/**
 * Pure helpers extracted from `refund-widget.tsx` so they can be unit-tested
 * without spinning up a DOM or wagmi mocks. The widget itself is covered by
 * the playwright e2e in `tests/e2e/refund-flow.spec.ts`.
 */

/**
 * Pro-rata share of the vault bonus pool returned to a refunder, mirroring
 * the on-chain math in `LaunchVault.refund()`:
 *
 *   bonus = (principal == totalDeposited)
 *     ? bonusPool
 *     : (bonusPool * principal) / totalDeposited;
 */
export function computeBonusShare(principal: bigint, totalDeposited: bigint, bonusPool: bigint | null): bigint {
	if (!bonusPool || bonusPool === 0n) return 0n;
	if (principal === 0n) return 0n;
	if (totalDeposited === 0n) return 0n;
	if (principal === totalDeposited) return bonusPool;
	return (bonusPool * principal) / totalDeposited;
}

/**
 * Total refund a depositor receives: principal + bonus share.
 */
export function computeRefundAmount(principal: bigint, totalDeposited: bigint, bonusPool: bigint | null): bigint {
	return principal + computeBonusShare(principal, totalDeposited, bonusPool);
}

/**
 * Normalize wagmi / viem write errors into a single short line suitable for
 * the widget's inline error slot. Keep the surface small: user rejection,
 * the two on-chain reverts we care about, and a generic fallback.
 */
export function normalizeRefundError(err: unknown): string {
	if (!err) return "refund failed.";
	const raw = err instanceof Error ? err.message : String(err);
	if (/user rejected|denied/i.test(raw)) return "you rejected the transaction.";
	if (/NoDeposit/i.test(raw)) return "no deposit recorded for this address.";
	if (/InvalidState/i.test(raw)) return "vault is no longer in refund state.";
	const firstLine = raw.split("\n")[0]?.trim();
	if (firstLine && firstLine.length < 160) return firstLine;
	return "refund failed. try again.";
}
