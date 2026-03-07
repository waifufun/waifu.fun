import { PublicKey } from "@solana/web3.js";
import logger from "@waifufun/logger";
import type { Connection } from "mongoose";
import Mongoose from "mongoose";
import { Pool, type PoolClient } from "pg";
import { getAddress } from "viem";
import { buildControlPlaneDdl } from "./control-plane-ddl.js";

const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_SCHEMA_NAME = "waifu";
const SOLANA_DEFAULT_CHAIN_ID = 101;

type RawMongoDocument = Record<string, unknown> & {
	_id?: unknown;
	createdAt?: unknown;
	updatedAt?: unknown;
};

type ChainValue = "solana" | "evm";

interface ControlPlaneBackfillOptions {
	mongoUri: string;
	postgresUrl: string;
	schemaName?: string | undefined;
	batchSize?: number | undefined;
	limit?: number | undefined;
	applyDdl?: boolean | undefined;
	dryRun?: boolean | undefined;
}

interface EntityStats {
	seen: number;
	upserted: number;
	skipped: number;
}

export interface ControlPlaneBackfillSummary {
	dryRun: boolean;
	schemaName: string;
	resolvedCollections: Partial<Record<CollectionKey, string>>;
	users: EntityStats;
	tokenControlPlane: EntityStats;
	runtimeFromTokens: EntityStats;
	runtimeFromAgents: EntityStats;
	launchGateAllowlist: EntityStats;
	inviteCodes: EntityStats;
	inviteCodeRedemptions: EntityStats;
	warningCount: number;
	warningSamples: string[];
}

interface CollectionMap {
	tokens: string | null;
	users: string | null;
	agents: string | null;
	launchGateAllowlist: string | null;
	inviteCodes: string | null;
}

type CollectionKey = keyof CollectionMap;

interface UserLookupRecord {
	walletAddress: string;
	mongoId: string | undefined;
}

interface UserRecord {
	walletAddress: string;
	sourceMongoId: string | undefined;
	displayName: string | undefined;
	avatarUrl: string | undefined;
	verified: boolean;
	suspended: boolean;
	twitter: string | undefined;
	points: number | undefined;
	weeklyPoints: number | undefined;
	adminRole: string | undefined;
	adminPermissions: string[] | undefined;
	adminCreatedBy: string | undefined;
	adminCreatedAt: Date | undefined;
	sourceCreatedAt: Date | undefined;
	sourceUpdatedAt: Date | undefined;
}

interface TokenControlPlaneRecord {
	chain: ChainValue;
	chainId: number;
	contractAddress: string;
	sourceMongoId: string | undefined;
	creatorWalletAddress: string | undefined;
	creatorUserId: string | undefined;
	creatorUserWalletAddress: string | undefined;
	launchType: string | undefined;
	launchPlatform: string | undefined;
	ownerClaimStatus: string | undefined;
	ownerWalletsSolana: string[];
	ownerWalletsEvm: string[];
	agentCharacterConfig:
		| {
				name: string | undefined;
				bio: string | undefined;
				avatar: string | undefined;
		  }
		| undefined;
	sourceCreatedAt: Date | undefined;
	sourceUpdatedAt: Date | undefined;
}

interface RuntimeAgentRecord {
	chain: ChainValue;
	chainId: number;
	contractAddress: string;
	sourceTokenMongoId: string | undefined;
	sourceAgentMongoId: string | undefined;
	cloudAgentId: string | undefined;
	runtimeProvider: string | undefined;
	agentStatus: string | undefined;
	agentLifecycleState: string | undefined;
	billingMode: string | undefined;
	infraReserveUsd: number | undefined;
	webUiUrl: string | undefined;
	bridgeUrl: string | undefined;
	suspendedReason: string | undefined;
	lastHeartbeatAt: Date | undefined;
	lastClaimedAt: Date | undefined;
	lastTradeAt: Date | undefined;
	suspendAt: Date | undefined;
	reviveAt: Date | undefined;
	sourceCreatedAt: Date | undefined;
	sourceUpdatedAt: Date | undefined;
}

interface AllowlistRecord {
	walletAddress: string;
	sourceMongoId: string | undefined;
	addedBy: string | undefined;
	sourceCreatedAt: Date | undefined;
	sourceUpdatedAt: Date | undefined;
}

interface InviteCodeRecord {
	code: string;
	sourceMongoId: string | undefined;
	maxUses: number;
	usedCount: number;
	createdBy: string | undefined;
	expiresAt: Date | undefined;
	active: boolean;
	sourceCreatedAt: Date | undefined;
	sourceUpdatedAt: Date | undefined;
}

interface InviteCodeRedemptionRecord {
	inviteCode: string;
	walletAddress: string;
	redeemedAt: Date | undefined;
	sourceInviteMongoId: string | undefined;
	sourcePosition: number | undefined;
}

export class ControlPlaneBackfill {
	private readonly pool: Pool;
	private mongoConnection: Connection | null = null;
	private readonly schemaName: string;
	private readonly batchSize: number;
	private readonly limit: number | undefined;
	private readonly dryRun: boolean;
	private readonly applyDdl: boolean;
	private readonly summary: ControlPlaneBackfillSummary;
	private readonly userLookup = new Map<string, UserLookupRecord>();
	private readonly warningSamples: string[] = [];
	private warningCount = 0;

