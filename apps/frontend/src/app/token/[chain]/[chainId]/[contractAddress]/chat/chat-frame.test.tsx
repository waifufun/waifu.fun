import { describe, expect, it } from "vitest";

import {
	HOSTED_CHAT_IFRAME_ALLOW,
	HOSTED_CHAT_IFRAME_REFERRER_POLICY,
	HOSTED_CHAT_IFRAME_SANDBOX,
} from "./chat-frame-policy";

describe("hosted token chat iframe policy", () => {
	it("allows the embedded Eliza app without leaking signed chat URLs as referrers", () => {
		expect(HOSTED_CHAT_IFRAME_ALLOW).toBe("clipboard-read; clipboard-write");
		expect(HOSTED_CHAT_IFRAME_REFERRER_POLICY).toBe("no-referrer");
		expect(HOSTED_CHAT_IFRAME_SANDBOX.split(" ").sort()).toEqual(
			[
				"allow-downloads",
				"allow-forms",
				"allow-popups",
				"allow-popups-to-escape-sandbox",
				"allow-same-origin",
				"allow-scripts",
			].sort(),
		);
	});
});
