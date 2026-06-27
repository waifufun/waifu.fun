import type { AgentEvent } from "@/lib/hooks/use-agent-events";

export function isFundingNoiseEvent(event: Pick<AgentEvent, "eventType">): boolean {
	const eventType = event.eventType.trim().toLowerCase();
	return eventType === "funding" || eventType.includes("funding");
}

export function filterAgentEventsForActivity(events: AgentEvent[]): AgentEvent[] {
	return events.filter((event) => !isFundingNoiseEvent(event));
}
