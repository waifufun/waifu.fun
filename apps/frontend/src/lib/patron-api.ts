export type Patron = {
	xHandle: string;
	xAvatarUrl: string | null;
	patronSince: string; // ISO
};

export type PatronList = {
	total: number;
	patrons: Patron[];
};

export type PatronStatus = {
	isPatron: boolean;
	patronSince: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.waifu.fun";

// $DEMO (four.meme hackathon agent) doesn't have real patrons in the
// production DB. Hardcode @waifudotfun as the showcase patron so the
// public agent page doesn't render an empty 'patron data unavailable'
// state. Tracked as the canonical demo until live patrons start landing.
const DEMO_TOKEN_ADDRESS = "0xc05dde3f113a57260f1839abd3b5a0eac1314444";
const DEMO_PATRON_LIST: PatronList = {
	total: 1,
	patrons: [
		{
			xHandle: "waifudotfun",
			xAvatarUrl: "https://unavatar.io/twitter/waifudotfun",
			patronSince: "2026-04-20T09:38:09.215Z",
		},
	],
};

function isDemoAddress(addr: string): boolean {
	return addr.toLowerCase() === DEMO_TOKEN_ADDRESS.toLowerCase();
}

export async function fetchPatrons(tokenAddress: string, limit = 12): Promise<PatronList | null> {
	if (isDemoAddress(tokenAddress)) {
		return DEMO_PATRON_LIST;
	}
	try {
		const res = await fetch(`${API}/v2/agents/${tokenAddress}/patrons?limit=${limit}`);
		if (!res.ok) return null;
		const json = await res.json();
		return json?.data ?? null;
	} catch {
		return null;
	}
}

export async function fetchPatronStatus(tokenAddress: string): Promise<PatronStatus | null> {
	try {
		const res = await fetch(`${API}/v2/agents/${tokenAddress}/patron-status`, {
			credentials: "include",
		});
		if (!res.ok) return null;
		const json = await res.json();
		return json?.data ?? null;
	} catch {
		return null;
	}
}

export async function patronAgent(tokenAddress: string): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await fetch(`${API}/v2/agents/${tokenAddress}/patron`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		if (!res.ok) {
			const json = await res.json().catch(() => null);
			return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
	}
}
