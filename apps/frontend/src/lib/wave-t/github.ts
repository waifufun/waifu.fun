// fetch an agent's recent merged PRs at build time, scoped to the
// agent's OWN github identity (login + repos from persona metadata).
//
// there is NO hardcoded author and NO fallback PR list. if the agent has
// no github login/repos wired, this returns an empty summary so the
// activity feed renders an honest empty state instead of leaking another
// agent's work. the canonical live source is /v2/agents/:address/events
// (source=github); this build-time seed only ever reflects the requested
// agent's own repos.

export type ShipItem = {
	number: number;
	title: string;
	url: string;
	mergedAt: string; // iso
	additions?: number;
	deletions?: number;
};

export type ShipSummary = {
	totalMerged: number;
	first: string; // iso of first merged PR
	items: ShipItem[];
	// timestamps of up to 100 most-recent merged PRs (for heatmap)
	mergedTimestamps: string[];
};

const EMPTY: ShipSummary = {
	totalMerged: 0,
	first: "",
	items: [],
	mergedTimestamps: [],
};

/**
 * The github identity an agent ships under. Sourced from persona
 * metadata: `githubLogin` / `githubUsername` (the author) and
 * `githubRepos[]` (the repos it commits to). Both are optional; when
 * neither is present there is nothing to query and we return EMPTY.
 */
export type GithubScope = {
	/**
	 * github login the agent commits as, e.g. "0xSolace". REQUIRED for any
	 * PR fetch: PRs are always filtered by `author:<login>` so the feed
	 * only shows this agent's own work. no login => no ship log.
	 */
	login?: string | null;
	/**
	 * repos the agent ships to, in "owner/name" form. optional; when present
	 * they narrow the author search to these repos. an agent with a login
	 * but no declared repos gets a login-wide author search.
	 */
	repos?: string[];
};

type GhItem = {
	number: number;
	title: string;
	html_url: string;
	closed_at: string;
	pull_request?: { url: string };
};

// A github repo slug is exactly "owner/name", each segment limited to the
// chars github actually allows (alnum, dot, dash, underscore). Anything
// that does not match is rejected so malformed metadata cannot widen or
// alter the search query.
const REPO_SLUG_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
// github logins: alnum + single dashes, no leading/trailing dash.
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/**
 * Normalize a single persona `githubRepos[]` entry into an "owner/name"
 * slug. Entries may be plain strings ("waifufun/waifu.fun") or objects
 * carrying `{ org, name }` / `{ owner, repo }` / `{ fullName }`. Returns
 * null for anything that does not resolve to a valid "owner/name" slug.
 */
function repoSlug(entry: unknown): string | null {
	let candidate: string | null = null;
	if (typeof entry === "string") {
		candidate = entry.trim();
	} else if (entry && typeof entry === "object") {
		const o = entry as Record<string, unknown>;
		if (typeof o.fullName === "string" && o.fullName.includes("/")) {
			candidate = o.fullName.trim();
		} else {
			const org = typeof o.org === "string" ? o.org : typeof o.owner === "string" ? o.owner : null;
			const name = typeof o.name === "string" ? o.name : typeof o.repo === "string" ? o.repo : null;
			if (org && name) candidate = `${org.trim()}/${name.trim()}`;
		}
	}
	return candidate && REPO_SLUG_RE.test(candidate) ? candidate : null;
}

/**
 * Build a `GithubScope` from raw persona metadata. Reads `githubLogin`
 * (or legacy `githubUsername`) and `githubRepos[]`. Pure + defensive so
 * the page can hand it `agent.metadata` directly.
 */
export function githubScopeFromMetadata(metadata: Record<string, unknown> | null | undefined): GithubScope {
	if (!metadata) return {};
	const rawLogin =
		typeof metadata.githubLogin === "string"
			? metadata.githubLogin
			: typeof metadata.githubUsername === "string"
				? metadata.githubUsername
				: null;
	const trimmed = rawLogin?.trim() || "";
	const login = trimmed && LOGIN_RE.test(trimmed) ? trimmed : null;
	const reposRaw = Array.isArray(metadata.githubRepos) ? metadata.githubRepos : [];
	const repos = reposRaw.map(repoSlug).filter((s): s is string => Boolean(s));
	return { login, repos };
}

/**
 * Fetch the agent's recent merged PRs, scoped to its own github identity.
 *
 * AUTHOR IS REQUIRED. We always filter by `author:<login>` so the feed
 * only ever shows PRs THIS agent authored. A repo qualifier alone would
 * return every merged PR in the repo (including other agents'), which is
 * exactly the leak we are fixing, so a scope with repos but no login
 * returns EMPTY. Repos, when present, further narrow the author search to
 * the agent's declared repos.
 *
 * Query construction:
 *   - login + repos → `author:<login> repo:a/b repo:c/d is:pr is:merged`.
 *   - login only    → `author:<login> is:pr is:merged`.
 *   - no login      → return EMPTY (honest empty, never another agent's PRs).
 *
 * Any network / parse failure returns EMPTY, never a hardcoded list.
 */
export async function fetchShipLog(scope: GithubScope): Promise<ShipSummary> {
	const login = scope.login?.trim() || "";
	const repos = (scope.repos ?? []).filter((r) => REPO_SLUG_RE.test(r));

	// Author is mandatory. Without a login we cannot attribute PRs to this
	// agent, so we show nothing rather than risk surfacing another agent's
	// work via a repo-wide search.
	if (!login || !LOGIN_RE.test(login)) return EMPTY;

	const qualifiers: string[] = [`author:${login}`];
	for (const repo of repos) qualifiers.push(`repo:${repo}`);
	qualifiers.push("is:pr", "is:merged");
	const q = qualifiers.join(" ");

	try {
		const params = new URLSearchParams({
			q,
			sort: "updated",
			order: "desc",
			per_page: "10",
		});
		const url = `https://api.github.com/search/issues?${params.toString()}`;
		const r = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			next: { revalidate: 600 },
		});
		if (!r.ok) return EMPTY;
		const data = (await r.json()) as {
			total_count: number;
			items: GhItem[];
		};
		const items: ShipItem[] = data.items.map((it) => ({
			number: it.number,
			title: it.title,
			url: it.html_url,
			mergedAt: it.closed_at,
		}));
		const timestamps = data.items.map((it) => it.closed_at).filter(Boolean);
		return {
			totalMerged: data.total_count,
			first: timestamps.length > 0 ? (timestamps[timestamps.length - 1] ?? "") : "",
			items,
			mergedTimestamps: timestamps,
		};
	} catch {
		return EMPTY;
	}
}

export function relativeTime(iso: string, nowMs?: number): string {
	const t = new Date(iso).getTime();
	const now = nowMs ?? Date.now();
	const s = Math.floor((now - t) / 1000);
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	const d = Math.floor(s / 86400);
	if (d < 30) return `${d}d ago`;
	if (d < 365) return `${Math.floor(d / 30)}mo ago`;
	return `${Math.floor(d / 365)}y ago`;
}

export function daysOperating(firstIso: string, nowMs?: number): number {
	const t = new Date(firstIso).getTime();
	const now = nowMs ?? Date.now();
	return Math.max(1, Math.floor((now - t) / 86400000));
}
