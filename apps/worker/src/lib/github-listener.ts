import { and, eq, sql } from "drizzle-orm";

import { agentEvents, agentPersonas, renderEventData } from "@waifufun/db";

import type { WorkerContext } from "./types.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_INITIAL_LOOKBACK_HOURS = 24;
const ACTIVE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const QUIET_POLL_INTERVAL_MS = 30 * 60 * 1000;
const SOL_GITHUB_LOGIN = "0xSolace";
const MDT_TIME_ZONE = "America/Denver";

export type GitHubRepoConfig = {
	org: string;
	repo: string;
	label: string;
};

type PersonaMetadata = Record<string, unknown> & {
	githubRepos?: unknown;
	githubLogin?: unknown;
	githubUsername?: unknown;
	githubLastChecks?: unknown;
};

type PersonaTarget = {
	id: string;
	agentId: string;
	tokenAddress: string | null;
	metadata: PersonaMetadata;
	githubLogin: string;
	repos: GitHubRepoConfig[];
	lastChecks: Record<string, string>;
};

type GitHubCommitListItem = {
	sha?: string;
	html_url?: string;
	commit?: {
		message?: string;
		author?: { date?: string | null } | null;
		committer?: { date?: string | null } | null;
	};
};

type GitHubCommitDetail = GitHubCommitListItem & {
	stats?: { additions?: number; deletions?: number };
	files?: Array<{ filename?: string }>;
};

type GitHubPullListItem = {
	number?: number;
	title?: string;
	html_url?: string;
	merged_at?: string | null;
	updated_at?: string | null;
	user?: { login?: string | null } | null;
};

type GitHubPullDetail = GitHubPullListItem & {
	additions?: number;
	deletions?: number;
};

type GitHubPullFile = { filename?: string };

export interface GitHubListenerOptions {
	fetch?: typeof fetch;
	baseUrl?: string;
	token?: string;
	now?: () => Date;
	initialLookbackHours?: number;
}

interface ListenerHandle {
	stop: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repoKey(repo: GitHubRepoConfig): string {
	return `${repo.org}/${repo.repo}`;
}

function normalizeRepoConfig(value: unknown): GitHubRepoConfig | null {
	if (!isRecord(value)) return null;
	const org = typeof value.org === "string" ? value.org.trim() : "";
	const repo = typeof value.repo === "string" ? value.repo.trim() : "";
	const label = typeof value.label === "string" ? value.label.trim() : "";
	if (!org || !repo || !label) return null;
	return { org, repo, label };
}

function githubLoginFromMetadata(agentId: string, metadata: PersonaMetadata): string | null {
	if (typeof metadata.githubLogin === "string" && metadata.githubLogin.trim()) return metadata.githubLogin.trim();
	if (typeof metadata.githubUsername === "string" && metadata.githubUsername.trim())
		return metadata.githubUsername.trim();
	if (agentId.toLowerCase() === "sol") return SOL_GITHUB_LOGIN;
	return null;
}

function lastChecksFromMetadata(metadata: PersonaMetadata): Record<string, string> {
	if (!isRecord(metadata.githubLastChecks)) return {};
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(metadata.githubLastChecks)) {
		if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) out[key] = value;
	}
	return out;
}

async function listPersonaTargets(context: WorkerContext): Promise<PersonaTarget[]> {
	const rows = await context.db
		.select({
			id: agentPersonas.id,
			agentId: agentPersonas.agentId,
			tokenAddress: agentPersonas.tokenAddress,
			metadata: agentPersonas.metadata,
		})
		.from(agentPersonas)
		.where(sql`jsonb_typeof(${agentPersonas.metadata}->'githubRepos') = 'array'`);

	const targets: PersonaTarget[] = [];
	for (const row of rows) {
		const metadata = isRecord(row.metadata) ? (row.metadata as PersonaMetadata) : {};
		const repos = Array.isArray(metadata.githubRepos)
			? metadata.githubRepos.map(normalizeRepoConfig).filter((repo): repo is GitHubRepoConfig => repo !== null)
			: [];
		if (repos.length === 0) continue;
		const githubLogin = githubLoginFromMetadata(row.agentId, metadata);
		if (!githubLogin) {
			context.logger.warn({ agentId: row.agentId }, "github-listener target missing githubLogin metadata");
			continue;
		}
		targets.push({
			id: row.id,
			agentId: row.agentId,
			tokenAddress: row.tokenAddress,
			metadata,
			githubLogin,
			repos,
			lastChecks: lastChecksFromMetadata(metadata),
		});
	}
	return targets;
}

