import { describe, expect, it } from "vitest";
import { buildLinkedEoaMessage, isAddressLinked } from "./use-linked-eoa";

describe("useLinkedEoa helpers", () => {
	it("supports the not connected case with an unlinked address", () => {
		expect(isAddressLinked(undefined, [])).toBe(false);
	});

	it("builds the SIWE message used before calling the link API", () => {
		const address = "0x1234567890123456789012345678901234567890";
		expect(buildLinkedEoaMessage(address)).toContain(address);
	});

	it("is idempotent for an already linked address", () => {
		const address = "0x1234567890123456789012345678901234567890";
		expect(isAddressLinked(address.toUpperCase(), [{ address }])).toBe(true);
	});
});
