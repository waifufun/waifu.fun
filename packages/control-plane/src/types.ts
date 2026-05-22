export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ControlPlaneChain = "solana" | "evm";
export type ControlPlaneWalletLinkSource = "manual" | "self_claim" | "admin" | "import" | "sync";
export type ControlPlaneOwnershipStatus = "unclaimed" | "claimed" | "verified" | "disputed";
export type ControlPlaneLaunchType = "native" | "imported";
export type ControlPlaneLaunchPlatform = "pump" | "flap" | "external" | "unknown";
export type ControlPlaneRuntimeProvider = "eliza-cloud" | "unknown";
export type ControlPlaneAgentStatus = "none" | "provisioning" | "running" | "suspended" | "failed" | "deleted";
export type ControlPlaneLifecycleState = "birth" | "live" | "dormant" | "reviving";
export type ControlPlaneBillingMode = "owner_credits" | "waifu_treasury_subsidy" | "hybrid";

export interface ControlPlaneWalletKeyInput {
	chain: ControlPlaneChain;
	chainId: number;
	address: string;
}

export interface ControlPlaneWalletKey extends ControlPlaneWalletKeyInput {
	normalizedAddress: string;
}

export interface ControlPlaneTokenKeyInput {
	chain: ControlPlaneChain;
	chainId: number;
	contractAddress: string;
}

export interface ControlPlaneTokenKey extends ControlPlaneTokenKeyInput {
	normalizedContractAddress: string;
}

export interface ControlPlaneInviteRedemptionResult {
	redemptionId: string;
	inviteCodeId: string;
	code: string;
	usedCount: number;
	maxUses: number;
	remainingUses: number;
}

export interface ControlPlaneLaunchAccessResult {
	allowed: boolean;
	source: "allowlist" | "invite" | null;
	reason?: string;
	walletIdentityId?: string;
}

