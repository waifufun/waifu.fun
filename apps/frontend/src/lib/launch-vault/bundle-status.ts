export type BundleStatus = "idle" | "signing" | "queued" | "pending" | "confirmed" | "error";
export type BundleStatusEvent = "sign" | "submit" | "mined" | "fail" | "reset";

const TRANSITIONS: Record<BundleStatus, Partial<Record<BundleStatusEvent, BundleStatus>>> = {
	idle: { sign: "signing", submit: "queued", fail: "error", reset: "idle" },
	signing: { submit: "queued", fail: "error", reset: "idle" },
	queued: { submit: "pending", mined: "confirmed", fail: "error", reset: "idle" },
	pending: { mined: "confirmed", fail: "error", reset: "idle" },
	confirmed: { reset: "idle" },
	error: { sign: "signing", submit: "queued", reset: "idle" },
};

export function nextBundleStatus(status: BundleStatus, event: BundleStatusEvent): BundleStatus {
	return TRANSITIONS[status][event] ?? status;
}

export function bundleStatusCopy(status: BundleStatus): string {
	switch (status) {
		case "idle":
			return "ready";
		case "signing":
			return "waiting for signature";
		case "queued":
			return "transaction queued";
		case "pending":
			return "transaction pending";
		case "confirmed":
			return "transaction confirmed";
		case "error":
			return "transaction failed";
	}
}
