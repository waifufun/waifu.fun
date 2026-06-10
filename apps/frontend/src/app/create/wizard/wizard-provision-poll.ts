// Pure-TS async-provisioning poll loop, split out of wizard-client.tsx so vitest
// can import it without the React/jsx tree (vite here has no jsx transform — see
// wizard-constants.ts). Mirrors the wizard-provision-success.ts split pattern.

import { fetchProvisioningStatus } from "@/lib/api/agent-provision";
import { ASYNC_PROVISIONING_POLL_INTERVAL_MS, ASYNC_PROVISIONING_TIMEOUT_MS } from "./wizard-constants";

export type ProvisioningPollOutcome = "ready" | "failed" | "timeout";

/**
 * Poll the agent detail endpoint until the hosted runtime is ready, fails, or
 * the timeout elapses. NEVER throws and NEVER fails the launch — the token is
 * already minted and the invite spent by the time we get here, so a timeout
 * just means "provisioning is still in flight, route to patron with a banner".
 *
 * `onStatus` receives a lowercase, terminal-grammar label for the loader (e.g.
 * "eliza cloud: pending") on every poll so the UI shows live progress.
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
	} = {},
): Promise<ProvisioningPollOutcome> {
	const timeoutMs = options.timeoutMs ?? ASYNC_PROVISIONING_TIMEOUT_MS;
	const intervalMs = options.intervalMs ?? ASYNC_PROVISIONING_POLL_INTERVAL_MS;
	const now = options.now ?? (() => Date.now());
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const fetchStatus = options.fetchStatus ?? fetchProvisioningStatus;

	const deadline = now() + timeoutMs;
	while (now() < deadline) {
		const snapshot = await fetchStatus(agentId);
		onStatus(snapshot.cloudStatus ? `eliza cloud: ${snapshot.cloudStatus.toLowerCase()}` : "eliza cloud: provisioning");
		if (snapshot.ready) return "ready";
		if (snapshot.failed) return "failed";
		await sleep(intervalMs);
	}
	return "timeout";
}
