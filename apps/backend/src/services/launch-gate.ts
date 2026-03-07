import {
	addWalletToLaunchGateAllowlist,
	createInviteCode as createControlPlaneInviteCode,
	getControlPlaneServerClient,
	getLaunchAccessForWallet,
	listLaunchGateAllowlist,
	normalizeControlPlaneInviteCode,
	redeemInviteCode as redeemControlPlaneInviteCode,
	removeWalletFromLaunchGateAllowlist,
	type ControlPlaneChain,
	type ControlPlaneRow,
} from "@waifufun/control-plane";
import logger from "@waifufun/logger";
import { PublicKey } from "@solana/web3.js";
import { getAddress as getEvmAddress, isAddress as isEvmAddress } from "viem";

const DEFAULT_EVM_CHAIN_ID = 8453;

function getDefaultSolanaChainId(): number {
	return process.env.NEXT_PUBLIC_NETWORK === "devnet" ? 103 : 101;
}

function isSupabaseConfigured(): boolean {
	return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function normalizeSolanaAddress(address: string): string {
	return new PublicKey(address.trim()).toBase58();
}

function detectWalletChain(address: string, preferredChain?: ControlPlaneChain): ControlPlaneChain {
	const trimmed = address.trim();
	if (!trimmed) {
		throw new Error("Wallet address is required");
	}

	if (preferredChain === "evm") {
		if (!isEvmAddress(trimmed)) {
			throw new Error("Invalid EVM wallet address");
		}
		return "evm";
	}

	if (preferredChain === "solana") {
		normalizeSolanaAddress(trimmed);
		return "solana";
	}

	if (isEvmAddress(trimmed)) {
		return "evm";
	}

	try {
		normalizeSolanaAddress(trimmed);
		return "solana";
	} catch {
		throw new Error("Invalid wallet address");
	}
}

function resolveWallet(address: string, preferredChain?: ControlPlaneChain) {
	const chain = detectWalletChain(address, preferredChain);

	if (chain === "evm") {
		const canonicalAddress = getEvmAddress(address.trim());
		return {
			chain,
			chainId: DEFAULT_EVM_CHAIN_ID,
			address: canonicalAddress,
			normalizedAddress: canonicalAddress.toLowerCase(),
		};
	}

	const canonicalAddress = normalizeSolanaAddress(address);
	return {
		chain,
		chainId: getDefaultSolanaChainId(),
		address: canonicalAddress,
		normalizedAddress: canonicalAddress,
	};
}

type ResolvedWallet = ReturnType<typeof resolveWallet>;

type InviteCodeRow = ControlPlaneRow<"control_plane_invite_codes">;
type InviteRedemptionRow = ControlPlaneRow<"control_plane_invite_redemptions">;
type WalletIdentityRow = ControlPlaneRow<"control_plane_wallet_identities">;

export interface LaunchGateAllowlistEntry {
	chain: ControlPlaneChain;
	chainId: number;
	address: string;
	normalizedAddress: string;
	source: "env" | "control_plane" | "env+control_plane";
	reason?: string | null;
	createdAt?: string | null;
	updatedAt?: string | null;
}

export interface LaunchGateInviteRecord {
	id: string;
	code: string;
	maxUses: number;
	usedCount: number;
	remainingUses: number;
	expiresAt: string | null;
	disabledAt: string | null;
	notes: string | null;
	createdBy: string | null;
	usedBy: string[];
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

export class LaunchGateService {
	private readonly enabled: boolean;
	private readonly envAllowlist = new Map<string, LaunchGateAllowlistEntry>();

	constructor() {
		this.enabled = process.env.LAUNCH_GATE_ENABLED ? process.env.LAUNCH_GATE_ENABLED === "true" : true;

		const envWallets = process.env.LAUNCH_GATE_WALLETS
			? process.env.LAUNCH_GATE_WALLETS.split(",")
					.map((wallet) => wallet.trim())
					.filter(Boolean)
			: [];

		for (const wallet of envWallets) {
			try {
				const resolved = resolveWallet(wallet);
				this.envAllowlist.set(this.toKey(resolved), {
					...resolved,
					source: "env",
					reason: "LAUNCH_GATE_WALLETS",
					createdAt: null,
					updatedAt: null,
				});
			} catch {
				logger.warn(`[LaunchGate] Skipping invalid allowlisted wallet: ${wallet}`);
			}
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	private hasControlPlane(): boolean {
		return isSupabaseConfigured();
	}

	private getClient() {
		if (!this.hasControlPlane()) {
			throw new Error("Supabase control-plane is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
		}

		return getControlPlaneServerClient();
	}

	private toKey(wallet: ResolvedWallet): string {
		return `${wallet.chain}:${wallet.chainId}:${wallet.normalizedAddress}`;
	}

	private isInviteActive(invite: InviteCodeRow): boolean {
		if (invite.disabled_at) {
			return false;
		}

		if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
			return false;
		}

		return invite.used_count < invite.max_uses;
	}

	private async getInviteCodeRow(code: string): Promise<InviteCodeRow | null> {
		const normalizedCode = normalizeControlPlaneInviteCode(code);
		const { data, error } = await this.getClient()
			.from("control_plane_invite_codes")
			.select("*")
			.eq("code", normalizedCode)
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to fetch invite code: ${error.message}`);
		}

		return data;
	}

	async canCreate(walletAddress: string): Promise<{
		allowed: boolean;
		source?: "allowlist" | "invite" | "disabled" | null;
		reason?: string;
	}> {
		if (!this.isEnabled()) {
			return {
				allowed: true,
				source: "disabled",
			};
		}

		const wallet = resolveWallet(walletAddress);
		if (this.envAllowlist.has(this.toKey(wallet))) {
			return {
				allowed: true,
				source: "allowlist",
			};
		}

		if (!this.hasControlPlane()) {
			return {
				allowed: false,
				reason: "Curated launch access is enabled, but the Supabase control-plane is not configured on this server.",
			};
		}

		const access = await getLaunchAccessForWallet(
			{
				chain: wallet.chain,
				chainId: wallet.chainId,
				address: wallet.address,
			},
			this.getClient(),
		);

		return {
			allowed: access.allowed,
			source: access.source,
			reason: access.reason,
		};
	}

	async validateInviteCode(code: string): Promise<{ valid: boolean; remainingUses?: number }> {
		if (!this.isEnabled() || !this.hasControlPlane()) {
			return { valid: false };
		}

		const invite = await this.getInviteCodeRow(code);
		if (!invite || !this.isInviteActive(invite)) {
			return { valid: false };
		}

		return {
			valid: true,
			remainingUses: Math.max(invite.max_uses - invite.used_count, 0),
		};
	}

	async redeemInviteCode(code: string, walletAddress: string) {
		const wallet = resolveWallet(walletAddress);
		return await redeemControlPlaneInviteCode(
			{
				code,
				chain: wallet.chain,
				chainId: wallet.chainId,
				address: wallet.address,
			},
			this.getClient(),
		);
	}

	async addToAllowlist(walletAddress: string, addedBy?: string): Promise<void> {
		const wallet = resolveWallet(walletAddress);
		const addedByWallet = addedBy ? resolveWallet(addedBy) : null;

		await addWalletToLaunchGateAllowlist(
			{
				chain: wallet.chain,
				chainId: wallet.chainId,
				address: wallet.address,
				...(addedByWallet
					? {
							addedByWallet: {
								chain: addedByWallet.chain,
								chainId: addedByWallet.chainId,
								address: addedByWallet.address,
								linkSource: "admin",
							},
						}
					: {}),
				reason: "admin allowlist",
			},
			this.getClient(),
		);
	}

	async removeFromAllowlist(walletAddress: string): Promise<void> {
		const wallet = resolveWallet(walletAddress);
		await removeWalletFromLaunchGateAllowlist(
			{
				chain: wallet.chain,
				chainId: wallet.chainId,
				address: wallet.address,
			},
			this.getClient(),
		);
	}

	async listAllowlist(): Promise<LaunchGateAllowlistEntry[]> {
		const merged = new Map<string, LaunchGateAllowlistEntry>(this.envAllowlist);

		if (this.hasControlPlane()) {
			const persistedEntries = await listLaunchGateAllowlist(this.getClient());
			for (const entry of persistedEntries) {
				const key = `${entry.chain}:${entry.chain_id}:${entry.normalized_address}`;
				const existing = merged.get(key);
				merged.set(key, {
					chain: entry.chain,
					chainId: entry.chain_id,
					address: entry.address,
					normalizedAddress: entry.normalized_address,
					source: existing ? "env+control_plane" : "control_plane",
					reason: entry.reason,
					createdAt: entry.created_at,
					updatedAt: entry.updated_at,
				});
			}
		}

		return Array.from(merged.values()).sort((left, right) => left.address.localeCompare(right.address));
	}

	async createInviteCode(input: {
		maxUses: number;
		createdBy: string;
		expiresAt?: string | null;
		notes?: string | null;
	}) {
		const createdByWallet = resolveWallet(input.createdBy);
		return await createControlPlaneInviteCode(
			{
				maxUses: input.maxUses,
				expiresAt: input.expiresAt,
				notes: input.notes,
				createdByWallet: {
					chain: createdByWallet.chain,
					chainId: createdByWallet.chainId,
					address: createdByWallet.address,
					linkSource: "admin",
				},
			},
			this.getClient(),
		);
	}

	async listInvites(): Promise<LaunchGateInviteRecord[]> {
		if (!this.hasControlPlane()) {
			return [];
		}

		const client = this.getClient();
		const [{ data: invites, error: invitesError }, { data: redemptions, error: redemptionsError }] = await Promise.all([
			client.from("control_plane_invite_codes").select("*").order("created_at", { ascending: false }),
			client.from("control_plane_invite_redemptions").select("*").order("created_at", { ascending: true }),
		]);

		if (invitesError) {
			throw new Error(`Failed to list invite codes: ${invitesError.message}`);
		}

		if (redemptionsError) {
			throw new Error(`Failed to list invite redemptions: ${redemptionsError.message}`);
		}

		const walletIdentityIds = Array.from(
			new Set(
				[
					...(invites || []).map((invite) => invite.created_by_wallet_identity_id),
					...(redemptions || []).map((redemption) => redemption.redeemed_by_wallet_identity_id),
				].filter((value): value is string => Boolean(value)),
			),
		);

		let walletIdentityMap = new Map<string, WalletIdentityRow>();
		if (walletIdentityIds.length > 0) {
			const { data: walletIdentities, error: walletIdentitiesError } = await client
				.from("control_plane_wallet_identities")
				.select("*")
				.in("id", walletIdentityIds);

			if (walletIdentitiesError) {
				throw new Error(`Failed to resolve invite wallet identities: ${walletIdentitiesError.message}`);
			}

			walletIdentityMap = new Map(
				(walletIdentities || []).map((walletIdentity) => [walletIdentity.id, walletIdentity]),
			);
		}

		const redemptionsByInvite = new Map<string, InviteRedemptionRow[]>();
		for (const redemption of redemptions || []) {
			const existing = redemptionsByInvite.get(redemption.invite_code_id) || [];
			existing.push(redemption);
			redemptionsByInvite.set(redemption.invite_code_id, existing);
		}

		return (invites || []).map((invite) => {
			const inviteRedemptions = redemptionsByInvite.get(invite.id) || [];
			return {
				id: invite.id,
				code: invite.code,
				maxUses: invite.max_uses,
				usedCount: invite.used_count,
				remainingUses: Math.max(invite.max_uses - invite.used_count, 0),
				expiresAt: invite.expires_at,
				disabledAt: invite.disabled_at,
				notes: invite.notes,
				createdBy: invite.created_by_wallet_identity_id
					? (walletIdentityMap.get(invite.created_by_wallet_identity_id)?.address ?? null)
					: null,
				usedBy: inviteRedemptions
					.map((redemption) => walletIdentityMap.get(redemption.redeemed_by_wallet_identity_id)?.address || null)
					.filter((address): address is string => Boolean(address)),
				active: this.isInviteActive(invite),
				createdAt: invite.created_at,
				updatedAt: invite.updated_at,
			};
		});
	}
}

export const launchGateService = new LaunchGateService();