	constructor(private readonly options: ControlPlaneBackfillOptions) {
		this.schemaName = options.schemaName ?? DEFAULT_SCHEMA_NAME;
		this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
		this.limit = options.limit;
		this.dryRun = options.dryRun ?? false;
		this.applyDdl = options.applyDdl ?? false;
		this.assertIdentifier(this.schemaName, "schema");

		const shouldUseSsl =
			!options.postgresUrl.includes("sslmode=disable") &&
			(options.postgresUrl.includes("sslmode=require") || options.postgresUrl.includes("supabase.co"));
		const connectionString = shouldUseSsl
			? options.postgresUrl.replace("sslmode=require", "sslmode=no-verify")
			: options.postgresUrl;

		this.pool = new Pool({
			connectionString,
			max: 5,
			ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
		});

		this.summary = {
			dryRun: this.dryRun,
			schemaName: this.schemaName,
			resolvedCollections: {},
			users: emptyStats(),
			tokenControlPlane: emptyStats(),
			runtimeFromTokens: emptyStats(),
			runtimeFromAgents: emptyStats(),
			launchGateAllowlist: emptyStats(),
			inviteCodes: emptyStats(),
			inviteCodeRedemptions: emptyStats(),
			warningCount: 0,
			warningSamples: [],
		};
	}

	/**
	 * Execution order:
	 * 1. Ensure the target Postgres schema exists (`--apply-ddl`) or assume it already exists.
	 * 2. Backfill Mongo users so creator wallet → user linkages can be resolved deterministically.
	 * 3. Backfill token control-plane rows from raw token documents.
	 * 4. Backfill runtime rows from token documents, then merge agent collection rows over the same contract key.
	 * 5. Backfill launch gate allowlist and invite code/redemption state if those collections exist.
	 *
	 * Env assumptions:
	 * - `MONGO_URI` points at the source control-plane Mongo database.
	 * - `DATABASE_URL`/`SUPABASE_DATABASE_URL`/`SUPABASE_DB_URL` points at the destination Postgres database.
	 * - The script is safe to re-run because every write is an UPSERT keyed by the natural token/wallet/code identity.
	 */
	async run(): Promise<ControlPlaneBackfillSummary> {
		try {
			logger.info({
				msg: "Starting Mongo -> Supabase control-plane backfill",
				schemaName: this.schemaName,
				dryRun: this.dryRun,
				batchSize: this.batchSize,
				limit: this.limit,
			});

			await this.connectMongo();
			const collections = await this.resolveCollections();

			if (this.applyDdl) {
				await this.ensureSchema();
			}

			await this.backfillUsers(collections.users);
			await this.backfillTokenControlPlane(collections.tokens);
			await this.backfillRuntimeFromTokens(collections.tokens);
			await this.backfillRuntimeFromAgents(collections.agents);
			await this.backfillLaunchGateAllowlist(collections.launchGateAllowlist);
			await this.backfillInviteCodes(collections.inviteCodes);

			this.summary.warningCount = this.warningCount;
			this.summary.warningSamples = [...this.warningSamples];
			logger.info({ msg: "Control-plane backfill complete", summary: this.summary });
			return this.summary;
		} finally {
			await this.close();
		}
	}

	private async connectMongo(): Promise<void> {
		const connection = Mongoose.createConnection(this.options.mongoUri, {
			serverSelectionTimeoutMS: 15_000,
			socketTimeoutMS: 30_000,
		});

		this.mongoConnection = await connection.asPromise();
	}

	private async resolveCollections(): Promise<CollectionMap> {
		const db = this.requireMongoDb();
		const collectionNames = new Set((await db.listCollections().toArray()).map((collection) => collection.name));

		const resolved: CollectionMap = {
			tokens: findCollectionName(collectionNames, ["tokens", "token"]),
			users: findCollectionName(collectionNames, ["users", "user"]),
			agents: findCollectionName(collectionNames, ["agents", "agent"]),
			launchGateAllowlist: findCollectionName(collectionNames, [
				"launchgateallowlists",
				"launch_gate_allowlists",
				"launch_gate_allowlist",
				"launchgateallowlist",
			]),
			inviteCodes: findCollectionName(collectionNames, ["invitecodes", "invite_codes", "invitecode", "invite_code"]),
		};

		for (const [key, collectionName] of Object.entries(resolved) as Array<[CollectionKey, string | null]>) {
			if (collectionName) {
				this.summary.resolvedCollections[key] = collectionName;
			} else {
				this.warn(`Mongo collection not found for ${key}; skipping that category.`);
			}
		}

		return resolved;
	}

	private async ensureSchema(): Promise<void> {
		if (this.dryRun) {
			logger.info({ msg: "Skipping DDL because dry-run mode is enabled", schemaName: this.schemaName });
			return;
		}

		await this.pool.query(buildControlPlaneDdl(this.schemaName));
	}

