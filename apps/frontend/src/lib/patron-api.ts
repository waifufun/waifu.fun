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

export async function fetchPatrons(tokenAddress: string, limit = 12): Promise<PatronList | null> {
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
