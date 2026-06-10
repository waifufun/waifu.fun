import type { ProvisioningStatusSnapshot } from "@/lib/api/agent-provision";
import { describe, expect, it, vi } from "vitest";

import { pollUntilProvisioned } from "./wizard-provision-poll";

function snapshot(partial: Partial<ProvisioningStatusSnapshot>): ProvisioningStatusSnapshot {
	return { cloudStatus: null, webUiUrl: null, ready: false, failed: false, ...partial };
}

describe("pollUntilProvisioned", () => {
	it("resolves 'ready' once the runtime reports a reachable URL, feeding live status labels", async () => {
		const statuses = [
			snapshot({ cloudStatus: "provisioning" }),
			snapshot({ cloudStatus: "pending" }),
			snapshot({ cloudStatus: "running", webUiUrl: "https://agent.example", ready: true }),
		];
		let call = 0;
		const labels: Array<string | null> = [];
		const outcome = await pollUntilProvisioned("agt_1", (l) => labels.push(l), {
			intervalMs: 0,
			sleep: async () => {},
			fetchStatus: async () => statuses[call++] ?? snapshot({}),
		});

		expect(outcome).toBe("ready");
		// One label per poll, lowercase terminal grammar.
		expect(labels).toEqual(["eliza cloud: provisioning", "eliza cloud: pending", "eliza cloud: running"]);
	});

	it("resolves 'failed' on a terminal failed status without polling further", async () => {
		let calls = 0;
		const outcome = await pollUntilProvisioned("agt_2", () => {}, {
			intervalMs: 0,
			sleep: async () => {},
			fetchStatus: async () => {
				calls++;
				return snapshot({ cloudStatus: "failed", failed: true });
			},
		});

		expect(outcome).toBe("failed");
		expect(calls).toBe(1);
	});

	it("resolves 'timeout' when the deadline elapses before readiness (never throws)", async () => {
		// Fake clock: jump past the deadline after the first poll.
		let t = 0;
		const outcome = await pollUntilProvisioned("agt_3", () => {}, {
			timeoutMs: 1_000,
			intervalMs: 10,
			now: () => t,
			sleep: async () => {
				t += 10_000;
			},
			fetchStatus: async () => snapshot({ cloudStatus: "pending" }),
		});

		expect(outcome).toBe("timeout");
	});

	it("labels an absent status as 'eliza cloud: provisioning' (honest, never blank)", async () => {
		// Clock: deadline check (0) lets one poll run, then jumps past the
		// deadline so the loop exits after that single iteration.
		let t = 0;
		const labels: Array<string | null> = [];
		await pollUntilProvisioned("agt_4", (l) => labels.push(l), {
			timeoutMs: 1_000,
			intervalMs: 0,
			now: () => t,
			sleep: async () => {
				t += 10_000;
			},
			fetchStatus: async () => snapshot({ cloudStatus: null }),
		});

		expect(labels[0]).toBe("eliza cloud: provisioning");
	});

	it("resolves 'aborted' immediately when the signal is already aborted (no fetch)", async () => {
		const controller = new AbortController();
		controller.abort();
		const fetchStatus = vi.fn(async () => snapshot({ cloudStatus: "pending" }));
		const labels: Array<string | null> = [];
		const outcome = await pollUntilProvisioned("agt_6", (l) => labels.push(l), {
			intervalMs: 0,
			sleep: async () => {},
			fetchStatus,
			signal: controller.signal,
		});

		expect(outcome).toBe("aborted");
		expect(fetchStatus).not.toHaveBeenCalled();
		expect(labels).toEqual([]);
	});

	it("stops the loop and resolves 'aborted' when the signal aborts mid-poll", async () => {
		const controller = new AbortController();
		let call = 0;
		const labels: Array<string | null> = [];
		// Abort during the inter-poll sleep after the first fetch. The loop must not
		// fetch again or push another label once aborted.
		const outcome = await pollUntilProvisioned("agt_7", (l) => labels.push(l), {
			intervalMs: 10,
			sleep: async () => {
				controller.abort();
			},
			fetchStatus: async () => {
				call++;
				return snapshot({ cloudStatus: "pending" });
			},
			signal: controller.signal,
		});

		expect(outcome).toBe("aborted");
		expect(call).toBe(1);
		// Only the single pre-abort label was emitted.
		expect(labels).toEqual(["eliza cloud: pending"]);
	});

	it("interrupts an in-flight sleep the moment the signal aborts (real-timer sleep)", async () => {
		const controller = new AbortController();
		// A long real-timer sleep would hang the test if abort did not short-circuit it.
		const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
		const promise = pollUntilProvisioned("agt_8", () => {}, {
			intervalMs: 60_000,
			sleep,
			fetchStatus: async () => snapshot({ cloudStatus: "pending" }),
			signal: controller.signal,
		});
		// Let the first fetch + sleep start, then abort. The aborting sleep resolves
		// without waiting the full 60s.
		await Promise.resolve();
		controller.abort();
		const outcome = await promise;
		expect(outcome).toBe("aborted");
	});

	it("keeps polling through transient null snapshots until ready", async () => {
		const statuses = [snapshot({}), snapshot({}), snapshot({ cloudStatus: "running", webUiUrl: "u", ready: true })];
		let call = 0;
		const fetchStatus = vi.fn(async () => statuses[call++] ?? snapshot({}));
		const outcome = await pollUntilProvisioned("agt_5", () => {}, {
			intervalMs: 0,
			sleep: async () => {},
			fetchStatus,
		});
		expect(outcome).toBe("ready");
		expect(fetchStatus).toHaveBeenCalledTimes(3);
	});
});