function requestHeaders(token?: string): Record<string, string> {
	return {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "waifufun-github-listener",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
}

async function githubGet<T>(url: string, options: GitHubListenerOptions): Promise<T | null> {
	const fetchImpl = options.fetch ?? fetch;
	const res = await fetchImpl(url, { headers: requestHeaders(options.token ?? process.env.GITHUB_TOKEN) });
	if (!res.ok) return null;
	return (await res.json()) as T;
}

function firstLine(value: string): string {
	return value.split(/\r?\n/, 1)[0] ?? value;
}

export function isElizaCloudActivity(messageOrTitle: string, filesChanged: string[] = []): boolean {
	const first = firstLine(messageOrTitle).trim();
	if (/^[a-z][a-z0-9-]*(?:\([^)]*cloud[^)]*\))!?:/i.test(first)) return true;
	return filesChanged.some(
		(file) =>
			file.startsWith("packages/cloud/") || file.startsWith("apps/eliza-cloud/") || file.startsWith("apps/cloud/"),
	);
}

export function repoLabelForActivity(
	repo: GitHubRepoConfig,
	messageOrTitle: string,
	filesChanged: string[] = [],
): string {
	if (repo.org.toLowerCase() === "elizaos" && repo.repo.toLowerCase() === "eliza") {
		return isElizaCloudActivity(messageOrTitle, filesChanged) ? "eliza-cloud" : repo.label;
	}
	return repo.label;
}

function activePollInterval(now: Date): number {
	const hour = Number(
		new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: MDT_TIME_ZONE }).format(now),
	);
	return hour >= 8 && hour < 23 ? ACTIVE_POLL_INTERVAL_MS : QUIET_POLL_INTERVAL_MS;
}

