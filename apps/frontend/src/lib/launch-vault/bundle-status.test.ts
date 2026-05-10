import { describe, expect, it } from "vitest";

import { bundleStatusCopy, nextBundleStatus } from "./bundle-status";

describe("bundle status state machine", () => {
	it("moves through pending, confirmed, and error states uniformly", () => {
		expect(nextBundleStatus("idle", "sign")).toBe("signing");
		expect(nextBundleStatus("signing", "submit")).toBe("queued");
		expect(nextBundleStatus("queued", "submit")).toBe("pending");
		expect(nextBundleStatus("pending", "mined")).toBe("confirmed");
		expect(nextBundleStatus("pending", "fail")).toBe("error");
		expect(nextBundleStatus("error", "reset")).toBe("idle");
	});

	it("ignores impossible transitions", () => {
		expect(nextBundleStatus("confirmed", "submit")).toBe("confirmed");
		expect(nextBundleStatus("idle", "mined")).toBe("idle");
	});

	it("has stable user-facing copy for each state", () => {
		expect(bundleStatusCopy("pending")).toBe("transaction pending");
		expect(bundleStatusCopy("confirmed")).toBe("transaction confirmed");
		expect(bundleStatusCopy("error")).toBe("transaction failed");
	});
});
