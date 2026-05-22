import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectGenesisSignaturesToProcess } from "../indexers/genesis-batch";

describe("selectGenesisSignaturesToProcess", () => {
	it("keeps newer signatures when a newest-to-oldest batch crosses the genesis min slot", () => {
		const batch = [
			{ signature: "newest", slot: 105 },
			{ signature: "newer", slot: 104 },
			{ signature: "boundary", slot: 100 },
			{ signature: "older", slot: 99 },
		];

		const selection = selectGenesisSignaturesToProcess(batch, 100);

		assert.equal(selection.reachedMinSlot, true);
		assert.equal(selection.stoppedAtSlot, 100);
		assert.deepEqual(
			selection.signatures.map((sig) => sig.signature),
			["newest", "newer"],
		);
	});

	it("leaves an all-newer batch untouched", () => {
		const batch = [
			{ signature: "a", slot: 105 },
			{ signature: "b", slot: 104 },
		];

		const selection = selectGenesisSignaturesToProcess(batch, 100);

		assert.equal(selection.reachedMinSlot, false);
		assert.equal(selection.stoppedAtSlot, undefined);
		assert.equal(selection.signatures, batch);
	});
});