	private async backfillUsers(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: UserRecord[] = [];
		let processed = 0;
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.users.seen++;
			processed++;
			const record = this.mapUserRecord(doc);
			if (!record) {
				this.summary.users.skipped++;
				continue;
			}

			batch.push(record);
			this.userLookup.set(record.walletAddress, {
				walletAddress: record.walletAddress,
				mongoId: record.sourceMongoId,
			});

			if (batch.length >= this.batchSize) {
				await this.flushUsers(batch);
			}
		}

		await this.flushUsers(batch);
		logger.info({ msg: "Users backfill complete", processed });
	}

	private async flushUsers(batch: UserRecord[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.users.upserted += batch.length;
		if (this.dryRun) {
			batch.length = 0;
			return;
		}

		await this.withClient(async (client) => {
			await client.query("begin");
			try {
				for (const row of batch) {
					await client.query(
						`insert into ${this.tableName("users")} (
							wallet_address,
							source_mongo_id,
							display_name,
							avatar_url,
							verified,
							suspended,
							twitter,
							points,
							weekly_points,
							admin_role,
							admin_permissions,
							admin_created_by,
							admin_created_at,
							source_created_at,
							source_updated_at
						) values (
							$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15
						)
						on conflict (wallet_address) do update set
							source_mongo_id = excluded.source_mongo_id,
							display_name = excluded.display_name,
							avatar_url = excluded.avatar_url,
							verified = excluded.verified,
							suspended = excluded.suspended,
							twitter = excluded.twitter,
							points = excluded.points,
							weekly_points = excluded.weekly_points,
							admin_role = excluded.admin_role,
							admin_permissions = excluded.admin_permissions,
							admin_created_by = excluded.admin_created_by,
							admin_created_at = excluded.admin_created_at,
							source_created_at = excluded.source_created_at,
							source_updated_at = excluded.source_updated_at,
							backfilled_at = timezone('utc', now())`,
						[
							row.walletAddress,
							row.sourceMongoId,
							row.displayName,
							row.avatarUrl,
							row.verified,
							row.suspended,
							row.twitter,
							row.points,
							row.weeklyPoints,
							row.adminRole,
							JSON.stringify(row.adminPermissions ?? []),
							row.adminCreatedBy,
							row.adminCreatedAt,
							row.sourceCreatedAt,
							row.sourceUpdatedAt,
						],
					);
				}
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});

		batch.length = 0;
	}

	private async backfillTokenControlPlane(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: TokenControlPlaneRecord[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.tokenControlPlane.seen++;
			const record = this.mapTokenControlPlaneRecord(doc);
			if (!record) {
				this.summary.tokenControlPlane.skipped++;
				continue;
			}
			batch.push(record);
			if (batch.length >= this.batchSize) {
				await this.flushTokenControlPlane(batch);
			}
		}

		await this.flushTokenControlPlane(batch);
	}

	private async flushTokenControlPlane(batch: TokenControlPlaneRecord[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.tokenControlPlane.upserted += batch.length;
		if (this.dryRun) {
			batch.length = 0;
			return;
		}

		await this.withClient(async (client) => {
			await client.query("begin");
			try {
				for (const row of batch) {
					await client.query(
						`insert into ${this.tableName("token_control_plane")} (
							chain,
							chain_id,
							contract_address,
							source_mongo_id,
							creator_wallet_address,
							creator_user_id,
							creator_user_wallet_address,
							launch_type,
							launch_platform,
							owner_claim_status,
							owner_wallets_solana,
							owner_wallets_evm,
							agent_character_config,
							source_created_at,
							source_updated_at
						) values (
							$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15
						)
						on conflict (chain, chain_id, contract_address) do update set
							source_mongo_id = excluded.source_mongo_id,
							creator_wallet_address = excluded.creator_wallet_address,
							creator_user_id = excluded.creator_user_id,
							creator_user_wallet_address = excluded.creator_user_wallet_address,
							launch_type = excluded.launch_type,
							launch_platform = excluded.launch_platform,
							owner_claim_status = excluded.owner_claim_status,
							owner_wallets_solana = excluded.owner_wallets_solana,
							owner_wallets_evm = excluded.owner_wallets_evm,
							agent_character_config = excluded.agent_character_config,
							source_created_at = excluded.source_created_at,
							source_updated_at = excluded.source_updated_at,
							backfilled_at = timezone('utc', now())`,
						[
							row.chain,
							row.chainId,
							row.contractAddress,
							row.sourceMongoId,
							row.creatorWalletAddress,
							row.creatorUserId,
							row.creatorUserWalletAddress,
							row.launchType,
							row.launchPlatform,
							row.ownerClaimStatus,
							row.ownerWalletsSolana,
							row.ownerWalletsEvm,
							row.agentCharacterConfig ? JSON.stringify(row.agentCharacterConfig) : null,
							row.sourceCreatedAt,
							row.sourceUpdatedAt,
						],
					);
				}
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});

		batch.length = 0;
	}

	private async backfillRuntimeFromTokens(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: RuntimeAgentRecord[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.runtimeFromTokens.seen++;
			const record = this.mapRuntimeAgentFromToken(doc);
			if (!record) {
				this.summary.runtimeFromTokens.skipped++;
				continue;
			}
			batch.push(record);
			if (batch.length >= this.batchSize) {
				await this.flushRuntimeAgents(batch, "runtimeFromTokens");
			}
		}

		await this.flushRuntimeAgents(batch, "runtimeFromTokens");
	}

	private async backfillRuntimeFromAgents(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: RuntimeAgentRecord[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.runtimeFromAgents.seen++;
			const record = this.mapRuntimeAgentFromAgent(doc);
			if (!record) {
				this.summary.runtimeFromAgents.skipped++;
				continue;
			}
			batch.push(record);
			if (batch.length >= this.batchSize) {
				await this.flushRuntimeAgents(batch, "runtimeFromAgents");
			}
		}

		await this.flushRuntimeAgents(batch, "runtimeFromAgents");
	}

	private async flushRuntimeAgents(
		batch: RuntimeAgentRecord[],
		statsKey: "runtimeFromTokens" | "runtimeFromAgents",
	): Promise<void> {
		if (batch.length === 0) return;
		this.summary[statsKey].upserted += batch.length;
		if (this.dryRun) {
			batch.length = 0;
			return;
		}

		const tableName = this.tableName("runtime_agents");
		await this.withClient(async (client) => {
			await client.query("begin");
			try {
				for (const row of batch) {
					await client.query(
						`insert into ${tableName} (
							chain,
							chain_id,
							contract_address,
							source_token_mongo_id,
							source_agent_mongo_id,
							cloud_agent_id,
							runtime_provider,
							agent_status,
							agent_lifecycle_state,
							billing_mode,
							infra_reserve_usd,
							web_ui_url,
							bridge_url,
							suspended_reason,
							last_heartbeat_at,
							last_claimed_at,
							last_trade_at,
							suspend_at,
							revive_at,
							source_created_at,
							source_updated_at
						) values (
							$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
						)
						on conflict (chain, chain_id, contract_address) do update set
							source_token_mongo_id = coalesce(excluded.source_token_mongo_id, ${tableName}.source_token_mongo_id),
							source_agent_mongo_id = coalesce(excluded.source_agent_mongo_id, ${tableName}.source_agent_mongo_id),
							cloud_agent_id = coalesce(excluded.cloud_agent_id, ${tableName}.cloud_agent_id),
							runtime_provider = coalesce(excluded.runtime_provider, ${tableName}.runtime_provider),
							agent_status = coalesce(excluded.agent_status, ${tableName}.agent_status),
							agent_lifecycle_state = coalesce(excluded.agent_lifecycle_state, ${tableName}.agent_lifecycle_state),
							billing_mode = coalesce(excluded.billing_mode, ${tableName}.billing_mode),
							infra_reserve_usd = coalesce(excluded.infra_reserve_usd, ${tableName}.infra_reserve_usd),
							web_ui_url = coalesce(excluded.web_ui_url, ${tableName}.web_ui_url),
							bridge_url = coalesce(excluded.bridge_url, ${tableName}.bridge_url),
							suspended_reason = coalesce(excluded.suspended_reason, ${tableName}.suspended_reason),
							last_heartbeat_at = coalesce(excluded.last_heartbeat_at, ${tableName}.last_heartbeat_at),
							last_claimed_at = coalesce(excluded.last_claimed_at, ${tableName}.last_claimed_at),
							last_trade_at = coalesce(excluded.last_trade_at, ${tableName}.last_trade_at),
							suspend_at = coalesce(excluded.suspend_at, ${tableName}.suspend_at),
							revive_at = coalesce(excluded.revive_at, ${tableName}.revive_at),
							source_created_at = coalesce(excluded.source_created_at, ${tableName}.source_created_at),
							source_updated_at = coalesce(excluded.source_updated_at, ${tableName}.source_updated_at),
							backfilled_at = timezone('utc', now())`,
						[
							row.chain,
							row.chainId,
							row.contractAddress,
							row.sourceTokenMongoId,
							row.sourceAgentMongoId,
							row.cloudAgentId,
							row.runtimeProvider,
							row.agentStatus,
							row.agentLifecycleState,
							row.billingMode,
							row.infraReserveUsd,
							row.webUiUrl,
							row.bridgeUrl,
							row.suspendedReason,
							row.lastHeartbeatAt,
							row.lastClaimedAt,
							row.lastTradeAt,
							row.suspendAt,
							row.reviveAt,
							row.sourceCreatedAt,
							row.sourceUpdatedAt,
						],
					);
				}
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});

		batch.length = 0;
	}

	private async backfillLaunchGateAllowlist(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: AllowlistRecord[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.launchGateAllowlist.seen++;
			const record = this.mapAllowlistRecord(doc);
			if (!record) {
				this.summary.launchGateAllowlist.skipped++;
				continue;
			}
			batch.push(record);
			if (batch.length >= this.batchSize) {
				await this.flushAllowlist(batch);
			}
		}

		await this.flushAllowlist(batch);
	}

	private async flushAllowlist(batch: AllowlistRecord[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.launchGateAllowlist.upserted += batch.length;
		if (this.dryRun) {
			batch.length = 0;
			return;
		}

		await this.withClient(async (client) => {
			await client.query("begin");
			try {
				for (const row of batch) {
					await client.query(
						`insert into ${this.tableName("launch_gate_allowlist")} (
							wallet_address,
							source_mongo_id,
							added_by,
							source_created_at,
							source_updated_at
						) values ($1,$2,$3,$4,$5)
						on conflict (wallet_address) do update set
							source_mongo_id = excluded.source_mongo_id,
							added_by = excluded.added_by,
							source_created_at = excluded.source_created_at,
							source_updated_at = excluded.source_updated_at,
							backfilled_at = timezone('utc', now())`,
						[row.walletAddress, row.sourceMongoId, row.addedBy, row.sourceCreatedAt, row.sourceUpdatedAt],
					);
				}
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});

		batch.length = 0;
	}

	private async backfillInviteCodes(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const inviteBatch: InviteCodeRecord[] = [];
		const redemptionBatch: InviteCodeRedemptionRecord[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.inviteCodes.seen++;
			const mapped = this.mapInviteCode(doc);
			if (!mapped) {
				this.summary.inviteCodes.skipped++;
				continue;
			}

			inviteBatch.push(mapped.inviteCode);
			this.summary.inviteCodeRedemptions.seen += mapped.redemptions.length;
			redemptionBatch.push(...mapped.redemptions);

			if (inviteBatch.length >= this.batchSize || redemptionBatch.length >= this.batchSize) {
				await this.flushInviteCodes(inviteBatch);
				await this.flushInviteCodeRedemptions(redemptionBatch);
			}
		}

		await this.flushInviteCodes(inviteBatch);
		await this.flushInviteCodeRedemptions(redemptionBatch);
	}

	private async flushInviteCodes(batch: InviteCodeRecord[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.inviteCodes.upserted += batch.length;
		if (this.dryRun) {
			batch.length = 0;
			return;
		}

		await this.withClient(async (client) => {
			await client.query("begin");
			try {
				for (const row of batch) {
					await client.query(
						`insert into ${this.tableName("invite_codes")} (
							code,
							source_mongo_id,
							max_uses,
							used_count,
							created_by,
							expires_at,
							active,
							source_created_at,
							source_updated_at
						) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
						on conflict (code) do update set
							source_mongo_id = excluded.source_mongo_id,
							max_uses = excluded.max_uses,
							used_count = excluded.used_count,
							created_by = excluded.created_by,
							expires_at = excluded.expires_at,
							active = excluded.active,
							source_created_at = excluded.source_created_at,
							source_updated_at = excluded.source_updated_at,
							backfilled_at = timezone('utc', now())`,
						[
							row.code,
							row.sourceMongoId,
							row.maxUses,
							row.usedCount,
							row.createdBy,
							row.expiresAt,
							row.active,
							row.sourceCreatedAt,
							row.sourceUpdatedAt,
						],
					);
				}
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});

		batch.length = 0;
	}

	private async flushInviteCodeRedemptions(batch: InviteCodeRedemptionRecord[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.inviteCodeRedemptions.upserted += batch.length;
		if (this.dryRun) {
			batch.length = 0;
			return;
		}

		const tableName = this.tableName("invite_code_redemptions");
		await this.withClient(async (client) => {
			await client.query("begin");
			try {
				for (const row of batch) {
					await client.query(
						`insert into ${tableName} (
							invite_code,
							wallet_address,
							redeemed_at,
							source_invite_mongo_id,
							source_position
						) values ($1,$2,$3,$4,$5)
						on conflict (invite_code, wallet_address) do update set
							redeemed_at = coalesce(excluded.redeemed_at, ${tableName}.redeemed_at),
							source_invite_mongo_id = coalesce(excluded.source_invite_mongo_id, ${tableName}.source_invite_mongo_id),
							source_position = coalesce(excluded.source_position, ${tableName}.source_position),
							backfilled_at = timezone('utc', now())`,
						[row.inviteCode, row.walletAddress, row.redeemedAt, row.sourceInviteMongoId, row.sourcePosition],
					);
				}
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
		});

		batch.length = 0;
	}

	private mapUserRecord(doc: RawMongoDocument): UserRecord | null {
		const address = this.normalizeWalletAddress(doc.address, undefined);
		if (!address) {
			this.warn(`Skipping user ${mongoIdToString(doc._id) ?? "unknown"}: missing or invalid wallet address.`);
			return null;
		}

		return {
			walletAddress: address,
			sourceMongoId: mongoIdToString(doc._id),
			displayName: asOptionalString(doc.displayName),
			avatarUrl: asOptionalString(doc.avatar),
			verified: asBoolean(doc.verified),
			suspended: asBoolean(doc.suspended),
			twitter: asOptionalString(doc.twitter),
			points: asOptionalNumber(doc.points),
			weeklyPoints: asOptionalNumber(doc.weekly_points),
			adminRole: asOptionalString(doc.adminRole),
			adminPermissions: asStringArray(doc.adminPermissions),
			adminCreatedBy: this.normalizeWalletAddress(doc.adminCreatedBy, undefined),
			adminCreatedAt: asOptionalDate(doc.adminCreatedAt),
			sourceCreatedAt: asOptionalDate(doc.createdAt),
			sourceUpdatedAt: asOptionalDate(doc.updatedAt),
		};
	}

	private mapTokenControlPlaneRecord(doc: RawMongoDocument): TokenControlPlaneRecord | null {
		const tokenKey = this.extractTokenKey(doc, `token ${mongoIdToString(doc._id) ?? "unknown"}`);
		if (!tokenKey) {
			return null;
		}

		const creatorWalletAddress = this.normalizeWalletAddress(doc.creator, tokenKey.chain);
		const creatorLookup = creatorWalletAddress ? this.userLookup.get(creatorWalletAddress) : undefined;
		const launchType = asOptionalString(doc.launchType) ?? this.deriveLaunchType(doc.imported);
		const characterConfig = normalizeCharacterConfig(doc.agentCharacterConfig);
		const ownerWallets = normalizeOwnerWallets(doc.ownerWallets, this.warn.bind(this));

		return {
			...tokenKey,
			sourceMongoId: mongoIdToString(doc._id),
			creatorWalletAddress,
			creatorUserId: creatorLookup?.mongoId,
			creatorUserWalletAddress: creatorLookup?.walletAddress,
			launchType,
			launchPlatform: asOptionalString(doc.launchPlatform),
			ownerClaimStatus: asOptionalString(doc.ownerClaimStatus),
			ownerWalletsSolana: ownerWallets.solana,
			ownerWalletsEvm: ownerWallets.evm,
			agentCharacterConfig: characterConfig,
			sourceCreatedAt: asOptionalDate(doc.createdAt),
			sourceUpdatedAt: asOptionalDate(doc.updatedAt),
		};
	}

	private mapRuntimeAgentFromToken(doc: RawMongoDocument): RuntimeAgentRecord | null {
		const tokenKey = this.extractTokenKey(doc, `token-runtime ${mongoIdToString(doc._id) ?? "unknown"}`);
		if (!tokenKey) {
			return null;
		}

		const hasRuntimeData = [
			doc.cloudAgentId,
			doc.agentStatus,
			doc.agentLifecycleState,
			doc.billingMode,
			doc.infraReserveUsd,
			doc.webUiUrl,
			doc.lastClaimedAt,
			doc.lastTradeAt,
			doc.suspendAt,
			doc.reviveAt,
		].some((value) => value !== undefined && value !== null && value !== "");

		if (!hasRuntimeData) {
			return null;
		}

		return {
			...tokenKey,
			sourceTokenMongoId: mongoIdToString(doc._id),
			sourceAgentMongoId: undefined,
			cloudAgentId: asOptionalString(doc.cloudAgentId),
			runtimeProvider:
				asOptionalString(doc.runtimeProvider) ?? (asOptionalString(doc.cloudAgentId) ? "milady-cloud" : undefined),
			agentStatus: asOptionalString(doc.agentStatus),
			agentLifecycleState: asOptionalString(doc.agentLifecycleState),
			billingMode: asOptionalString(doc.billingMode),
			infraReserveUsd: asOptionalNumber(doc.infraReserveUsd),
			webUiUrl: asOptionalString(doc.webUiUrl),
			bridgeUrl: undefined,
			suspendedReason: undefined,
			lastHeartbeatAt: undefined,
			lastClaimedAt: asOptionalDate(doc.lastClaimedAt),
			lastTradeAt: asOptionalDate(doc.lastTradeAt),
			suspendAt: asOptionalDate(doc.suspendAt),
			reviveAt: asOptionalDate(doc.reviveAt),
			sourceCreatedAt: asOptionalDate(doc.createdAt),
			sourceUpdatedAt: asOptionalDate(doc.updatedAt),
		};
	}

	private mapRuntimeAgentFromAgent(doc: RawMongoDocument): RuntimeAgentRecord | null {
		const tokenKey = this.extractTokenKey(doc, `agent ${mongoIdToString(doc._id) ?? "unknown"}`);
		if (!tokenKey) {
			return null;
		}

		const hasRuntimeData = [
			doc.cloudAgentId,
			doc.runtimeProvider,
			doc.agentStatus,
			doc.webUiUrl,
			doc.bridgeUrl,
			doc.lastHeartbeatAt,
			doc.billingMode,
			doc.suspendedReason,
		].some((value) => value !== undefined && value !== null && value !== "");

		if (!hasRuntimeData) {
			return null;
		}

		return {
			...tokenKey,
			sourceTokenMongoId: undefined,
			sourceAgentMongoId: mongoIdToString(doc._id),
			cloudAgentId: asOptionalString(doc.cloudAgentId),
			runtimeProvider:
				asOptionalString(doc.runtimeProvider) ?? (asOptionalString(doc.cloudAgentId) ? "milady-cloud" : undefined),
			agentStatus: asOptionalString(doc.agentStatus),
			agentLifecycleState: undefined,
			billingMode: asOptionalString(doc.billingMode),
			infraReserveUsd: undefined,
			webUiUrl: asOptionalString(doc.webUiUrl),
			bridgeUrl: asOptionalString(doc.bridgeUrl),
			suspendedReason: asOptionalString(doc.suspendedReason),
			lastHeartbeatAt: asOptionalDate(doc.lastHeartbeatAt),
			lastClaimedAt: undefined,
			lastTradeAt: undefined,
			suspendAt: undefined,
			reviveAt: undefined,
			sourceCreatedAt: asOptionalDate(doc.createdAt),
			sourceUpdatedAt: asOptionalDate(doc.updatedAt),
		};
	}

	private mapAllowlistRecord(doc: RawMongoDocument): AllowlistRecord | null {
		const walletAddress = this.normalizeWalletAddress(doc.walletAddress, undefined);
		if (!walletAddress) {
			this.warn(`Skipping allowlist row ${mongoIdToString(doc._id) ?? "unknown"}: invalid wallet address.`);
			return null;
		}

		return {
			walletAddress,
			sourceMongoId: mongoIdToString(doc._id),
			addedBy: this.normalizeWalletAddress(doc.addedBy, undefined),
			sourceCreatedAt: asOptionalDate(doc.createdAt),
			sourceUpdatedAt: asOptionalDate(doc.updatedAt),
		};
	}

	private mapInviteCode(
		doc: RawMongoDocument,
	): { inviteCode: InviteCodeRecord; redemptions: InviteCodeRedemptionRecord[] } | null {
		const code = normalizeInviteCode(doc.code);
		if (!code) {
			this.warn(`Skipping invite ${mongoIdToString(doc._id) ?? "unknown"}: missing code.`);
			return null;
		}

		const usedBy = normalizeWalletStringArray(doc.usedBy, undefined, this.warn.bind(this));
		const explicitRedemptions = extractExplicitRedemptions(doc, code, mongoIdToString(doc._id), this.warn.bind(this));
		const redemptions =
			explicitRedemptions.length > 0
				? explicitRedemptions
				: usedBy.map((walletAddress, index) => ({
						inviteCode: code,
						walletAddress,
						redeemedAt: undefined,
						sourceInviteMongoId: mongoIdToString(doc._id),
						sourcePosition: index,
					}));

		const usedCount = asOptionalInteger(doc.usedCount) ?? redemptions.length;
		if (usedCount !== redemptions.length) {
			this.warn(
				`Invite ${code} has usedCount=${usedCount} but ${redemptions.length} redemption rows were derivable from Mongo.`,
			);
		}

		return {
			inviteCode: {
				code,
				sourceMongoId: mongoIdToString(doc._id),
				maxUses: asOptionalInteger(doc.maxUses) ?? Math.max(usedCount, 1),
				usedCount,
				createdBy: this.normalizeWalletAddress(doc.createdBy, undefined),
				expiresAt: asOptionalDate(doc.expiresAt),
				active: doc.active === undefined ? true : asBoolean(doc.active),
				sourceCreatedAt: asOptionalDate(doc.createdAt),
				sourceUpdatedAt: asOptionalDate(doc.updatedAt),
			},
			redemptions,
		};
	}

	private extractTokenKey(
		doc: RawMongoDocument,
		context: string,
	): { chain: ChainValue; chainId: number; contractAddress: string } | null {
		const chain = normalizeChain(doc.chain, doc.chainId, doc.contractAddress);
		if (!chain) {
			this.warn(`Skipping ${context}: unable to determine chain.`);
			return null;
		}

		const chainId = normalizeChainId(chain, doc.chainId);
		if (!chainId) {
			this.warn(`Skipping ${context}: missing chainId for ${chain} token.`);
			return null;
		}

		const contractAddress = this.normalizeWalletAddress(doc.contractAddress, chain);
		if (!contractAddress) {
			this.warn(`Skipping ${context}: invalid contractAddress.`);
			return null;
		}

		return {
			chain,
			chainId,
			contractAddress,
		};
	}

	private deriveLaunchType(importedValue: unknown): string {
		return asBoolean(importedValue) ? "imported" : "native";
	}

	private normalizeWalletAddress(address: unknown, chainHint: ChainValue | undefined): string | undefined {
		const value = asOptionalString(address);
		if (!value) return undefined;

		try {
			if (value.startsWith("0x") || chainHint === "evm") {
				return getAddress(value);
			}
			return new PublicKey(value).toBase58();
		} catch {
			return undefined;
		}
	}

	private limitCursor<T extends { limit(value: number): T }>(cursor: T, limit?: number): T {
		if (limit && limit > 0) {
			return cursor.limit(limit);
		}

		return cursor;
	}

	private tableName(table: string): string {
		this.assertIdentifier(table, "table");
		return `"${this.schemaName}"."${table}"`;
	}

	private assertIdentifier(input: string, label: string): void {
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
			throw new Error(`Invalid ${label} identifier: ${input}`);
		}
	}

	private requireMongoDb() {
		const db = this.mongoConnection?.db;
		if (!db) {
			throw new Error("Mongo connection is not ready");
		}
		return db;
	}

	private async withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
		const client = await this.pool.connect();
		try {
			return await callback(client);
		} finally {
			client.release();
		}
	}

	private warn(message: string): void {
		this.warningCount++;
		if (this.warningSamples.length < 25) {
			this.warningSamples.push(message);
		}
		logger.warn(message);
	}

	private async close(): Promise<void> {
		await Promise.allSettled([this.mongoConnection?.close(), this.pool.end()]);
	}
}

function emptyStats(): EntityStats {
	return { seen: 0, upserted: 0, skipped: 0 };
}

function findCollectionName(collectionNames: Set<string>, candidates: string[]): string | null {
	for (const candidate of candidates) {
		if (collectionNames.has(candidate)) {
			return candidate;
		}
	}

	return null;
}

function mongoIdToString(value: unknown): string | undefined {
	if (!value) return undefined;
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null && "toString" in value && typeof value.toString === "function") {
		const stringValue = value.toString();
		return stringValue === "[object Object]" ? undefined : stringValue;
	}
	return undefined;
}

function asOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function asOptionalInteger(value: unknown): number | undefined {
	const numeric = asOptionalNumber(value);
	if (numeric === undefined) return undefined;
	return Number.isInteger(numeric) ? numeric : Math.trunc(numeric);
}

function asBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		return normalized === "true" || normalized === "1" || normalized === "yes";
	}
	return false;
}

function asOptionalDate(value: unknown): Date | undefined {
	if (!value) return undefined;
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? undefined : date;
	}
	if (typeof value === "object" && value !== null && "$date" in value) {
		return asOptionalDate((value as { $date?: unknown }).$date);
	}
	return undefined;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return uniqueStrings(
		value.map((entry) => asOptionalString(entry)).filter((entry): entry is string => Boolean(entry)),
	);
}

function normalizeCharacterConfig(value: unknown): TokenControlPlaneRecord["agentCharacterConfig"] | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const normalized = {
		name: asOptionalString(record.name),
		bio: asOptionalString(record.bio),
		avatar: asOptionalString(record.avatar),
	};

	if (!normalized.name && !normalized.bio && !normalized.avatar) {
		return undefined;
	}

	return normalized;
}

function normalizeChain(
	chainValue: unknown,
	chainIdValue: unknown,
	contractAddressValue: unknown,
): ChainValue | undefined {
	const chain = asOptionalString(chainValue)?.toLowerCase();
	if (chain === "solana" || chain === "evm") return chain;

	const contractAddress = asOptionalString(contractAddressValue);
	if (contractAddress?.startsWith("0x")) return "evm";

	const chainId = asOptionalInteger(chainIdValue);
	if (chainId === 101 || chainId === 102 || chainId === 103) return "solana";
	if (chainId !== undefined) return "evm";

	return undefined;
}

function normalizeChainId(chain: ChainValue, value: unknown): number | undefined {
	const chainId = asOptionalInteger(value);
	if (chainId !== undefined) return chainId;
	return chain === "solana" ? SOLANA_DEFAULT_CHAIN_ID : undefined;
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}

function normalizeOwnerWallets(value: unknown, warn: (message: string) => void): { solana: string[]; evm: string[] } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { solana: [], evm: [] };
	}

	const record = value as Record<string, unknown>;
	return {
		solana: normalizeWalletStringArray(record.solana, "solana", warn),
		evm: normalizeWalletStringArray(record.evm, "evm", warn),
	};
}

function normalizeWalletStringArray(
	value: unknown,
	chainHint: ChainValue | undefined,
	warn: (message: string) => void,
): string[] {
	if (!Array.isArray(value)) return [];

	const normalized = new Set<string>();
	for (const entry of value) {
		const stringValue = asOptionalString(entry);
		if (!stringValue) continue;
		try {
			if (stringValue.startsWith("0x") || chainHint === "evm") {
				normalized.add(getAddress(stringValue));
			} else {
				normalized.add(new PublicKey(stringValue).toBase58());
			}
		} catch {
			warn(`Skipping invalid wallet value ${stringValue} while normalizing ${chainHint ?? "mixed"} wallet array.`);
		}
	}

	return Array.from(normalized);
}

function normalizeInviteCode(value: unknown): string | undefined {
	const code = asOptionalString(value);
	return code ? code.toUpperCase() : undefined;
}

function extractExplicitRedemptions(
	doc: RawMongoDocument,
	inviteCode: string,
	sourceInviteMongoId: string | undefined,
	warn: (message: string) => void,
): InviteCodeRedemptionRecord[] {
	const rawRedemptions = doc.redemptions;
	if (!Array.isArray(rawRedemptions)) return [];

	const redemptions: InviteCodeRedemptionRecord[] = [];
	for (const [index, entry] of rawRedemptions.entries()) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			continue;
		}
		const redemption = entry as Record<string, unknown>;
		const walletAddress = normalizeWalletStringArray(
			[redemption.walletAddress ?? redemption.wallet ?? redemption.address ?? redemption.usedBy],
			undefined,
			warn,
		)[0];
		if (!walletAddress) {
			continue;
		}
		redemptions.push({
			inviteCode,
			walletAddress,
			redeemedAt: asOptionalDate(redemption.redeemedAt ?? redemption.usedAt ?? redemption.createdAt),
			sourceInviteMongoId,
			sourcePosition: index,
		});
	}

	return redemptions;
}
