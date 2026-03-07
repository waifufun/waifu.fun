import type { PostgrestError } from "@supabase/supabase-js";
import type { ControlPlaneClient } from "./client";
import { getControlPlaneServerClient } from "./client";
import {
	createControlPlaneInviteCode,
	normalizeControlPlaneInviteCode,
	normalizeControlPlaneWalletKey,
} from "./normalization";
import { getWalletIdentityByAddress, upsertWalletIdentity, type UpsertWalletIdentityInput } from "./wallet-identities";
import type {
	ControlPlaneInsert,
	ControlPlaneInviteRedemptionResult,
	ControlPlaneLaunchAccessResult,
	ControlPlaneRow,
	ControlPlaneWalletKeyInput,
	Json,
} from "./types";

function throwSupabaseError(context: string, error: PostgrestError | null): never {
	throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`);
}

export interface AddLaunchGateAllowlistEntryInput extends ControlPlaneWalletKeyInput {
	addedByUserId?: string | null;
	addedByWallet?: UpsertWalletIdentityInput | null;
	reason?: string | null;
	metadata?: Json;
}

export interface CreateInviteCodeInput {
	code?: string;
	prefix?: string;
	maxUses?: number;
	expiresAt?: string | null;
	notes?: string | null;
	createdByUserId?: string | null;
	createdByWallet?: UpsertWalletIdentityInput | null;
	metadata?: Json;
}

export interface RedeemInviteCodeInput extends ControlPlaneWalletKeyInput {
	code: string;
	redeemedByUserId?: string | null;
	metadata?: Json;
}

export async function addWalletToLaunchGateAllowlist(
	input: AddLaunchGateAllowlistEntryInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_launch_gate_allowlist">> {
	const wallet = normalizeControlPlaneWalletKey(input);
	const walletIdentity = await upsertWalletIdentity(
		{
			chain: wallet.chain,
			chainId: wallet.chainId,
			address: wallet.address,
		},
		client,
	);
	const addedByWalletIdentity = input.addedByWallet ? await upsertWalletIdentity(input.addedByWallet, client) : null;

	const payload: ControlPlaneInsert<"control_plane_launch_gate_allowlist"> = {
		wallet_identity_id: walletIdentity.id,
		chain: wallet.chain,
		chain_id: wallet.chainId,
		address: wallet.address,
		normalized_address: wallet.normalizedAddress,
		...(input.addedByUserId !== undefined
			? { added_by_user_id: input.addedByUserId }
			: addedByWalletIdentity?.user_id
				? { added_by_user_id: addedByWalletIdentity.user_id }
				: {}),
		...(addedByWalletIdentity?.id ? { added_by_wallet_identity_id: addedByWalletIdentity.id } : {}),
		...(input.reason !== undefined ? { reason: input.reason } : {}),
		...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
	};

	const { data, error } = await client
		.from("control_plane_launch_gate_allowlist")
		.upsert(payload, { onConflict: "chain,chain_id,normalized_address" })
		.select()
		.single();

	if (error) {
		throwSupabaseError("Failed to upsert launch gate allowlist entry", error);
	}

	return data;
}

export async function removeWalletFromLaunchGateAllowlist(
	input: ControlPlaneWalletKeyInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<void> {
	const wallet = normalizeControlPlaneWalletKey(input);
	const { error } = await client
		.from("control_plane_launch_gate_allowlist")
		.delete()
		.eq("chain", wallet.chain)
		.eq("chain_id", wallet.chainId)
		.eq("normalized_address", wallet.normalizedAddress);

	if (error) {
		throwSupabaseError("Failed to delete launch gate allowlist entry", error);
	}
}

export async function listLaunchGateAllowlist(
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_launch_gate_allowlist">[]> {
	const { data, error } = await client
		.from("control_plane_launch_gate_allowlist")
		.select("*")
		.order("created_at", { ascending: false });

	if (error) {
		throwSupabaseError("Failed to list launch gate allowlist entries", error);
	}

	return data;
}

export async function getLaunchAccessForWallet(
	input: ControlPlaneWalletKeyInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneLaunchAccessResult> {
	const wallet = normalizeControlPlaneWalletKey(input);
	const walletIdentity = await getWalletIdentityByAddress(wallet, client);

	const { data: allowlistEntry, error: allowlistError } = await client
		.from("control_plane_launch_gate_allowlist")
		.select("id")
		.eq("chain", wallet.chain)
		.eq("chain_id", wallet.chainId)
		.eq("normalized_address", wallet.normalizedAddress)
		.maybeSingle();

	if (allowlistError) {
		throwSupabaseError("Failed to check launch gate allowlist", allowlistError);
	}

	if (allowlistEntry) {
		return {
			allowed: true,
			source: "allowlist",
			...(walletIdentity?.id ? { walletIdentityId: walletIdentity.id } : {}),
		};
	}

	if (walletIdentity) {
		const { data: redemption, error: redemptionError } = await client
			.from("control_plane_invite_redemptions")
			.select("id")
			.eq("redeemed_by_wallet_identity_id", walletIdentity.id)
			.limit(1)
			.maybeSingle();

		if (redemptionError) {
			throwSupabaseError("Failed to check invite redemption history", redemptionError);
		}

		if (redemption) {
			return {
				allowed: true,
				source: "invite",
				walletIdentityId: walletIdentity.id,
			};
		}
	}

	return {
		allowed: false,
		source: null,
		...(walletIdentity?.id ? { walletIdentityId: walletIdentity.id } : {}),
		reason: "This wallet is not on the curated launch allowlist. Enter a valid invite code or apply for access.",
	};
}

export async function createInviteCode(
	input: CreateInviteCodeInput = {},
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneRow<"control_plane_invite_codes">> {
	const createdByWalletIdentity = input.createdByWallet
		? await upsertWalletIdentity(input.createdByWallet, client)
		: null;
	const maxUses = input.maxUses ?? 1;

	if (!Number.isInteger(maxUses) || maxUses < 1) {
		throw new Error("maxUses must be an integer greater than 0");
	}

	const basePayload: Omit<ControlPlaneInsert<"control_plane_invite_codes">, "code"> = {
		...(input.createdByUserId !== undefined
			? { created_by_user_id: input.createdByUserId }
			: createdByWalletIdentity?.user_id
				? { created_by_user_id: createdByWalletIdentity.user_id }
				: {}),
		...(createdByWalletIdentity?.id ? { created_by_wallet_identity_id: createdByWalletIdentity.id } : {}),
		max_uses: maxUses,
		used_count: 0,
		...(input.expiresAt !== undefined ? { expires_at: input.expiresAt } : {}),
		notes: input.notes ?? null,
		metadata: input.metadata ?? {},
	};

	const attemptLimit = input.code ? 1 : 5;
	for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
		const normalizedCode = input.code
			? normalizeControlPlaneInviteCode(input.code)
			: createControlPlaneInviteCode(input.prefix ?? "WAIFU");
		const payload: ControlPlaneInsert<"control_plane_invite_codes"> = {
			code: normalizedCode,
			...basePayload,
		};
		const { data, error } = await client.from("control_plane_invite_codes").insert(payload).select().single();

		if (!error) {
			return data;
		}

		if (error.code !== "23505" || input.code) {
			throwSupabaseError("Failed to create invite code", error);
		}
	}

	throw new Error("Unable to generate a unique invite code");
}

export async function redeemInviteCode(
	input: RedeemInviteCodeInput,
	client: ControlPlaneClient = getControlPlaneServerClient(),
): Promise<ControlPlaneInviteRedemptionResult> {
	const walletIdentity = await upsertWalletIdentity(
		{
			chain: input.chain,
			chainId: input.chainId,
			address: input.address,
		},
		client,
	);
	const normalizedCode = normalizeControlPlaneInviteCode(input.code);
	const { data, error } = await client.rpc("control_plane_redeem_invite_code", {
		p_code: normalizedCode,
		p_redeemed_by_wallet_identity_id: walletIdentity.id,
		p_redeemed_by_user_id: input.redeemedByUserId ?? walletIdentity.user_id ?? null,
		p_metadata: input.metadata ?? {},
	});

	if (error) {
		throwSupabaseError("Failed to redeem invite code", error);
	}

	const redemption = data[0];
	if (!redemption) {
		throw new Error("Invite redemption did not return a result");
	}

	return {
		redemptionId: redemption.redemption_id,
		inviteCodeId: redemption.invite_code_id,
		code: redemption.code,
		usedCount: redemption.used_count,
		maxUses: redemption.max_uses,
		remainingUses: redemption.remaining_uses,
	};
}
