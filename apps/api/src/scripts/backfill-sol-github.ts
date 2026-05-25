import { agentEvents, agentPersonas, getDatabase, renderEventData } from "@waifufun/db";
import { eq, or, sql } from "drizzle-orm";

const SOL_AGENT_UUID = "926f5fa8-aaa8-4ed2-9773-23833e467f4f";
const SOL_GITHUB_LOGIN = "0xSolace";
const BACKFILL_DAYS = 30;

type RepoConfig = { org: string; repo: string; label: string };

type CommitListItem = {
	sha?: string;
	html_url?: string;
	commit?: { message?: string; author?: { date?: string | null } | null; committer?: { date?: string | null } | null };
};

type CommitDetail = CommitListItem & {
	stats?: { additions?: number; deletions?: number };
	files?: Array<{ filename?: string }>;
};

type PullListItem = {
	number?: number;
	title?: string;
	html_url?: string;
	merged_at?: string | null;
	user?: { login?: string | null } | null;
};

type PullDetail = PullListItem & { additions?: number; deletions?: number };
type PullFile = { filename?: string };

const SOL_GITHUB_REPOS: RepoConfig[] = [
	{ org: "waifufun", repo: "waifu.fun", label: "waifu" },
	{ org: "steward-fi", repo: "steward", label: "steward" },
	{ org: "elizaos", repo: "eliza", label: "eliza-os" },
	{ org: "milady-ai", repo: "milady", label: "milady" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headers(): Record<string, string> {
	const token = process.env.GITHUB_TOKEN;
	return {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "waifufun-sol-github-backfill",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
}

async function gh<T>(url: string): Promise<T | null> {
	const res = await fetch(url, { headers: headers() });
	if (!res.ok) {
		console.warn(`github request failed ${res.status}: ${url}`);
		return null;
	}
	return (await res.json()) as T;
}

function firstLine(value: string): string {
	return value.split(/\r?\n/, 1)[0] ?? value;
}

function isElizaCloudActivity(messageOrTitle: string, filesChanged: string[] = []): boolean {
	const first = firstLine(messageOrTitle).trim();
	if (/^[a-z][a-z0-9-]*(?:\([^)]*cloud[^)]*\))!?:/i.test(first)) return true;
	return filesChanged.some(
		(file) =>
			file.startsWith("packages/cloud/") || file.startsWith("apps/eliza-cloud/") || file.startsWith("apps/cloud/"),
	);
}

function repoLabelForActivity(repo: RepoConfig, messageOrTitle: string, filesChanged: string[] = []): string {
	if (repo.org === "elizaos" && repo.repo === "eliza") {
		return isElizaCloudActivity(messageOrTitle, filesChanged) ? "eliza-cloud" : repo.label;
	}
	return repo.label;
}

function commitDate(commit: CommitListItem): Date {
	const iso = commit.commit?.author?.date ?? commit.commit?.committer?.date ?? null;
	const parsed = iso ? new Date(iso) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

async function main(): Promise<void> {
	const { db } = getDatabase();
	const [persona] = await db
		.select({
			id: agentPersonas.id,
			agentId: agentPersonas.agentId,
			tokenAddress: agentPersonas.tokenAddress,
			metadata: agentPersonas.metadata,
		})
		.from(agentPersonas)
		.where(or(eq(agentPersonas.id, SOL_AGENT_UUID), sql`lower(${agentPersonas.twitterHandle}) = '0xsolace_'`))
		.limit(1);

	if (!persona) throw new Error("Sol persona not found");
	const metadata = isRecord(persona.metadata) ? persona.metadata : {};
	await db
		.update(agentPersonas)
		.set({
			metadata: {
				...metadata,
				githubLogin: SOL_GITHUB_LOGIN,
				githubRepos: SOL_GITHUB_REPOS,
			},
			updatedAt: new Date(),
		})
		.where(eq(agentPersonas.id, persona.id));

	const since = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);
	const sample: string[] = [];

	for (const repo of SOL_GITHUB_REPOS) {
		const commitsUrl = new URL(`https://api.github.com/repos/${repo.org}/${repo.repo}/commits`);
		commitsUrl.searchParams.set("author", SOL_GITHUB_LOGIN);
		commitsUrl.searchParams.set("since", since.toISOString());
		commitsUrl.searchParams.set("per_page", "100");
		const commits = (await gh<CommitListItem[]>(commitsUrl.toString())) ?? [];
		for (const item of commits.sort((a, b) => commitDate(a).getTime() - commitDate(b).getTime())) {
			if (!item.sha) continue;
			const detail = ((await gh<CommitDetail>(
				`https://api.github.com/repos/${repo.org}/${repo.repo}/commits/${item.sha}`,
			)) ?? item) as CommitDetail;
			const message = detail.commit?.message ?? item.commit?.message ?? "commit";
			const filesChanged = (detail.files ?? [])
				.map((file) => file.filename)
				.filter((file): file is string => Boolean(file));
			const payload = {
				org: repo.org,
				repo: repo.repo,
				repoLabel: repoLabelForActivity(repo, message, filesChanged),
				sha: item.sha,
				message,
				url: detail.html_url ?? item.html_url ?? `https://github.com/${repo.org}/${repo.repo}/commit/${item.sha}`,
				additions: detail.stats?.additions ?? 0,
				deletions: detail.stats?.deletions ?? 0,
				filesChanged,
			};
			await db
				.insert(agentEvents)
				.values({
					agentId: persona.agentId,
					tokenAddress: persona.tokenAddress,
					eventType: "commit.pushed",
					data: renderEventData("commit.pushed", payload),
					payload,
					type: "commit.pushed",
					source: "github-listener-backfill",
					sourceEventId: `${repo.org}/${repo.repo}/${item.sha}`,
					occurredAt: commitDate(detail),
					status: "done",
					processedAt: new Date(),
				})
				.onConflictDoNothing({ target: [agentEvents.source, agentEvents.sourceEventId] });
			if (sample.length < 5) sample.push(JSON.stringify(renderEventData("commit.pushed", payload)));
		}

		const pullsUrl = new URL(`https://api.github.com/repos/${repo.org}/${repo.repo}/pulls`);
		pullsUrl.searchParams.set("state", "closed");
		pullsUrl.searchParams.set("sort", "updated");
		pullsUrl.searchParams.set("direction", "desc");
		pullsUrl.searchParams.set("per_page", "100");
		const pulls = (await gh<PullListItem[]>(pullsUrl.toString())) ?? [];
		const mergedPulls = pulls.filter(
			(pr) =>
				pr.merged_at &&
				new Date(pr.merged_at).getTime() >= since.getTime() &&
				pr.user?.login?.toLowerCase() === SOL_GITHUB_LOGIN.toLowerCase(),
		);
		for (const item of mergedPulls.sort(
			(a, b) => new Date(a.merged_at as string).getTime() - new Date(b.merged_at as string).getTime(),
		)) {
			if (typeof item.number !== "number") continue;
			const detail = ((await gh<PullDetail>(
				`https://api.github.com/repos/${repo.org}/${repo.repo}/pulls/${item.number}`,
			)) ?? item) as PullDetail;
			const files =
				(await gh<PullFile[]>(
					`https://api.github.com/repos/${repo.org}/${repo.repo}/pulls/${item.number}/files?per_page=100`,
				)) ?? [];
			const filesChanged = files.map((file) => file.filename).filter((file): file is string => Boolean(file));
			const title = detail.title ?? item.title ?? `PR #${item.number}`;
			const mergedAt = detail.merged_at ?? item.merged_at ?? new Date().toISOString();
			const payload = {
				org: repo.org,
				repo: repo.repo,
				repoLabel: repoLabelForActivity(repo, title, filesChanged),
				number: item.number,
				title,
				url: detail.html_url ?? item.html_url ?? `https://github.com/${repo.org}/${repo.repo}/pull/${item.number}`,
				mergedAt,
				additions: detail.additions ?? 0,
				deletions: detail.deletions ?? 0,
			};
			await db
				.insert(agentEvents)
				.values({
					agentId: persona.agentId,
					tokenAddress: persona.tokenAddress,
					eventType: "pr.merged",
					data: renderEventData("pr.merged", payload),
					payload,
					type: "pr.merged",
					source: "github-listener-backfill",
					sourceEventId: `${repo.org}/${repo.repo}/pr/${item.number}`,
					occurredAt: new Date(mergedAt),
					status: "done",
					processedAt: new Date(),
				})
				.onConflictDoNothing({ target: [agentEvents.source, agentEvents.sourceEventId] });
			if (sample.length < 5) sample.push(JSON.stringify(renderEventData("pr.merged", payload)));
		}
	}

	console.log(`backfilled Sol github events for ${SOL_GITHUB_REPOS.length} repos`);
	console.log("sample events:");
	for (const row of sample) console.log(row);
}

void main().catch((err) => {
	console.error(err);
	process.exit(1);
});
