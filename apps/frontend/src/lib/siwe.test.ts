import { describe, expect, it } from "vitest";

import { buildLaunchSiweMessage } from "./siwe";

describe("buildLaunchSiweMessage", () => {
	it("constructs the SIWE message used for launch authorization", () => {
		const message = buildLaunchSiweMessage({
			address: "0x0000000000000000000000000000000000000001",
			nonce: "nonce123",
			origin: "https://dev.waifu.fun",
			now: new Date("2026-05-09T12:00:00.000Z"),
		});

		expect(message).toContain("dev.waifu.fun wants you to sign in with your Ethereum account:");
		expect(message).toContain("0x0000000000000000000000000000000000000001");
		expect(message).toContain(
			"sign to confirm launch. waifu.fun will use this wallet as creator for the launch transaction.",
		);
		expect(message).toContain("URI: https://dev.waifu.fun/create/wizard");
		expect(message).toContain("Chain ID: 56");
		expect(message).toContain("Nonce: nonce123");
		expect(message).toContain("Issued At: 2026-05-09T12:00:00.000Z");
		expect(message).toContain("Expiration Time: 2026-05-09T12:05:00.000Z");
	});
});
