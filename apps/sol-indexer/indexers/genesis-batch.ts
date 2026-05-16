export interface SignatureSlotInfo {
	signature: string;
	slot?: number | null;
}

export interface GenesisSignatureSelection<T extends SignatureSlotInfo> {
	signatures: T[];
	reachedMinSlot: boolean;
	stoppedAtSlot?: number;
}

export function selectGenesisSignaturesToProcess<T extends SignatureSlotInfo>(
	signatures: T[],
	minSlot: number,
): GenesisSignatureSelection<T> {
	const stopIndex = signatures.findIndex((sig) => typeof sig.slot === "number" && sig.slot <= minSlot);
	if (stopIndex === -1) {
		return { signatures, reachedMinSlot: false };
	}

	const stoppedAtSlot = signatures[stopIndex]?.slot;

	return {
		signatures: signatures.slice(0, stopIndex),
		reachedMinSlot: true,
		stoppedAtSlot: typeof stoppedAtSlot === "number" ? stoppedAtSlot : undefined,
	};
}
