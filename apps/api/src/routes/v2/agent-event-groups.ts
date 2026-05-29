import type { AgentEvent } from "@waifufun/db";

const GITHUB_GROUP_WINDOW_MS = 30 * 60 * 1000;
const GITHUB_GROUPABLE_EVENT_TYPES = new Set([
	"commit.pushed",
	"pr.opened",
	"pr.merged",
	"gh_commit_pushed",
	"gh_pr_opened",
	"gh_pr_merged",
]);

type Payload = Record<string, unknown>;

export type GroupedAgentEvent = AgentEvent & {
	grouped?: true;
	count?: number;
	items?: AgentEvent[];
};

function payloadOf(event: AgentEvent): Payload {
	return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
		? (event.payload as Payload)
		: {};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function repoKey(event: AgentEvent): string | null {
	const payload = payloadOf(event);
	const repo = stringValue(payload.repo);
	if (!repo) return null;
	const org = stringValue(payload.org);
	return (org && !repo.includes("/") ? `${org}/${repo}` : repo).toLowerCase();
}

function timestampOf(event: AgentEvent): number {
	const raw = event.createdAt instanceof Date ? event.createdAt.getTime() : new Date(event.createdAt).getTime();
	return Number.isFinite(raw) ? raw : 0;
}

function groupKey(event: AgentEvent): string | null {
	if (!GITHUB_GROUPABLE_EVENT_TYPES.has(event.eventType)) return null;
	const repo = repoKey(event);
	if (!repo) return null;
	return `${event.eventType}:${event.agentId ?? ""}:${repo}`;
}

function toGroupedEvent(items: AgentEvent[]): GroupedAgentEvent {
	const [latest] = items;
	if (!latest || items.length === 1) return latest as GroupedAgentEvent;
	return {
		...latest,
		grouped: true,
		count: items.length,
		items,
	};
}

/**
 * Collapse noisy GitHub activity into response-only groups. Input is expected
 * newest-first from the database. Groups are bounded by event type, agent,
 * repo, and a 30-minute window measured from the group's latest event.
 */
export function groupGithubAgentEvents(events: AgentEvent[]): GroupedAgentEvent[] {
	const output: GroupedAgentEvent[] = [];
	const active = new Map<string, { latestAt: number; outputIndex: number; items: AgentEvent[] }>();

	for (const event of events) {
		const key = groupKey(event);
		const eventAt = timestampOf(event);
		const existing = key ? active.get(key) : undefined;
		if (key && existing && Math.abs(existing.latestAt - eventAt) <= GITHUB_GROUP_WINDOW_MS) {
			existing.items.push(event);
			output[existing.outputIndex] = toGroupedEvent(existing.items);
			continue;
		}

		const outputIndex = output.length;
		output.push(event as GroupedAgentEvent);
		if (key) {
			active.set(key, { latestAt: eventAt, outputIndex, items: [event] });
		}
	}

	return output;
}