function eventDateFromCommit(commit: GitHubCommitDetail | GitHubCommitListItem): Date {
	const iso = commit.commit?.author?.date ?? commit.commit?.committer?.date ?? null;
	const parsed = iso ? new Date(iso) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

async function insertGithubEvent(
	context: WorkerContext,
	params: {
		agentId: string;
		tokenAddress: string | null;
		eventType: "commit.pushed" | "pr.merged";
		payload: Record<string, unknown>;
		sourceEventId: string;
		occurredAt: Date;
		source: string;
	},
): Promise<void> {
	await context.db
		.insert(agentEvents)
		.values({
			agentId: params.agentId,
			tokenAddress: params.tokenAddress,
			eventType: params.eventType,
			data: renderEventData(params.eventType, params.payload),
			payload: params.payload,
			type: params.eventType,
			source: params.source,
			sourceEventId: params.sourceEventId,
			occurredAt: params.occurredAt,
			status: "done",
			processedAt: new Date(),
		})
		.onConflictDoNothing({ target: [agentEvents.source, agentEvents.sourceEventId] });
}

async function processCommits(
	context: WorkerContext,
	target: PersonaTarget,
	repo: GitHubRepoConfig,
	since: Date,
	options: GitHubListenerOptions,
): Promise<void> {
	const baseUrl = options.baseUrl ?? GITHUB_API_BASE_URL;
	const commitsUrl = new URL(`${baseUrl}/repos/${repo.org}/${repo.repo}/commits`);
	commitsUrl.searchParams.set("author", target.githubLogin);
	commitsUrl.searchParams.set("since", since.toISOString());
	commitsUrl.searchParams.set("per_page", "100");
	const commits = await githubGet<GitHubCommitListItem[]>(commitsUrl.toString(), options);
	if (!Array.isArray(commits)) return;

	const sorted = [...commits].sort((a, b) => eventDateFromCommit(a).getTime() - eventDateFromCommit(b).getTime());
	for (const item of sorted) {
		if (!item.sha) continue;
		const detail = ((await githubGet<GitHubCommitDetail>(
			`${baseUrl}/repos/${repo.org}/${repo.repo}/commits/${item.sha}`,
			options,
		)) ?? item) as GitHubCommitDetail;
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
		await insertGithubEvent(context, {
			agentId: target.agentId,
			tokenAddress: target.tokenAddress,
			eventType: "commit.pushed",
			payload,
			source: "github-listener",
			sourceEventId: `${repo.org}/${repo.repo}/${item.sha}`,
			occurredAt: eventDateFromCommit(detail),
		});
	}
}

async function processMergedPulls(
	context: WorkerContext,
	target: PersonaTarget,
	repo: GitHubRepoConfig,
	since: Date,
	options: GitHubListenerOptions,
): Promise<void> {
	const baseUrl = options.baseUrl ?? GITHUB_API_BASE_URL;
	const pullsUrl = new URL(`${baseUrl}/repos/${repo.org}/${repo.repo}/pulls`);
	pullsUrl.searchParams.set("state", "closed");
	pullsUrl.searchParams.set("sort", "updated");
	pullsUrl.searchParams.set("direction", "desc");
	pullsUrl.searchParams.set("per_page", "100");
	const pulls = await githubGet<GitHubPullListItem[]>(pullsUrl.toString(), options);
	if (!Array.isArray(pulls)) return;

	const sorted = [...pulls]
		.filter((pr) => pr.merged_at && pr.user?.login?.toLowerCase() === target.githubLogin.toLowerCase())
		.filter((pr) => new Date(pr.merged_at as string).getTime() >= since.getTime())
		.sort((a, b) => new Date(a.merged_at as string).getTime() - new Date(b.merged_at as string).getTime());

	for (const item of sorted) {
		if (typeof item.number !== "number") continue;
		const detail = ((await githubGet<GitHubPullDetail>(
			`${baseUrl}/repos/${repo.org}/${repo.repo}/pulls/${item.number}`,
			options,
		)) ?? item) as GitHubPullDetail;
		const files =
			(await githubGet<GitHubPullFile[]>(
				`${baseUrl}/repos/${repo.org}/${repo.repo}/pulls/${item.number}/files?per_page=100`,
				options,
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
		await insertGithubEvent(context, {
			agentId: target.agentId,
			tokenAddress: target.tokenAddress,
			eventType: "pr.merged",
			payload,
			source: "github-listener",
			sourceEventId: `${repo.org}/${repo.repo}/pr/${item.number}`,
			occurredAt: new Date(mergedAt),
		});
	}
}

async function persistLastChecks(
	context: WorkerContext,
	target: PersonaTarget,
	lastChecks: Record<string, string>,
): Promise<void> {
	const metadata = { ...target.metadata, githubLastChecks: lastChecks };
	await context.db
		.update(agentPersonas)
		.set({ metadata, updatedAt: new Date() })
		.where(and(eq(agentPersonas.id, target.id), eq(agentPersonas.agentId, target.agentId)));
}

export async function runGithubListenerTick(
	context: WorkerContext,
	options: GitHubListenerOptions = {},
): Promise<void> {
	const now = options.now?.() ?? new Date();
	const targets = await listPersonaTargets(context);
	for (const target of targets) {
		const nextLastChecks = { ...target.lastChecks };
		for (const repo of target.repos) {
			const key = repoKey(repo);
			const sinceIso = target.lastChecks[key];
			const since = sinceIso
				? new Date(sinceIso)
				: new Date(now.getTime() - (options.initialLookbackHours ?? DEFAULT_INITIAL_LOOKBACK_HOURS) * 60 * 60 * 1000);
			try {
				await processCommits(context, target, repo, since, options);
				await processMergedPulls(context, target, repo, since, options);
				nextLastChecks[key] = now.toISOString();
			} catch (err) {
				context.logger.warn({ err, agentId: target.agentId, repo: key }, "github-listener repo tick failed");
			}
		}
		await persistLastChecks(context, target, nextLastChecks);
	}
}

export function startGitHubListener(context: WorkerContext, options: GitHubListenerOptions = {}): ListenerHandle {
	let stopped = false;
	let running = false;
	let timer: NodeJS.Timeout | null = null;

	const tick = async () => {
		if (stopped || running) return;
		running = true;
		try {
			await runGithubListenerTick(context, options);
		} catch (err) {
			context.logger.error({ err }, "github-listener tick failed");
		} finally {
			running = false;
			if (!stopped) timer = setTimeout(() => void tick(), activePollInterval(options.now?.() ?? new Date()));
		}
	};

	context.logger.info("starting github multi-repo listener");
	timer = setTimeout(() => void tick(), 100);

	return {
		stop: async () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		},
	};
}

export const githubListenerInternals = {
	activePollInterval,
	firstLine,
};
