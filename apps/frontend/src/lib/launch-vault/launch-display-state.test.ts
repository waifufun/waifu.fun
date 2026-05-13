import { describe, expect, it } from "vitest";

import { VaultState } from "./abi";
import {
	deriveLaunchDisplayState,
	displayStateHeadline,
	displayStateLabel,
	displayStateTone,
} from "./launch-display-state";

const FUTURE = 9_999_999_999;
const PAST = 1;
const NOW = 1_700_000_000;

describe("deriveLaunchDisplayState", () => {
	it("returns created when nothing is known yet", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: null,
				backendStatus: "provisioned",
				closeTimestamp: null,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("created");
	});

	it("returns presale when vault is OPEN and close is in the future", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: VaultState.OPEN,
				backendStatus: "queued",
				closeTimestamp: FUTURE,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("presale");
	});

	it("returns closed when vault still says OPEN but the timer elapsed", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: VaultState.OPEN,
				backendStatus: "queued",
				closeTimestamp: PAST,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("closed");
	});

	it("returns bundling when vault is CLOSED", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: VaultState.CLOSED,
				backendStatus: "launching",
				closeTimestamp: PAST,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("bundling");
	});

	it("returns bundling when backend says launching even if vault state isn't loaded", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: null,
				backendStatus: "launching",
				closeTimestamp: PAST,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("bundling");
	});

	it("returns launched when vault is LAUNCHED even if backend is laggy", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: VaultState.LAUNCHED,
				backendStatus: "queued",
				closeTimestamp: PAST,
				tokenAddress: "0xabcabcabcabcabcabcabcabcabcabcabcabcabcd",
				nowSeconds: NOW,
			}),
		).toBe("launched");
	});

	it("returns launched when backend says live and token address is known", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: null,
				backendStatus: "live",
				closeTimestamp: PAST,
				tokenAddress: "0xabcabcabcabcabcabcabcabcabcabcabcabcabcd",
				nowSeconds: NOW,
			}),
		).toBe("launched");
	});

	it("returns refunding when backend says failed", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: VaultState.CLOSED,
				backendStatus: "failed",
				closeTimestamp: PAST,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("refunding");
	});

	it("falls back to created when vault state is unknown and no close timer is set", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: null,
				backendStatus: "draft",
				closeTimestamp: null,
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("created");
	});

	it("handles bigint close timestamps without crashing", () => {
		expect(
			deriveLaunchDisplayState({
				vaultState: VaultState.OPEN,
				backendStatus: "queued",
				closeTimestamp: BigInt(FUTURE),
				tokenAddress: null,
				nowSeconds: NOW,
			}),
		).toBe("presale");
	});
});

describe("display state copy helpers", () => {
	it("returns a stable headline for each state", () => {
		expect(displayStateHeadline("created")).toMatch(/provisioned/);
		expect(displayStateHeadline("presale")).toMatch(/deposit/);
		expect(displayStateHeadline("closed")).toMatch(/preparing/);
		expect(displayStateHeadline("bundling")).toMatch(/puissant/);
		expect(displayStateHeadline("launched")).toMatch(/pcs v2/);
		expect(displayStateHeadline("refunding")).toMatch(/refund/);
	});

	it("returns short labels for each state", () => {
		expect(displayStateLabel("presale")).toBe("live");
		expect(displayStateLabel("launched")).toBe("launched");
	});

	it("maps states to tone classes", () => {
		expect(displayStateTone("presale")).toBe("accent");
		expect(displayStateTone("launched")).toBe("info");
		expect(displayStateTone("refunding")).toBe("danger");
		expect(displayStateTone("bundling")).toBe("warn");
	});
});
