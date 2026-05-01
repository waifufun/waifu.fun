import type { PostgrestError } from "@supabase/supabase-js";
import type { ControlPlaneClient } from "./client";
import { getControlPlaneServerClient } from "./client";
import { normalizeControlPlaneTokenKey } from "./normalization";
import { type UpsertTokenOwnershipInput, getTokenOwnership, upsertTokenOwnership } from "./token-ownerships";
import type {
	ControlPlaneAgentStatus,
	ControlPlaneBillingMode,
	ControlPlaneInsert,
	ControlPlaneLifecycleState,
	ControlPlaneRow,
	ControlPlaneRuntimeProvider,
	ControlPlaneTokenKeyInput,
	Json,
} from "./types";

function throwSupabaseError(context: string, error: PostgrestError | null): never {
	throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`);
}

export interface UpsertTokenRuntimeStateInput extends ControlPlaneTokenKeyInput {
	ownership?: UpsertTokenOwnershipInput;
	cloudAgentId?: string | null;
	runtimeProvider?: ControlPlaneRuntimeProvider;
	agentStatus?: ControlPlaneAgentStatus;
	lifecycleState?: ControlPlaneLifecycleState | null;
	billingMode?: ControlPlaneBillingMode | null;
	infraReserveUsd?: string | null;
	reserveUrl?: string | null;
	webUiUrl?: string | null;
	bridgeUrl?: string | null;
	statusReason?: string | null;
	lastHeartbeatAt?: string | null;
	lastStatusChangedAt?: string | null;
	suspendedAt?: string | null;
	resumedAt?: string | null;
	deletedAt?: string | null;
	runtimeMetadata?: Json;
}

export async function upsertTokenRuntimeState(
	input: UpsertTokenRuntimeStateInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_token_runtime_states">> {
	const token = normalizeControlPlaneTokenKey(input);

	if (input.ownership) {
		const ownershipToken = normalizeControlPlaneTokenKey(input.ownership);
		if (
			ownershipToken.chain !== token.chain ||
			ownershipToken.chainId !== token.chainId ||
			ownershipToken.normalizedContractAddress !== token.normalizedContractAddress
		) {
			throw new Error("Runtime token key must match the nested ownership token key");
		}
	}

	const ownership = input.ownership
		? await upsertTokenOwnership(
				{
					...input.ownership,
					chain: token.chain,
					chainId: token.chainId,
					contractAddress: token.contractAddress,
				},
				client,
			)
		: await getTokenOwnership(token, client);

	if (!ownership) {
		throw new Error("Token ownership record is required before storing runtime state");
	}

	const payload: ControlPlaneInsert<"control_plane_token_runtime_states"> = {
		token_ownership_id: ownership.id,
		token_chain: token.chain,
		token_chain_id: token.chainId,
		contract_address: token.contractAddress,
		normalized_contract_address: token.normalizedContractAddress,
		...(input.cloudAgentId !== undefined ? { cloud_agent_id: input.cloudAgentId } : {}),
		...(input.runtimeProvider !== undefined ? { runtime_provider: input.runtimeProvider } : {}),
		...(input.agentStatus !== undefined ? { agent_status: input.agentStatus } : {}),
		...(input.lifecycleState !== undefined ? { lifecycle_state: input.lifecycleState } : {}),
		...(input.billingMode !== undefined ? { billing_mode: input.billingMode } : {}),
		...(input.infraReserveUsd !== undefined ? { infra_reserve_usd: input.infraReserveUsd } : {}),
		...(input.reserveUrl !== undefined ? { reserve_url: input.reserveUrl } : {}),
		...(input.webUiUrl !== undefined ? { web_ui_url: input.webUiUrl } : {}),
		...(input.bridgeUrl !== undefined ? { bridge_url: input.bridgeUrl } : {}),
		...(input.statusReason !== undefined ? { status_reason: input.statusReason } : {}),
		...(input.lastHeartbeatAt !== undefined ? { last_heartbeat_at: input.lastHeartbeatAt } : {}),
		...(input.lastStatusChangedAt !== undefined
			? { last_status_changed_at: input.lastStatusChangedAt }
			: input.agentStatus !== undefined
				? { last_status_changed_at: new Date().toISOString() }
				: {}),
		...(input.suspendedAt !== undefined ? { suspended_at: input.suspendedAt } : {}),
		...(input.resumedAt !== undefined ? { resumed_at: input.resumedAt } : {}),
		...(input.deletedAt !== undefined ? { deleted_at: input.deletedAt } : {}),
		...(input.runtimeMetadata !== undefined ? { runtime_metadata: input.runtimeMetadata } : {}),
	};

	const { data, error } = await client
		.from("control_plane_token_runtime_states")
		.upsert(payload, { onConflict: "token_chain,token_chain_id,normalized_contract_address" })
		.select()
		.single();

	if (error) {
		throwSupabaseError("Failed to upsert token runtime state", error);
	}

	return data;
}

export async function getTokenRuntimeState(
	input: ControlPlaneTokenKeyInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_token_runtime_states"> | null> {
	const token = normalizeControlPlaneTokenKey(input);
	const { data, error } = await client
		.from("control_plane_token_runtime_states")
		.select("*")
		.eq("token_chain", token.chain)
		.eq("token_chain_id", token.chainId)
		.eq("normalized_contract_address", token.normalizedContractAddress)
		.maybeSingle();

	if (error) {
		throwSupabaseError("Failed to fetch token runtime state", error);
	}

	return data;
}
