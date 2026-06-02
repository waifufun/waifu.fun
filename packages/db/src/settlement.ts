export const settlementModes = ["credits", "escrow", "auto"] as const;
export type SettlementMode = (typeof settlementModes)[number];

export const DEFAULT_SETTLEMENT_MODE: SettlementMode = "credits";

const SETTLEMENT_MODES = new Set<string>(settlementModes);

function metadataRecord(metadata: unknown): Record<string, unknown> | null {
	return metadata && typeof metadata === "object" && !Array.isArray(metadata)
		? (metadata as Record<string, unknown>)
		: null;
}

export function isSettlementMode(value: unknown): value is SettlementMode {
	return typeof value === "string" && SETTLEMENT_MODES.has(value);
}

/**
 * Reads the mini-app settlement manifest from app metadata.
 *
 * Source of truth is `metadata.settlementMode`, matching the frontend pill.
 * The legacy/request alias `settlement` is accepted while registering but rows
 * should be normalized to `settlementMode`. Missing or invalid metadata defaults
 * to today's off-chain Eliza Cloud credits path.
 */
export function getSettlementMode(metadata: unknown): SettlementMode {
	const record = metadataRecord(metadata);
	if (!record) return DEFAULT_SETTLEMENT_MODE;
	return isSettlementMode(record.settlementMode) ? record.settlementMode : DEFAULT_SETTLEMENT_MODE;
}

export function getEscrowThresholdUsd(metadata: unknown, defaultThresholdUsd = 1): number {
	const record = metadataRecord(metadata);
	const raw = record?.escrowThresholdUsd;
	const value = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(value) && value >= 0 ? value : defaultThresholdUsd;
}