export interface ControlPlaneDatabase {
	public: {
		Tables: {
			control_plane_users: {
				Row: {
					id: string;
					external_auth_id: string | null;
					display_name: string | null;
					email: string | null;
					metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					external_auth_id?: string | null;
					display_name?: string | null;
					email?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					external_auth_id?: string | null;
					display_name?: string | null;
					email?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			control_plane_wallet_identities: {
				Row: {
					id: string;
					user_id: string | null;
					chain: ControlPlaneChain;
					chain_id: number;
					address: string;
					normalized_address: string;
					label: string | null;
					link_source: ControlPlaneWalletLinkSource;
					verified_at: string | null;
					last_seen_at: string | null;
					metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id?: string | null;
					chain: ControlPlaneChain;
					chain_id: number;
					address: string;
					normalized_address: string;
					label?: string | null;
					link_source?: ControlPlaneWalletLinkSource;
					verified_at?: string | null;
					last_seen_at?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string | null;
					chain?: ControlPlaneChain;
					chain_id?: number;
					address?: string;
					normalized_address?: string;
					label?: string | null;
					link_source?: ControlPlaneWalletLinkSource;
					verified_at?: string | null;
					last_seen_at?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			control_plane_token_ownerships: {
				Row: {
					id: string;
					token_chain: ControlPlaneChain;
					token_chain_id: number;
					contract_address: string;
					normalized_contract_address: string;
					launch_type: ControlPlaneLaunchType | null;
					launch_platform: ControlPlaneLaunchPlatform;
					owner_claim_status: ControlPlaneOwnershipStatus;
					creator_wallet_identity_id: string | null;
					creator_user_id: string | null;
					owner_wallet_identity_id: string | null;
					owner_user_id: string | null;
					claimed_at: string | null;
					verified_at: string | null;
					ownership_source: string;
					ownership_metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					token_chain: ControlPlaneChain;
					token_chain_id: number;
					contract_address: string;
					normalized_contract_address: string;
					launch_type?: ControlPlaneLaunchType | null;
					launch_platform?: ControlPlaneLaunchPlatform;
					owner_claim_status?: ControlPlaneOwnershipStatus;
					creator_wallet_identity_id?: string | null;
					creator_user_id?: string | null;
					owner_wallet_identity_id?: string | null;
					owner_user_id?: string | null;
					claimed_at?: string | null;
					verified_at?: string | null;
					ownership_source?: string;
					ownership_metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					token_chain?: ControlPlaneChain;
					token_chain_id?: number;
					contract_address?: string;
					normalized_contract_address?: string;
					launch_type?: ControlPlaneLaunchType | null;
					launch_platform?: ControlPlaneLaunchPlatform;
					owner_claim_status?: ControlPlaneOwnershipStatus;
					creator_wallet_identity_id?: string | null;
					creator_user_id?: string | null;
					owner_wallet_identity_id?: string | null;
					owner_user_id?: string | null;
					claimed_at?: string | null;
					verified_at?: string | null;
					ownership_source?: string;
					ownership_metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			control_plane_token_runtime_states: {
				Row: {
					id: string;
					token_ownership_id: string;
					token_chain: ControlPlaneChain;
					token_chain_id: number;
					contract_address: string;
					normalized_contract_address: string;
					cloud_agent_id: string | null;
					runtime_provider: ControlPlaneRuntimeProvider;
					agent_status: ControlPlaneAgentStatus;
					lifecycle_state: ControlPlaneLifecycleState | null;
					billing_mode: ControlPlaneBillingMode | null;
					infra_reserve_usd: string | null;
					reserve_url: string | null;
					web_ui_url: string | null;
					bridge_url: string | null;
					status_reason: string | null;
					last_heartbeat_at: string | null;
					last_status_changed_at: string | null;
					suspended_at: string | null;
					resumed_at: string | null;
					deleted_at: string | null;
					runtime_metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					token_ownership_id: string;
					token_chain: ControlPlaneChain;
					token_chain_id: number;
					contract_address: string;
					normalized_contract_address: string;
					cloud_agent_id?: string | null;
					runtime_provider?: ControlPlaneRuntimeProvider;
					agent_status?: ControlPlaneAgentStatus;
					lifecycle_state?: ControlPlaneLifecycleState | null;
					billing_mode?: ControlPlaneBillingMode | null;
					infra_reserve_usd?: string | null;
					reserve_url?: string | null;
					web_ui_url?: string | null;
					bridge_url?: string | null;
					status_reason?: string | null;
					last_heartbeat_at?: string | null;
					last_status_changed_at?: string | null;
					suspended_at?: string | null;
					resumed_at?: string | null;
					deleted_at?: string | null;
					runtime_metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					token_ownership_id?: string;
					token_chain?: ControlPlaneChain;
					token_chain_id?: number;
					contract_address?: string;
					normalized_contract_address?: string;
					cloud_agent_id?: string | null;
					runtime_provider?: ControlPlaneRuntimeProvider;
					agent_status?: ControlPlaneAgentStatus;
					lifecycle_state?: ControlPlaneLifecycleState | null;
					billing_mode?: ControlPlaneBillingMode | null;
					infra_reserve_usd?: string | null;
					reserve_url?: string | null;
					web_ui_url?: string | null;
					bridge_url?: string | null;
					status_reason?: string | null;
					last_heartbeat_at?: string | null;
					last_status_changed_at?: string | null;
					suspended_at?: string | null;
					resumed_at?: string | null;
					deleted_at?: string | null;
					runtime_metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			control_plane_launch_gate_allowlist: {
				Row: {
					id: string;
					wallet_identity_id: string | null;
					chain: ControlPlaneChain;
					chain_id: number;
					address: string;
					normalized_address: string;
					added_by_user_id: string | null;
					added_by_wallet_identity_id: string | null;
					reason: string | null;
					metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					wallet_identity_id?: string | null;
					chain: ControlPlaneChain;
					chain_id: number;
					address: string;
					normalized_address: string;
					added_by_user_id?: string | null;
					added_by_wallet_identity_id?: string | null;
					reason?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					wallet_identity_id?: string | null;
					chain?: ControlPlaneChain;
					chain_id?: number;
					address?: string;
					normalized_address?: string;
					added_by_user_id?: string | null;
					added_by_wallet_identity_id?: string | null;
					reason?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			control_plane_invite_codes: {
				Row: {
					id: string;
					code: string;
					created_by_user_id: string | null;
					created_by_wallet_identity_id: string | null;
					max_uses: number;
					used_count: number;
					expires_at: string | null;
					disabled_at: string | null;
					notes: string | null;
					metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					code: string;
					created_by_user_id?: string | null;
					created_by_wallet_identity_id?: string | null;
					max_uses?: number;
					used_count?: number;
					expires_at?: string | null;
					disabled_at?: string | null;
					notes?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					code?: string;
					created_by_user_id?: string | null;
					created_by_wallet_identity_id?: string | null;
					max_uses?: number;
					used_count?: number;
					expires_at?: string | null;
					disabled_at?: string | null;
					notes?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			control_plane_invite_redemptions: {
				Row: {
					id: string;
					invite_code_id: string;
					redeemed_by_wallet_identity_id: string;
					redeemed_by_user_id: string | null;
					metadata: Json;
					created_at: string;
				};
				Insert: {
					id?: string;
					invite_code_id: string;
					redeemed_by_wallet_identity_id: string;
					redeemed_by_user_id?: string | null;
					metadata?: Json;
					created_at?: string;
				};
				Update: {
					id?: string;
					invite_code_id?: string;
					redeemed_by_wallet_identity_id?: string;
					redeemed_by_user_id?: string | null;
					metadata?: Json;
					created_at?: string;
				};
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: {
			control_plane_redeem_invite_code: {
				Args: {
					p_code: string;
					p_redeemed_by_wallet_identity_id: string;
					p_redeemed_by_user_id?: string | null;
					p_metadata?: Json;
				};
				Returns: {
					redemption_id: string;
					invite_code_id: string;
					code: string;
					used_count: number;
					max_uses: number;
					remaining_uses: number;
				}[];
			};
		};
		Enums: {
			control_plane_chain: ControlPlaneChain;
			control_plane_wallet_link_source: ControlPlaneWalletLinkSource;
			control_plane_ownership_status: ControlPlaneOwnershipStatus;
			control_plane_launch_type: ControlPlaneLaunchType;
			control_plane_launch_platform: ControlPlaneLaunchPlatform;
			control_plane_runtime_provider: ControlPlaneRuntimeProvider;
			control_plane_agent_status: ControlPlaneAgentStatus;
			control_plane_lifecycle_state: ControlPlaneLifecycleState;
			control_plane_billing_mode: ControlPlaneBillingMode;
		};
		CompositeTypes: Record<string, never>;
	};
}

export type ControlPlaneTables = ControlPlaneDatabase["public"]["Tables"];
export type ControlPlaneTableName = keyof ControlPlaneTables;
export type ControlPlaneRow<T extends ControlPlaneTableName> = ControlPlaneTables[T]["Row"];
export type ControlPlaneInsert<T extends ControlPlaneTableName> = ControlPlaneTables[T]["Insert"];
export type ControlPlaneUpdate<T extends ControlPlaneTableName> = ControlPlaneTables[T]["Update"];
