import type { PostgrestError } from "@supabase/supabase-js";
import type { ControlPlaneClient } from "./client";
import { getControlPlaneServerClient } from "./client";
import { normalizeControlPlaneTokenKey } from "./normalization";
import type {
	ControlPlaneInsert,
	ControlPlaneLaunchPlatform,
	ControlPlaneLaunchType,
	ControlPlaneOwnershipStatus,
	ControlPlaneRow,
	ControlPlaneTokenKeyInput,
	Json,
} from "./types";
import { type UpsertWalletIdentityInput, upsertWalletIdentity } from "./wallet-identities";

function throwSupabaseError(context: string, error: PostgrestError | null): never {
	throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`);
}

export interface UpsertTokenOwnershipInput extends ControlPlaneTokenKeyInput {
	launchType?: ControlPlaneLaunchType | null;
	launchPlatform?: ControlPlaneLaunchPlatform;
	ownerClaimStatus?: ControlPlaneOwnershipStatus;
	ownershipSource?: string;
	ownershipMetadata?: Json;
	claimedAt?: string | null;
	verifiedAt?: string | null;
	creatorWallet?: UpsertWalletIdentityInput | null;
	creatorUserId?: string | null;
	ownerWallet?: UpsertWalletIdentityInput | null;
	ownerUserId?: string | null;
}

export async function upsertTokenOwnership(
	input: UpsertTokenOwnershipInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_token_ownerships">> {
	const token = normalizeControlPlaneTokenKey(input);
	const creatorWalletIdentity = input.creatorWallet ? await upsertWalletIdentity(input.creatorWallet, client) : null;
	const ownerWalletIdentity = input.ownerWallet ? await upsertWalletIdentity(input.ownerWallet, client) : null;

	const payload: ControlPlaneInsert<"control_plane_token_ownerships"> = {
		token_chain: token.chain,
		token_chain_id: token.chainId,
		contract_address: token.contractAddress,
		normalized_contract_address: token.normalizedContractAddress,
		...(input.launchType !== undefined ? { launch_type: input.launchType } : {}),
		...(input.launchPlatform !== undefined ? { launch_platform: input.launchPlatform } : {}),
		...(input.ownerClaimStatus !== undefined ? { owner_claim_status: input.ownerClaimStatus } : {}),
		...(creatorWalletIdentity?.id ? { creator_wallet_identity_id: creatorWalletIdentity.id } : {}),
		...(input.creatorUserId !== undefined
			? { creator_user_id: input.creatorUserId }
			: creatorWalletIdentity?.user_id
				? { creator_user_id: creatorWalletIdentity.user_id }
				: {}),
		...(ownerWalletIdentity?.id ? { owner_wallet_identity_id: ownerWalletIdentity.id } : {}),
		...(input.ownerUserId !== undefined
			? { owner_user_id: input.ownerUserId }
			: ownerWalletIdentity?.user_id
				? { owner_user_id: ownerWalletIdentity.user_id }
				: {}),
		...(input.claimedAt !== undefined ? { claimed_at: input.claimedAt } : {}),
		...(input.verifiedAt !== undefined ? { verified_at: input.verifiedAt } : {}),
		...(input.ownershipSource !== undefined ? { ownership_source: input.ownershipSource } : {}),
		...(input.ownershipMetadata !== undefined ? { ownership_metadata: input.ownershipMetadata } : {}),
	};

	const { data, error } = await client
		.from("control_plane_token_ownerships")
		.upsert(payload, { onConflict: "token_chain,token_chain_id,normalized_contract_address" })
		.select()
		.single();

	if (error) {
		throwSupabaseError("Failed to upsert token ownership", error);
	}

	return data;
}

export async function getTokenOwnership(
	input: ControlPlaneTokenKeyInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_token_ownerships"> | null> {
	const token = normalizeControlPlaneTokenKey(input);
	const { data, error } = await client
		.from("control_plane_token_ownerships")
		.select("*")
		.eq("token_chain", token.chain)
		.eq("token_chain_id", token.chainId)
		.eq("normalized_contract_address", token.normalizedContractAddress)
		.maybeSingle();

	if (error) {
		throwSupabaseError("Failed to fetch token ownership", error);
	}

	return data;
}
