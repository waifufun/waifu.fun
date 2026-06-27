// Pure-TS async-provisioning poll loop, split out of wizard-client.tsx so vitest
// can import it without the React/jsx tree (vite here has no jsx transform — see
// wizard-constants.ts). Mirrors the wizard-provision-success.ts split pattern.

import { fetchProvisioningStatus } from "@/lib/api/agent-provision";
import { ASYNC_PROVISIONING_POLL_INTERVAL_MS, ASYNC_PROVISIONING_TIMEOUT_MS } from "./wizard-constants";

export type ProvisioningPollOutcome = "ready" | "failed" | "timeout" | "aborted";

/**
 * Poll the agent detail endpoint until the hosted runtime is ready, fails, the
 * timeout elapses, or the caller aborts. NEVER throws and NEVER fails the launch
 * — the token is already minted and the invite spent by the time we get here, so
 * a timeout just means "provisioning is still in flight, route to patron with a
 * banner".
 *
 * `onStatus` receives a lowercase, terminal-grammar label for the loader (e.g.
 * "eliza cloud: pending") on every poll so the UI shows live progress.
 *
 * Pass `options.signal` to stop the loop when the wizard unmounts: the poll can
 * run for up to ASYNC_PROVISIONING_TIMEOUT_MS (~10 min), so without an abort path
 * an unmounted wizard keeps fetching and keeps calling `onStatus` on a dead
 * component. On abort the loop bails as soon as possible (before the next fetch,
 * and immediately interrupting any in-flight sleep) and resolves to "aborted" —
 * the caller should treat that as "stop, don't touch component state".
 */
export async function pollUntilProvisioned(
	agentId: string,
	onStatus: (label: string | null) => void,
	options: {
		timeoutMs?: number;
		intervalMs?: number;
		now?: () => number;
		sleep?: (ms: number) => Promise<void>;
		fetchStatus?: typeof fetchProvisioningStatus;
		signal?: AbortSignal;
	} = {},
): Promise<ProvisioningPollOutcome> {
	const timeoutMs = options.timeoutMs ?? ASYNC_PROVISIONING_TIMEOUT_MS;
	const intervalMs = options.intervalMs ?? ASYNC_PROVISIONING_POLL_INTERVAL_MS;
	const now = options.now ?? (() => Date.now());
	const baseSleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const fetchStatus = options.fetchStatus ?? fetchProvisioningStatus;
	const signal = options.signal;

	// Sleep that resolves early the moment the signal aborts, so an unmount during
	// the inter-poll wait stops the loop within microtasks instead of after a full
	// interval. The injected `baseSleep` (tests) still drives the timing.
	const sleep = (ms: number): Promise<void> => {
		if (!signal) return baseSleep(ms);
		if (signal.aborted) return Promise.resolve();
		return new Promise<void>((resolve) => {
			const onAbort = () => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			};
			signal.addEventListener("abort", onAbort, { once: true });
			void baseSleep(ms).then(() => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			});
		});
	};

	const deadline = now() + timeoutMs;
	while (now() < deadline) {
		if (signal?.aborted) return "aborted";
		const snapshot = await fetchStatus(agentId);
		if (signal?.aborted) return "aborted";
		onStatus(snapshot.cloudStatus ? `eliza cloud: ${snapshot.cloudStatus.toLowerCase()}` : "eliza cloud: provisioning");
		if (snapshot.ready) return "ready";
		if (snapshot.failed) return "failed";
		await sleep(intervalMs);
		if (signal?.aborted) return "aborted";
	}
	return "timeout";
}
