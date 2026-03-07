import { randomBytes } from "node:crypto";
import logger from "@waifufun/logger";
import type { AddressLike } from "@waifufun/types";
import { getChecksummedAddress } from "@waifufun/utils";
import { Pool, type PoolClient } from "pg";

interface LaunchGateInviteRecord {
	code: string;
	maxUses: number;
	usedCount: number;
	usedBy: string[];
	createdBy: string;
	expiresAt: Date | null;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
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

function getLaunchGateDatabaseUrl(): string | undefined {
	return process.env.LAUNCH_GATE_DATABASE_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
}

function shouldUseSsl(connectionString: string): boolean {
	return connectionString.includes("supabase") || /sslmode=require/i.test(connectionString);
}

export class LaunchGateService {
	private readonly envAllowlist = new Set<string>();
	private readonly enabled: boolean;
	private readonly pool?: Pool;
	private ensureTablesPromise?: Promise<void>;

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
				logger.warn(`[LaunchGate] Skipping invalid allowlisted wallet: ${wallet}`);
			}
		}

		const connectionString = getLaunchGateDatabaseUrl();
		if (connectionString) {
			this.pool = new Pool({
				connectionString,
				ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
			});
		} else if (this.enabled) {
			logger.warn("[LaunchGate] DATABASE_URL is not configured. Persisted Supabase launch gating is unavailable.");
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	private async ensureTables(): Promise<void> {
		if (!this.pool) {
			return;
		}

		if (!this.ensureTablesPromise) {
			this.ensureTablesPromise = (async () => {
				const client = await this.pool?.connect();
				if (!client) {
					return;
				}

				try {
					await client.query(`
						create table if not exists public.launch_gate_allowlist (
							wallet_address text primary key,
							added_by text,
							created_at timestamptz not null default timezone('utc', now()),
							updated_at timestamptz not null default timezone('utc', now())
						);

						create table if not exists public.launch_gate_invites (
							code text primary key,
							max_uses integer not null check (max_uses > 0),
							created_by text not null,
							expires_at timestamptz,
							active boolean not null default true,
							created_at timestamptz not null default timezone('utc', now()),
							updated_at timestamptz not null default timezone('utc', now())
						);

						create table if not exists public.launch_gate_invite_redemptions (
							invite_code text not null references public.launch_gate_invites(code) on delete cascade,
							wallet_address text not null,
							redeemed_at timestamptz not null default timezone('utc', now()),
							primary key (invite_code, wallet_address)
						);

						create index if not exists idx_launch_gate_redemptions_wallet
							on public.launch_gate_invite_redemptions (wallet_address);

						create index if not exists idx_launch_gate_redemptions_invite_redeemed
							on public.launch_gate_invite_redemptions (invite_code, redeemed_at desc);

						create index if not exists idx_launch_gate_invites_active_expires
							on public.launch_gate_invites (active, expires_at);
					`);
				} finally {
					client.release();
				}
			})();
		}

		await this.ensureTablesPromise;
	}

	private async withClient<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
		if (!this.pool) {
			throw new Error("Launch gate persistence is not configured. Set DATABASE_URL to Supabase/Postgres.");
		}

		await this.ensureTables();
		const client = await this.pool.connect();
		try {
			return await handler(client);
		} finally {
			client.release();
		}
	}

	private async withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
		return this.withClient(async (client) => {
			await client.query("begin");
			try {
				const result = await handler(client);
				await client.query("commit");
				return result;
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});
	}

	private async getInviteByCode(
		client: PoolClient,
		code: string,
		lockRow = false,
	): Promise<LaunchGateInviteRecord | null> {
		const query = `
			select
				i.code,
				i.max_uses as "maxUses",
				coalesce((
					select count(*)::int
					from public.launch_gate_invite_redemptions redemptions
					where redemptions.invite_code = i.code
				), 0) as "usedCount",
				coalesce((
					select array_agg(redemptions.wallet_address order by redemptions.redeemed_at asc)
					from public.launch_gate_invite_redemptions redemptions
					where redemptions.invite_code = i.code
				), '{}') as "usedBy",
				i.created_by as "createdBy",
				i.expires_at as "expiresAt",
				i.active,
				i.created_at as "createdAt",
				i.updated_at as "updatedAt"
			from public.launch_gate_invites i
			where i.code = $1
			${lockRow ? "for update" : ""}
		`;

		const result = await client.query<LaunchGateInviteRecord>(query, [code]);
		return result.rows[0] || null;
	}

	private isInviteUsable(
		invite: Pick<LaunchGateInviteRecord, "active" | "expiresAt" | "maxUses" | "usedCount">,
	): boolean {
		if (!invite.active) {
			return false;
		}

		if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
			return false;
		}

		return invite.usedCount < invite.maxUses;
	}

	private async listPersistedAllowlist(): Promise<string[]> {
		if (!this.pool) {
			return [];
		}

		return this.withClient(async (client) => {
			const result = await client.query<{ wallet_address: string }>(
				"select wallet_address from public.launch_gate_allowlist order by wallet_address asc",
			);
			return result.rows.map((row) => row.wallet_address);
		});
	}

	async canCreate(walletAddress: string): Promise<{ allowed: boolean; reason?: string }> {
		if (!this.isEnabled()) {
			return { allowed: true };
		}

		const normalizedWallet = normalizeWalletAddress(walletAddress);
		if (this.envAllowlist.has(normalizedWallet)) {
			return { allowed: true };
		}

		if (this.pool) {
			const access = await this.withClient(async (client) => {
				const result = await client.query<{ allowlisted: boolean; redeemed: boolean }>(
					`
						select
							exists(
								select 1
								from public.launch_gate_allowlist allowlist
								where allowlist.wallet_address = $1
							) as allowlisted,
							exists(
								select 1
								from public.launch_gate_invite_redemptions redemptions
								where redemptions.wallet_address = $1
							) as redeemed
					`,
					[normalizedWallet],
				);

				return result.rows[0];
			});

			if (access?.allowlisted || access?.redeemed) {
				return { allowed: true };
			}
		}

		return {
			allowed: false,
			reason: "This wallet is not on the curated launch allowlist. Enter a valid invite code or apply for access.",
		};
	}

	async validateInviteCode(code: string): Promise<{ valid: boolean; remainingUses?: number }> {
		const normalizedCode = normalizeInviteCode(code);
		if (!normalizedCode || !this.pool) {
			return { valid: false };
		}

		const invite = await this.withClient(async (client) => this.getInviteByCode(client, normalizedCode));
		if (!invite || !this.isInviteUsable(invite)) {
			return { valid: false };
		}

		return {
			valid: true,
			remainingUses: Math.max(invite.maxUses - invite.usedCount, 0),
		};
	}

	async useInviteCode(code: string, walletAddress: string): Promise<boolean> {
		const normalizedCode = normalizeInviteCode(code);
		const normalizedWallet = normalizeWalletAddress(walletAddress);

		return this.withTransaction(async (client) => {
			const invite = await this.getInviteByCode(client, normalizedCode, true);
			if (!invite || !this.isInviteUsable(invite)) {
				return false;
			}

			const existingRedemption = await client.query(
				`
					select 1
					from public.launch_gate_invite_redemptions
					where invite_code = $1 and wallet_address = $2
				`,
				[normalizedCode, normalizedWallet],
			);

			if (existingRedemption.rowCount && existingRedemption.rowCount > 0) {
				return true;
			}

			if (invite.usedCount >= invite.maxUses) {
				return false;
			}

			const insertResult = await client.query(
				`
					insert into public.launch_gate_invite_redemptions (invite_code, wallet_address)
					values ($1, $2)
					on conflict do nothing
				`,
				[normalizedCode, normalizedWallet],
			);

			if (!insertResult.rowCount || insertResult.rowCount === 0) {
				const alreadyRedeemed = await client.query(
					`
						select 1
						from public.launch_gate_invite_redemptions
						where invite_code = $1 and wallet_address = $2
					`,
					[normalizedCode, normalizedWallet],
				);
				return !!alreadyRedeemed.rowCount;
			}

			await client.query("update public.launch_gate_invites set updated_at = timezone('utc', now()) where code = $1", [
				normalizedCode,
			]);

			return true;
		});
	}

	async addToAllowlist(walletAddress: string, addedBy?: string): Promise<void> {
		const normalizedWallet = normalizeWalletAddress(walletAddress);
		const normalizedAddedBy = addedBy ? normalizeWalletAddress(addedBy) : null;

		await this.withClient(async (client) => {
			await client.query(
				`
					insert into public.launch_gate_allowlist (wallet_address, added_by)
					values ($1, $2)
					on conflict (wallet_address)
					do update set
						added_by = excluded.added_by,
						updated_at = timezone('utc', now())
				`,
				[normalizedWallet, normalizedAddedBy],
			);
		});
	}

	async removeFromAllowlist(walletAddress: string): Promise<void> {
		const normalizedWallet = normalizeWalletAddress(walletAddress);
		await this.withClient(async (client) => {
			await client.query("delete from public.launch_gate_allowlist where wallet_address = $1", [normalizedWallet]);
		});
	}

	async listAllowlist(): Promise<string[]> {
		const persistedEntries = await this.listPersistedAllowlist();
		return Array.from(new Set([...Array.from(this.envAllowlist), ...persistedEntries])).sort((a, b) =>
			a.localeCompare(b),
		);
	}

	async generateInviteCode(maxUses: number, createdBy: string): Promise<string> {
		if (!Number.isFinite(maxUses) || maxUses < 1) {
			throw new Error("maxUses must be greater than 0");
		}

		const normalizedCreator = normalizeWalletAddress(createdBy);

		for (let attempt = 0; attempt < 5; attempt++) {
			const code = `WAIFU-${randomBytes(4).toString("hex").toUpperCase()}`;

			try {
				await this.withClient(async (client) => {
					await client.query(
						`
							insert into public.launch_gate_invites (code, max_uses, created_by)
							values ($1, $2, $3)
						`,
						[code, Math.floor(maxUses), normalizedCreator],
					);
				});
				return code;
			} catch (error) {
				const pgError = error as { code?: string };
				if (pgError?.code !== "23505") {
					throw error;
				}
			}
		}

		throw new Error("Unable to generate a unique invite code");
	}

	async listInvites(): Promise<LaunchGateInviteRecord[]> {
		if (!this.pool) {
			return [];
		}

		return this.withClient(async (client) => {
			const result = await client.query<LaunchGateInviteRecord>(`
				select
					i.code,
					i.max_uses as "maxUses",
					coalesce(redemptions.used_count, 0)::int as "usedCount",
					coalesce(redemptions.used_by, '{}') as "usedBy",
					i.created_by as "createdBy",
					i.expires_at as "expiresAt",
					i.active,
					i.created_at as "createdAt",
					i.updated_at as "updatedAt"
				from public.launch_gate_invites i
				left join (
					select
						invite_code,
						count(*)::int as used_count,
						array_agg(wallet_address order by redeemed_at asc) as used_by
					from public.launch_gate_invite_redemptions
					group by invite_code
				) redemptions on redemptions.invite_code = i.code
				order by i.created_at desc
			`);

			return result.rows.map((invite) => ({
				...invite,
				usedBy: invite.usedBy || [],
			}));
		});
	}
}

export const launchGateService = new LaunchGateService();
export { normalizeInviteCode, normalizeWalletAddress };
