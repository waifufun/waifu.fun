import type { ProvisionResult } from "@/lib/api/agent-provision";

type ProvisionSuccessResult = Extract<ProvisionResult, { ok: true }>;

export function provisionSuccessStorageKey(result: ProvisionSuccessResult): string {
	return `wf_agent_api_key:${result.tokenAddress ?? result.agentId}`;
}

export function provisionCloudStorageKey(result: ProvisionSuccessResult): string {
	return `wf_cloud_provision:${result.tokenAddress ?? result.agentId}`;
}

export function provisionSuccessRoute(result: ProvisionSuccessResult): string {
	return `/patron/${encodeURIComponent(result.tokenAddress ?? result.agentId)}?just_provisioned=true`;
}
