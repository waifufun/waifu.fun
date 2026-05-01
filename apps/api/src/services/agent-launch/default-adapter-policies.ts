import { exampleNoopSpec, pancakeV3Spec, venusSpec } from "@waifufun/agent-actions";
import {
	AgentEventTypes,
	type AgentPersonaRow,
	type Database,
	agentAdapterPolicies,
	agentEventQueries,
} from "@waifufun/db";

const POINT_ONE_BNB_WEI = "100000000000000000";
const TEN_BNB_WEI = "10000000000000000000";

export async function seedDefaultAdapterPolicies(
	db: Database,
	agent: Pick<AgentPersonaRow, "id" | "agentId">,
): Promise<void> {
	const rows = [
		{
			agentId: agent.id,
			adapterSlug: pancakeV3Spec.slug,
			enabled: true,
			perTxValueCapWei: POINT_ONE_BNB_WEI,
			dailyValueCapWei: null,
			allowedActions: Object.keys(pancakeV3Spec.actions),
			deniedActions: [],
		},
		{
			agentId: agent.id,
			adapterSlug: venusSpec.slug,
			enabled: true,
			perTxValueCapWei: null,
			dailyValueCapWei: TEN_BNB_WEI,
			allowedActions: Object.keys(venusSpec.actions),
			deniedActions: [],
		},
		{
			agentId: agent.id,
			adapterSlug: exampleNoopSpec.slug,
			enabled: false,
			perTxValueCapWei: null,
			dailyValueCapWei: null,
			allowedActions: [],
			deniedActions: [],
		},
	] satisfies (typeof agentAdapterPolicies.$inferInsert)[];

	await db
		.insert(agentAdapterPolicies)
		.values(rows)
		.onConflictDoNothing({
			target: [agentAdapterPolicies.agentId, agentAdapterPolicies.adapterSlug],
		});

	await agentEventQueries.enqueueAgentEvent(db, {
		agentId: agent.agentId,
		type: AgentEventTypes.PolicySeeded,
		payload: {
			policyAgentId: agent.id,
			enabledAdapters: [pancakeV3Spec.slug, venusSpec.slug],
			disabledAdapters: [exampleNoopSpec.slug],
		},
	});
}
