import { randomBytes } from "node:crypto";
import DB from "@waifufun/database";
import type { AddressLike } from "@waifufun/types";
import { getChecksummedAddress } from "@waifufun/utils";

export interface LaunchGateConfig {
	enabled: boolean;
	allowedWallets: string[];
	inviteCodes: Map<string, { uses: number; maxUses: number; createdBy: string }>;
}

function normalizeWalletAddress(walletAddress: string): string {
	const trimmed = walletAddress.trim();
	if (!trimmed) {
		throw new Error("Wallet address is required");
	}

	if (trimmed.startsWith("0x")) {
		return getChecksummedAddress(trimmed as AddressLike, "evm");
	}

	return getChecksummedAddress(trimmed as AddressLike, "solana");
}

function normalizeInviteCode(code: string): string {
	return code.trim().toUpperCase();
}

export class LaunchGateService {
	private envAllowlist = new Set<string>();
	private readonly enabled: boolean;

	constructor() {
		this.enabled = process.env.LAUNCH_GATE_ENABLED ? process.env.LAUNCH_GATE_ENABLED === "true" : true;

		const envWallets = process.env.LAUNCH_GATE_WALLETS
			? process.env.LAUNCH_GATE_WALLETS.split(",")
					.map((wallet) => wallet.trim())
					.filter(Boolean)
			: [];

		for (const wallet of envWallets) {
			try {
				this.envAllowlist.add(normalizeWalletAddress(wallet));
			} catch (_error) {
				console.warn(`[LaunchGate] Skipping invalid allowlisted wallet: ${wallet}`);
			}
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	getConfig(): LaunchGateConfig {
		return {
			enabled: this.enabled,
			allowedWallets: Array.from(this.envAllowlist).sort((a, b) => a.localeCompare(b)),
			inviteCodes: new Map(),
		};
	}

	async canCreate(walletAddress: string): Promise<{ allowed: boolean; reason?: string }> {
		if (!this.isEnabled()) {
			return { allowed: true };
		}

		const normalizedWallet = normalizeWalletAddress(walletAddress);
		if (this.envAllowlist.has(normalizedWallet)) {
			return { allowed: true };
		}

		const persistedAllowlistEntry = await DB.LaunchGateAllowlist.findOne({ walletAddress: normalizedWallet }).lean();
		if (persistedAllowlistEntry) {
			return { allowed: true };
		}

		const existingInviteUsage = await DB.InviteCode.findOne({
			usedBy: normalizedWallet,
			active: true,
			$or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
		}).lean();

		if (existingInviteUsage) {
			return { allowed: true };
		}

		return {
			allowed: false,
			reason: "This wallet is not on the curated launch allowlist. Enter a valid invite code or apply for access.",
		};
	}

	async validateInviteCode(code: string): Promise<{ valid: boolean; remainingUses?: number }> {
		const normalizedCode = normalizeInviteCode(code);
		if (!normalizedCode) {
			return { valid: false };
		}

		const invite = await DB.InviteCode.findOne({
			code: normalizedCode,
			active: true,
			$or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
		}).lean();

		if (!invite) {
			return { valid: false };
		}

		const remainingUses = Math.max(invite.maxUses - invite.usedCount, 0);
		if (remainingUses <= 0) {
			return { valid: false };
		}

		return {
			valid: true,
			remainingUses,
		};
	}

	async useInviteCode(code: string, walletAddress: string): Promise<boolean> {
		const normalizedCode = normalizeInviteCode(code);
		const normalizedWallet = normalizeWalletAddress(walletAddress);

		const result = await DB.InviteCode.updateOne(
			{
				code: normalizedCode,
				active: true,
				usedBy: { $ne: normalizedWallet },
				$expr: { $lt: ["$usedCount", "$maxUses"] },
				$or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
			},
			{
				$inc: { usedCount: 1 },
				$addToSet: { usedBy: normalizedWallet },
			},
		);

		if (result.modifiedCount > 0) {
			return true;
		}

		const existingInvite = await DB.InviteCode.findOne({ code: normalizedCode, usedBy: normalizedWallet }).lean();
		return !!existingInvite;
	}

	async addToAllowlist(walletAddress: string, addedBy?: string): Promise<void> {
		const normalizedWallet = normalizeWalletAddress(walletAddress);
		this.envAllowlist.add(normalizedWallet);

		await DB.LaunchGateAllowlist.updateOne(
			{ walletAddress: normalizedWallet },
			{
				$set: {
					walletAddress: normalizedWallet,
					...(addedBy ? { addedBy: normalizeWalletAddress(addedBy) } : {}),
				},
			},
			{ upsert: true },
		);

		process.env.LAUNCH_GATE_WALLETS = (await this.listAllowlist()).join(",");
	}

	async removeFromAllowlist(walletAddress: string): Promise<void> {
		const normalizedWallet = normalizeWalletAddress(walletAddress);
		this.envAllowlist.delete(normalizedWallet);
		await DB.LaunchGateAllowlist.deleteOne({ walletAddress: normalizedWallet });
		process.env.LAUNCH_GATE_WALLETS = (await this.listAllowlist()).join(",");
	}

	async listAllowlist(): Promise<string[]> {
		const persistedEntries = await DB.LaunchGateAllowlist.find({}).select("walletAddress").lean();
		return Array.from(
			new Set([
				...Array.from(this.envAllowlist),
				...persistedEntries.map((entry) => entry.walletAddress),
			]),
		).sort((a, b) => a.localeCompare(b));
	}

	async generateInviteCode(maxUses: number, createdBy: string): Promise<string> {
		if (!Number.isFinite(maxUses) || maxUses < 1) {
			throw new Error("maxUses must be greater than 0");
		}

		const normalizedCreator = normalizeWalletAddress(createdBy);

		for (let attempt = 0; attempt < 5; attempt++) {
			const code = `WAIFU-${randomBytes(4).toString("hex").toUpperCase()}`;
			try {
				await DB.InviteCode.create({
					code,
					maxUses,
					createdBy: normalizedCreator,
				});
				return code;
			} catch (error) {
				const mongoError = error as { code?: number };
				if (mongoError?.code !== 11000) {
					throw error;
				}
			}
		}

		throw new Error("Unable to generate a unique invite code");
	}

	async listInvites() {
		return DB.InviteCode.find({})
			.select("code maxUses usedCount usedBy createdBy expiresAt active createdAt updatedAt")
			.sort({ createdAt: -1 })
			.lean();
	}
}

export const launchGateService = new LaunchGateService();
export { normalizeInviteCode, normalizeWalletAddress };
