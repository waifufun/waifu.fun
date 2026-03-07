import type { PostgrestError } from "@supabase/supabase-js";
import type { ControlPlaneClient } from "./client";
import { getControlPlaneServerClient } from "./client";
import { normalizeControlPlaneWalletKey } from "./normalization";
import type {
	ControlPlaneInsert,
	ControlPlaneRow,
	ControlPlaneWalletKeyInput,
	ControlPlaneWalletLinkSource,
	Json,
} from "./types";

function throwSupabaseError(context: string, error: PostgrestError | null): never {
	throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`);
}

export interface UpsertWalletIdentityInput extends ControlPlaneWalletKeyInput {
	userId?: string | null;
	label?: string | null;
	linkSource?: ControlPlaneWalletLinkSource;
	verifiedAt?: string | null;
	lastSeenAt?: string | null;
	metadata?: Json;
}

export async function upsertWalletIdentity(
	input: UpsertWalletIdentityInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_wallet_identities">> {
	const wallet = normalizeControlPlaneWalletKey(input);
	const payload: ControlPlaneInsert<"control_plane_wallet_identities"> = {
		chain: wallet.chain,
		chain_id: wallet.chainId,
		address: wallet.address,
		normalized_address: wallet.normalizedAddress,
		last_seen_at: input.lastSeenAt ?? new Date().toISOString(),
		...(input.userId !== undefined ? { user_id: input.userId } : {}),
		...(input.label !== undefined ? { label: input.label } : {}),
		...(input.linkSource !== undefined ? { link_source: input.linkSource } : {}),
		...(input.verifiedAt !== undefined ? { verified_at: input.verifiedAt } : {}),
		...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
	};

	const { data, error } = await client
		.from("control_plane_wallet_identities")
		.upsert(payload, { onConflict: "chain,chain_id,normalized_address" })
		.select()
		.single();

	if (error) {
		throwSupabaseError("Failed to upsert wallet identity", error);
	}

	return data;
}

export async function getWalletIdentityByAddress(
	input: ControlPlaneWalletKeyInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_wallet_identities"> | null> {
	const wallet = normalizeControlPlaneWalletKey(input);
	const { data, error } = await client
		.from("control_plane_wallet_identities")
		.select("*")
		.eq("chain", wallet.chain)
		.eq("chain_id", wallet.chainId)
		.eq("normalized_address", wallet.normalizedAddress)
		.maybeSingle();

	if (error) {
		throwSupabaseError("Failed to fetch wallet identity", error);
	}

	return data;
}
