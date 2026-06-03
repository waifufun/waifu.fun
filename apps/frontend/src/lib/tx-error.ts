/**
 * Normalize a wagmi/viem write or receipt error into a single short line for a
 * widget's inline error slot — wallet rejection, the common insufficient-funds
 * case, else the first line of the raw message. Generic counterpart to
 * `refund-widget-logic.normalizeRefundError` for the deposit/withdraw/claim
 * widgets, which previously surfaced nothing on a failed transaction.
 */
export function normalizeTxError(err: unknown, fallback = "transaction failed. try again."): string {
	if (!err) return fallback;
	const raw = err instanceof Error ? err.message : String(err);
	if (/user rejected|user denied|\bdenied\b/i.test(raw)) return "you rejected the transaction.";
	if (/insufficient funds/i.test(raw)) return "insufficient bnb for the amount plus gas.";
	const firstLine = raw.split("\n")[0]?.trim();
	if (firstLine && firstLine.length > 0 && firstLine.length < 160) return firstLine;
	return fallback;
}
