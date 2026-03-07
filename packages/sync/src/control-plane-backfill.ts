import {
	type ControlPlaneAgentStatus,
	type ControlPlaneBillingMode,
	type ControlPlaneChain,
	type ControlPlaneInsert,
	type ControlPlaneLaunchPlatform,
	type ControlPlaneLaunchType,
	type ControlPlaneLifecycleState,
	type ControlPlaneOwnershipStatus,
	type ControlPlaneRow,
	type ControlPlaneRuntimeProvider,
	type ControlPlaneWalletLinkSource,
	type Json,
	normalizeControlPlaneInviteCode,
	normalizeControlPlaneTokenKey,
	normalizeControlPlaneWalletKey,
} from "@waifufun/control-plane";
import logger from "@waifufun/logger";
import type { Connection } from "mongoose";
import Mongoose from "mongoose";
import { Pool, type PoolClient } from "pg";

const DEFAULT_BATCH_SIZE = 250;
const DEFAULT_SOLANA_CHAIN_ID = 101;
const DEFAULT_EVM_CHAIN_ID = 8453;
const ZERO_DATE_ISO = "1970-01-01T00:00:00.000Z";
const CANONICAL_TABLE_NAMES = [
	"control_plane_users",
	"control_plane_wallet_identities",
	"control_plane_token_ownerships",
	"control_plane_token_runtime_states",
	"control_plane_launch_gate_allowlist",
	"control_plane_invite_codes",
	"control_plane_invite_redemptions",
] as const;

const WALLET_LINK_SOURCE_RANK: Record<ControlPlaneWalletLinkSource, number> = {
	import: 0,
	sync: 1,
	manual: 2,
	admin: 3,
	self_claim: 4,
};

const OWNERSHIP_STATUS_RANK: Record<ControlPlaneOwnershipStatus, number> = {
	unclaimed: 0,
	claimed: 1,
	verified: 2,
	disputed: 3,
};

const AGENT_STATUS_RANK: Record<ControlPlaneAgentStatus, number> = {
	none: 0,
	provisioning: 1,
	running: 2,
	suspended: 3,
	failed: 4,
	deleted: 5,
};

type RawMongoDocument = Record<string, unknown> & {
	_id?: unknown;
	createdAt?: unknown;
	updatedAt?: unknown;
};

type WalletIdentityRow = ControlPlaneRow<"control_plane_wallet_identities">;
type TokenOwnershipRow = ControlPlaneRow<"control_plane_token_ownerships">;
type TokenRuntimeStateRow = ControlPlaneRow<"control_plane_token_runtime_states">;
type AllowlistRow = ControlPlaneRow<"control_plane_launch_gate_allowlist">;
type InviteCodeRow = ControlPlaneRow<"control_plane_invite_codes">;
type InviteRedemptionRow = ControlPlaneRow<"control_plane_invite_redemptions">;

type CollectionMap = {
	tokens: string | null;
	users: string | null;
	agents: string | null;
	launchGateAllowlist: string | null;
	inviteCodes: string | null;
};

type CollectionKey = keyof CollectionMap;

type JsonRecord = Record<string, Json>;

type WalletSeed = {
	chain: ControlPlaneChain;
	chainId: number;
	address: string;
	normalizedAddress: string;
	label?: string | null;
	linkSource?: ControlPlaneWalletLinkSource;
	verifiedAt?: string | null;
	lastSeenAt?: string | null;
	userId?: string | null;
	metadata?: JsonRecord;
};

type OwnershipSeed = {
	chain: ControlPlaneChain;
	chainId: number;
	contractAddress: string;
	normalizedContractAddress: string;
	launchType?: ControlPlaneLaunchType | null;
	launchPlatform?: ControlPlaneLaunchPlatform;
	ownerClaimStatus?: ControlPlaneOwnershipStatus;
	creatorWallet?: WalletSeed | null;
	creatorUserId?: string | null;
	ownerWallet?: WalletSeed | null;
	ownerUserId?: string | null;
	claimedAt?: string | null;
	verifiedAt?: string | null;
	ownershipSource?: string;
	ownershipMetadata?: JsonRecord;
};

type RuntimeSeed = {
	chain: ControlPlaneChain;
	chainId: number;
	contractAddress: string;
	normalizedContractAddress: string;
	ownershipSeed?: OwnershipSeed | null;
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
	runtimeMetadata?: JsonRecord;
};

type AllowlistSeed = {
	wallet: WalletSeed;
	addedByWallet?: WalletSeed | null;
	reason?: string | null;
	metadata?: JsonRecord;
};

type InviteCodeSeed = {
	code: string;
	createdByWallet?: WalletSeed | null;
	maxUses: number;
	usedCount: number;
	expiresAt?: string | null;
	disabledAt?: string | null;
	notes?: string | null;
	metadata?: JsonRecord;
};

type InviteRedemptionSeed = {
	inviteCode: string;
	redeemedByWallet: WalletSeed;
	redeemedByUserId?: string | null;
	createdAt: string;
	metadata?: JsonRecord;
};

interface ControlPlaneBackfillOptions {
	mongoUri: string;
	postgresUrl: string;
	batchSize?: number | undefined;
	limit?: number | undefined;
	dryRun?: boolean | undefined;
	defaultSolanaChainId?: number | undefined;
	defaultEvmChainId?: number | undefined;
}

interface EntityStats {
	seen: number;
	upserted: number;
	skipped: number;
}

export interface ControlPlaneBackfillSummary {
	dryRun: boolean;
	resolvedCollections: Partial<Record<CollectionKey, string>>;
	walletIdentitiesFromUsers: EntityStats;
	tokenOwnerships: EntityStats;
	runtimeFromTokens: EntityStats;
	runtimeFromAgents: EntityStats;
	launchGateAllowlist: EntityStats;
	inviteCodes: EntityStats;
	inviteRedemptions: EntityStats;
	warningCount: number;
	warningSamples: string[];
}

export class ControlPlaneBackfill {
	private readonly pool: Pool;
	private mongoConnection: Connection | null = null;
	private readonly batchSize: number;
	private readonly limit: number | undefined;
	private readonly dryRun: boolean;
	private readonly defaultSolanaChainId: number;
	private readonly defaultEvmChainId: number;
	private readonly summary: ControlPlaneBackfillSummary;
	private readonly warningSamples: string[] = [];
	private readonly walletIdentityCache = new Map<string, WalletIdentityRow>();
	private readonly tokenOwnershipCache = new Map<string, TokenOwnershipRow>();
	private readonly runtimeStateCache = new Map<string, TokenRuntimeStateRow>();
	private readonly inviteCodeCache = new Map<string, InviteCodeRow>();
	private warningCount = 0;

	constructor(private readonly options: ControlPlaneBackfillOptions) {
		this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
		this.limit = options.limit;
		this.dryRun = options.dryRun ?? false;
		this.defaultSolanaChainId = options.defaultSolanaChainId ?? DEFAULT_SOLANA_CHAIN_ID;
		this.defaultEvmChainId = options.defaultEvmChainId ?? DEFAULT_EVM_CHAIN_ID;

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
			resolvedCollections: {},
			walletIdentitiesFromUsers: emptyStats(),
			tokenOwnerships: emptyStats(),
			runtimeFromTokens: emptyStats(),
			runtimeFromAgents: emptyStats(),
			launchGateAllowlist: emptyStats(),
			inviteCodes: emptyStats(),
			inviteRedemptions: emptyStats(),
			warningCount: 0,
			warningSamples: [],
		};
	}

	async run(): Promise<ControlPlaneBackfillSummary> {
		try {
			logger.info({
				msg: "Starting canonical Mongo -> Supabase control-plane backfill",
				dryRun: this.dryRun,
				batchSize: this.batchSize,
				limit: this.limit,
				defaultSolanaChainId: this.defaultSolanaChainId,
				defaultEvmChainId: this.defaultEvmChainId,
			});

			await this.connectMongo();
			const collections = await this.resolveCollections();
			await this.assertCanonicalSchema();
			await this.backfillWalletIdentitiesFromUsers(collections.users);
			await this.backfillTokenOwnerships(collections.tokens);
			await this.backfillRuntimeFromTokens(collections.tokens);
			await this.backfillRuntimeFromAgents(collections.agents);
			await this.backfillLaunchGateAllowlist(collections.launchGateAllowlist);
			await this.backfillInviteCodes(collections.inviteCodes);

			this.summary.warningCount = this.warningCount;
			this.summary.warningSamples = [...this.warningSamples];
			logger.info({ msg: "Canonical control-plane backfill complete", summary: this.summary });
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

	private async assertCanonicalSchema(): Promise<void> {
		const result = await this.pool.query<{ table_name: string }>(
			`select table_name
			 from information_schema.tables
			 where table_schema = 'public'
			   and table_name = any($1::text[])`,
			[Array.from(CANONICAL_TABLE_NAMES)],
		);

		const found = new Set(result.rows.map((row) => row.table_name));
		const missing = CANONICAL_TABLE_NAMES.filter((tableName) => !found.has(tableName));
		if (missing.length > 0) {
			throw new Error(
				`Missing canonical control-plane tables: ${missing.join(", ")}. Apply supabase/migrations/202603070001_control_plane_foundation.sql before running this backfill.`,
			);
		}
	}

	private async backfillWalletIdentitiesFromUsers(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: WalletSeed[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.walletIdentitiesFromUsers.seen++;
			const mapped = this.mapWalletIdentityFromUser(doc);
			if (!mapped) {
				this.summary.walletIdentitiesFromUsers.skipped++;
				continue;
			}
			batch.push(mapped);
			if (batch.length >= this.batchSize) {
				await this.flushWalletSeeds(batch, "walletIdentitiesFromUsers");
			}
		}

		await this.flushWalletSeeds(batch, "walletIdentitiesFromUsers");
	}

	private async backfillTokenOwnerships(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: OwnershipSeed[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.tokenOwnerships.seen++;
			const mapped = this.mapTokenOwnership(doc);
			if (!mapped) {
				this.summary.tokenOwnerships.skipped++;
				continue;
			}
			batch.push(mapped);
			if (batch.length >= this.batchSize) {
				await this.flushOwnershipSeeds(batch);
			}
		}

		await this.flushOwnershipSeeds(batch);
	}

	private async backfillRuntimeFromTokens(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: RuntimeSeed[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.runtimeFromTokens.seen++;
			const mapped = this.mapRuntimeFromToken(doc);
			if (!mapped) {
				this.summary.runtimeFromTokens.skipped++;
				continue;
			}
			batch.push(mapped);
			if (batch.length >= this.batchSize) {
				await this.flushRuntimeSeeds(batch, "runtimeFromTokens");
			}
		}

		await this.flushRuntimeSeeds(batch, "runtimeFromTokens");
	}

	private async backfillRuntimeFromAgents(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: RuntimeSeed[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.runtimeFromAgents.seen++;
			const mapped = this.mapRuntimeFromAgent(doc);
			if (!mapped) {
				this.summary.runtimeFromAgents.skipped++;
				continue;
			}
			batch.push(mapped);
			if (batch.length >= this.batchSize) {
				await this.flushRuntimeSeeds(batch, "runtimeFromAgents");
			}
		}

		await this.flushRuntimeSeeds(batch, "runtimeFromAgents");
	}

	private async backfillLaunchGateAllowlist(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const batch: AllowlistSeed[] = [];
		const cursor = this.limitCursor(collection.find({}), this.limit);
		cursor.batchSize(this.batchSize);

		for await (const doc of cursor) {
			this.summary.launchGateAllowlist.seen++;
			const mapped = this.mapAllowlistEntry(doc);
			if (!mapped) {
				this.summary.launchGateAllowlist.skipped++;
				continue;
			}
			batch.push(mapped);
			if (batch.length >= this.batchSize) {
				await this.flushAllowlistSeeds(batch);
			}
		}

		await this.flushAllowlistSeeds(batch);
	}

	private async backfillInviteCodes(collectionName: string | null): Promise<void> {
		if (!collectionName) return;

		const collection = this.requireMongoDb().collection<RawMongoDocument>(collectionName);
		const inviteBatch: InviteCodeSeed[] = [];
		const redemptionBatch: InviteRedemptionSeed[] = [];
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
			this.summary.inviteRedemptions.seen += mapped.redemptions.length;
			redemptionBatch.push(...mapped.redemptions);

			if (inviteBatch.length >= this.batchSize || redemptionBatch.length >= this.batchSize) {
				await this.flushInviteCodeSeeds(inviteBatch);
				await this.flushInviteRedemptionSeeds(redemptionBatch);
			}
		}

		await this.flushInviteCodeSeeds(inviteBatch);
		await this.flushInviteRedemptionSeeds(redemptionBatch);
	}

	private async flushWalletSeeds(batch: WalletSeed[], summaryKey: "walletIdentitiesFromUsers"): Promise<void> {
		if (batch.length === 0) return;
		this.summary[summaryKey].upserted += batch.length;
		await this.withMaybeTransaction(async (client) => {
			for (const seed of batch) {
				await this.upsertWalletIdentity(client, seed);
			}
		});
		batch.length = 0;
	}

	private async flushOwnershipSeeds(batch: OwnershipSeed[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.tokenOwnerships.upserted += batch.length;
		await this.withMaybeTransaction(async (client) => {
			for (const seed of batch) {
				await this.upsertTokenOwnership(client, seed);
			}
		});
		batch.length = 0;
	}

	private async flushRuntimeSeeds(
		batch: RuntimeSeed[],
		summaryKey: "runtimeFromTokens" | "runtimeFromAgents",
	): Promise<void> {
		if (batch.length === 0) return;
		this.summary[summaryKey].upserted += batch.length;
		await this.withMaybeTransaction(async (client) => {
			for (const seed of batch) {
				await this.upsertRuntimeState(client, seed);
			}
		});
		batch.length = 0;
	}

	private async flushAllowlistSeeds(batch: AllowlistSeed[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.launchGateAllowlist.upserted += batch.length;
		await this.withMaybeTransaction(async (client) => {
			for (const seed of batch) {
				await this.upsertAllowlistEntry(client, seed);
			}
		});
		batch.length = 0;
	}

	private async flushInviteCodeSeeds(batch: InviteCodeSeed[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.inviteCodes.upserted += batch.length;
		await this.withMaybeTransaction(async (client) => {
			for (const seed of batch) {
				await this.upsertInviteCode(client, seed);
			}
		});
		batch.length = 0;
	}

	private async flushInviteRedemptionSeeds(batch: InviteRedemptionSeed[]): Promise<void> {
		if (batch.length === 0) return;
		this.summary.inviteRedemptions.upserted += batch.length;
		await this.withMaybeTransaction(async (client) => {
			for (const seed of batch) {
				await this.upsertInviteRedemption(client, seed);
			}
		});
		batch.length = 0;
	}

	private mapWalletIdentityFromUser(doc: RawMongoDocument): WalletSeed | null {
		const wallet = this.normalizeLegacyWallet(doc.address, undefined, undefined);
		if (!wallet) {
			this.warn(`Skipping user ${mongoIdToString(doc._id) ?? "unknown"}: missing or invalid wallet address.`);
			return null;
		}

		return {
			...wallet,
			label: asOptionalString(doc.displayName) ?? null,
			linkSource: "sync",
			lastSeenAt: toIsoString(asOptionalDate(doc.updatedAt) ?? asOptionalDate(doc.createdAt)),
			metadata: cleanJsonRecord({
				mongoBackfill: {
					sourceCollection: "users",
					sourceMongoId: mongoIdToString(doc._id),
					avatarUrl: asOptionalString(doc.avatar),
					verified: asBoolean(doc.verified),
					suspended: asBoolean(doc.suspended),
					twitter: asOptionalString(doc.twitter),
					points: asOptionalNumber(doc.points),
					weeklyPoints: asOptionalNumber(doc.weekly_points),
					adminRole: asOptionalString(doc.adminRole),
					adminPermissions: asStringArray(doc.adminPermissions),
					adminCreatedBy: asOptionalString(doc.adminCreatedBy),
					adminCreatedAt: toIsoString(asOptionalDate(doc.adminCreatedAt)),
					sourceCreatedAt: toIsoString(asOptionalDate(doc.createdAt)),
					sourceUpdatedAt: toIsoString(asOptionalDate(doc.updatedAt)),
				},
			}),
		};
	}

	private mapTokenOwnership(doc: RawMongoDocument): OwnershipSeed | null {
		const token = this.extractTokenKey(doc, `token ${mongoIdToString(doc._id) ?? "unknown"}`);
		if (!token) {
			return null;
		}

		const launchType = normalizeLaunchType(asOptionalString(doc.launchType), doc.imported);
		const launchPlatform = normalizeLaunchPlatform(asOptionalString(doc.launchPlatform));
		const ownerClaimStatus = normalizeOwnershipStatus(asOptionalString(doc.ownerClaimStatus));
		const ownerWallets = normalizeOwnerWallets(
			doc.ownerWallets,
			this.defaultSolanaChainId,
			this.defaultEvmChainId,
			this.warn.bind(this),
		);
		const creatorWallet = this.normalizeLegacyWallet(doc.creator, token.chain, token.chainId);
		const creatorWalletSeed = creatorWallet
			? {
					...creatorWallet,
					linkSource: "import" as const,
					metadata: cleanJsonRecord({
						mongoBackfill: {
							seededFrom: "mongo_token.creator",
							tokenMongoId: mongoIdToString(doc._id),
						},
					}),
				}
			: null;
		const characterConfig = normalizeCharacterConfig(doc.agentCharacterConfig);
		const primaryOwnerWallet = pickPrimaryOwnerWallet(
			ownerWallets,
			token.chain,
			this.defaultSolanaChainId,
			this.defaultEvmChainId,
		);
		const claimedAt = toIsoString(asOptionalDate(doc.lastClaimedAt));
		const verifiedAt =
			ownerClaimStatus === "verified" ? (claimedAt ?? toIsoString(asOptionalDate(doc.updatedAt))) : null;

		return {
			...token,
			launchType,
			launchPlatform,
			ownerClaimStatus,
			creatorWallet: creatorWalletSeed,
			ownerWallet:
				ownerClaimStatus !== "unclaimed" && primaryOwnerWallet
					? {
							...primaryOwnerWallet,
							linkSource: "import",
							metadata: cleanJsonRecord({
								mongoBackfill: {
									seededFrom: "mongo_token.ownerWallets",
									tokenMongoId: mongoIdToString(doc._id),
								},
							}),
						}
					: null,
			claimedAt,
			verifiedAt,
			ownershipSource: "sync",
			ownershipMetadata: cleanJsonRecord({
				ownerWallets,
				...(characterConfig ? { agentCharacterConfig: characterConfig } : {}),
				mongoBackfill: {
					sourceCollection: "tokens",
					sourceMongoId: mongoIdToString(doc._id),
					creatorWalletAddress: creatorWallet?.address,
					sourceCreatedAt: toIsoString(asOptionalDate(doc.createdAt)),
					sourceUpdatedAt: toIsoString(asOptionalDate(doc.updatedAt)),
				},
			}),
		};
	}

	private mapRuntimeFromToken(doc: RawMongoDocument): RuntimeSeed | null {
		const token = this.extractTokenKey(doc, `token-runtime ${mongoIdToString(doc._id) ?? "unknown"}`);
		if (!token) {
			return null;
		}

		const hasRuntimeData = [
			doc.cloudAgentId,
			doc.runtimeProvider,
			doc.agentStatus,
			doc.agentLifecycleState,
			doc.billingMode,
			doc.infraReserveUsd,
			doc.webUiUrl,
			doc.lastClaimedAt,
			doc.lastTradeAt,
			doc.suspendAt,
			doc.reviveAt,
		].some(hasMeaningfulValue);
		if (!hasRuntimeData) {
			return null;
		}

		const agentStatus = normalizeAgentStatus(asOptionalString(doc.agentStatus));
		const lifecycleState = normalizeLifecycleState(asOptionalString(doc.agentLifecycleState), agentStatus);
		const characterConfig = normalizeCharacterConfig(doc.agentCharacterConfig);
		const lastClaimedAt = toIsoString(asOptionalDate(doc.lastClaimedAt));
		const lastTradeAt = toIsoString(asOptionalDate(doc.lastTradeAt));
		const suspendAt = toIsoString(asOptionalDate(doc.suspendAt));
		const reviveAt = toIsoString(asOptionalDate(doc.reviveAt));

		return {
			...token,
			cloudAgentId: asOptionalString(doc.cloudAgentId) ?? null,
			runtimeProvider: normalizeRuntimeProvider(
				asOptionalString(doc.runtimeProvider),
				asOptionalString(doc.cloudAgentId),
			),
			agentStatus,
			lifecycleState,
			billingMode: normalizeBillingMode(asOptionalString(doc.billingMode)),
			infraReserveUsd: formatNumeric(asOptionalNumber(doc.infraReserveUsd)),
			webUiUrl: asOptionalString(doc.webUiUrl) ?? null,
			lastStatusChangedAt: toIsoString(asOptionalDate(doc.updatedAt)),
			suspendedAt: suspendAt,
			resumedAt: reviveAt,
			runtimeMetadata: cleanJsonRecord({
				...(characterConfig ? { characterConfig } : {}),
				...(lastClaimedAt ? { lastClaimedAt } : {}),
				mongoBackfill: {
					sourceCollection: "tokens",
					sourceTokenMongoId: mongoIdToString(doc._id),
					lastTradeAt,
					legacySuspendAt: suspendAt,
					legacyReviveAt: reviveAt,
					sourceCreatedAt: toIsoString(asOptionalDate(doc.createdAt)),
					sourceUpdatedAt: toIsoString(asOptionalDate(doc.updatedAt)),
				},
			}),
		};
	}

	private mapRuntimeFromAgent(doc: RawMongoDocument): RuntimeSeed | null {
		const token = this.extractTokenKey(doc, `agent ${mongoIdToString(doc._id) ?? "unknown"}`);
		if (!token) {
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
		].some(hasMeaningfulValue);
		if (!hasRuntimeData) {
			return null;
		}

		const agentStatus = normalizeAgentStatus(asOptionalString(doc.agentStatus));
		const lifecycleState = normalizeLifecycleState(asOptionalString(doc.agentLifecycleState), agentStatus);

		return {
			...token,
			ownershipSeed: {
				...token,
				ownershipSource: "sync",
				launchPlatform: "unknown",
				ownerClaimStatus: "unclaimed",
				ownershipMetadata: cleanJsonRecord({
					mongoBackfill: {
						sourceCollection: "agents",
						sourceAgentMongoId: mongoIdToString(doc._id),
					},
				}),
			},
			cloudAgentId: asOptionalString(doc.cloudAgentId) ?? null,
			runtimeProvider: normalizeRuntimeProvider(
				asOptionalString(doc.runtimeProvider),
				asOptionalString(doc.cloudAgentId),
			),
			agentStatus,
			lifecycleState,
			billingMode: normalizeBillingMode(asOptionalString(doc.billingMode)),
			webUiUrl: asOptionalString(doc.webUiUrl) ?? null,
			bridgeUrl: asOptionalString(doc.bridgeUrl) ?? null,
			statusReason: asOptionalString(doc.suspendedReason) ?? null,
			lastHeartbeatAt: toIsoString(asOptionalDate(doc.lastHeartbeatAt)),
			lastStatusChangedAt: toIsoString(asOptionalDate(doc.updatedAt)),
			runtimeMetadata: cleanJsonRecord({
				mongoBackfill: {
					sourceCollection: "agents",
					sourceAgentMongoId: mongoIdToString(doc._id),
					sourceCreatedAt: toIsoString(asOptionalDate(doc.createdAt)),
					sourceUpdatedAt: toIsoString(asOptionalDate(doc.updatedAt)),
				},
			}),
		};
	}

	private mapAllowlistEntry(doc: RawMongoDocument): AllowlistSeed | null {
		const wallet = this.normalizeLegacyWallet(doc.walletAddress, undefined, undefined);
		if (!wallet) {
			this.warn(`Skipping allowlist row ${mongoIdToString(doc._id) ?? "unknown"}: invalid wallet address.`);
			return null;
		}

		const addedByWallet = this.normalizeLegacyWallet(doc.addedBy, undefined, undefined);
		return {
			wallet: {
				...wallet,
				linkSource: "sync",
				metadata: cleanJsonRecord({
					mongoBackfill: {
						seededFrom: "launch_gate_allowlist.walletAddress",
						sourceMongoId: mongoIdToString(doc._id),
					},
				}),
			},
			addedByWallet: addedByWallet
				? {
						...addedByWallet,
						linkSource: "sync",
					}
				: null,
			reason: null,
			metadata: cleanJsonRecord({
				mongoBackfill: {
					sourceCollection: "launch_gate_allowlist",
					sourceMongoId: mongoIdToString(doc._id),
					sourceCreatedAt: toIsoString(asOptionalDate(doc.createdAt)),
					sourceUpdatedAt: toIsoString(asOptionalDate(doc.updatedAt)),
				},
			}),
		};
	}

	private mapInviteCode(
		doc: RawMongoDocument,
	): { inviteCode: InviteCodeSeed; redemptions: InviteRedemptionSeed[] } | null {
		const rawCode = asOptionalString(doc.code);
		if (!rawCode) {
			this.warn(`Skipping invite ${mongoIdToString(doc._id) ?? "unknown"}: missing code.`);
			return null;
		}

		const code = normalizeControlPlaneInviteCode(rawCode);
		const sourceCreatedAt = toIsoString(asOptionalDate(doc.createdAt));
		const sourceUpdatedAt = toIsoString(asOptionalDate(doc.updatedAt));
		const createdByWallet = this.normalizeLegacyWallet(doc.createdBy, undefined, undefined);
		const explicitRedemptions = extractExplicitRedemptions(
			doc,
			code,
			this.defaultSolanaChainId,
			this.defaultEvmChainId,
			sourceCreatedAt,
			sourceUpdatedAt,
			this.warn.bind(this),
		);
		const usedByWallets = normalizeWalletSeedsFromArray(
			doc.usedBy,
			undefined,
			undefined,
			this.defaultSolanaChainId,
			this.defaultEvmChainId,
			this.warn.bind(this),
		);
		const redemptions =
			explicitRedemptions.length > 0
				? explicitRedemptions
				: usedByWallets.map(
						(wallet, index): InviteRedemptionSeed => ({
							inviteCode: code,
							redeemedByWallet: {
								...wallet,
								linkSource: "sync",
							},
							createdAt: sourceUpdatedAt ?? sourceCreatedAt ?? ZERO_DATE_ISO,
							metadata: cleanJsonRecord({
								mongoBackfill: {
									sourceInviteMongoId: mongoIdToString(doc._id),
									sourcePosition: index,
									redeemedAtKnown: false,
								},
							}),
						}),
					);

		const usedCount = asOptionalInteger(doc.usedCount) ?? redemptions.length;
		if (usedCount !== redemptions.length) {
			this.warn(
				`Invite ${code} has usedCount=${usedCount} but ${redemptions.length} redemption rows were derivable from Mongo.`,
			);
		}

		const active = doc.active === undefined ? true : asBoolean(doc.active);
		const disabledAt = !active ? (sourceUpdatedAt ?? sourceCreatedAt ?? ZERO_DATE_ISO) : null;

		return {
			inviteCode: {
				code,
				createdByWallet: createdByWallet
					? {
							...createdByWallet,
							linkSource: "sync",
						}
					: null,
				maxUses: asOptionalInteger(doc.maxUses) ?? Math.max(usedCount, 1),
				usedCount,
				expiresAt: toIsoString(asOptionalDate(doc.expiresAt)),
				disabledAt,
				notes: null,
				metadata: cleanJsonRecord({
					mongoBackfill: {
						sourceCollection: "invite_codes",
						sourceMongoId: mongoIdToString(doc._id),
						sourceCreatedAt,
						sourceUpdatedAt,
						active,
					},
				}),
			},
			redemptions,
		};
	}

	private async upsertWalletIdentity(client: PoolClient, seed: WalletSeed): Promise<WalletIdentityRow> {
		const cacheKey = walletCacheKey(seed);
		const existing = await this.getWalletIdentity(client, seed);
		const payload = this.mergeWalletIdentity(existing, seed);
		if (this.dryRun) {
			const row = existing ? synthesizeWalletIdentityRow(existing, payload) : createDryRunWalletIdentityRow(payload);
			this.walletIdentityCache.set(cacheKey, row);
			return row;
		}

		const result = await client.query<WalletIdentityRow>(
			`insert into public.control_plane_wallet_identities (
				user_id,
				chain,
				chain_id,
				address,
				normalized_address,
				label,
				link_source,
				verified_at,
				last_seen_at,
				metadata
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb
			)
			on conflict (chain, chain_id, normalized_address) do update set
				user_id = excluded.user_id,
				address = excluded.address,
				label = excluded.label,
				link_source = excluded.link_source,
				verified_at = excluded.verified_at,
				last_seen_at = excluded.last_seen_at,
				metadata = excluded.metadata
			returning *`,
			[
				payload.user_id ?? null,
				payload.chain,
				payload.chain_id,
				payload.address,
				payload.normalized_address,
				payload.label ?? null,
				payload.link_source,
				payload.verified_at ?? null,
				payload.last_seen_at ?? null,
				JSON.stringify(payload.metadata ?? {}),
			],
		);

		const row = requireSingleRow(result.rows, "wallet identity");
		this.walletIdentityCache.set(cacheKey, row);
		return row;
	}

	private async upsertTokenOwnership(client: PoolClient, seed: OwnershipSeed): Promise<TokenOwnershipRow> {
		const creatorWalletIdentity = seed.creatorWallet
			? await this.upsertWalletIdentity(client, seed.creatorWallet)
			: null;
		const ownerWalletIdentity = seed.ownerWallet ? await this.upsertWalletIdentity(client, seed.ownerWallet) : null;
		const existing = await this.getTokenOwnership(client, seed);
		const payload = this.mergeTokenOwnership(existing, seed, creatorWalletIdentity, ownerWalletIdentity);
		const cacheKey = tokenCacheKey(seed);

		if (this.dryRun) {
			const row = existing ? synthesizeTokenOwnershipRow(existing, payload) : createDryRunTokenOwnershipRow(payload);
			this.tokenOwnershipCache.set(cacheKey, row);
			return row;
		}

		const result = await client.query<TokenOwnershipRow>(
			`insert into public.control_plane_token_ownerships (
				token_chain,
				token_chain_id,
				contract_address,
				normalized_contract_address,
				launch_type,
				launch_platform,
				owner_claim_status,
				creator_wallet_identity_id,
				creator_user_id,
				owner_wallet_identity_id,
				owner_user_id,
				claimed_at,
				verified_at,
				ownership_source,
				ownership_metadata
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb
			)
			on conflict (token_chain, token_chain_id, normalized_contract_address) do update set
				launch_type = excluded.launch_type,
				launch_platform = excluded.launch_platform,
				owner_claim_status = excluded.owner_claim_status,
				creator_wallet_identity_id = excluded.creator_wallet_identity_id,
				creator_user_id = excluded.creator_user_id,
				owner_wallet_identity_id = excluded.owner_wallet_identity_id,
				owner_user_id = excluded.owner_user_id,
				claimed_at = excluded.claimed_at,
				verified_at = excluded.verified_at,
				ownership_source = excluded.ownership_source,
				ownership_metadata = excluded.ownership_metadata
			returning *`,
			[
				payload.token_chain,
				payload.token_chain_id,
				payload.contract_address,
				payload.normalized_contract_address,
				payload.launch_type ?? null,
				payload.launch_platform,
				payload.owner_claim_status,
				payload.creator_wallet_identity_id ?? null,
				payload.creator_user_id ?? null,
				payload.owner_wallet_identity_id ?? null,
				payload.owner_user_id ?? null,
				payload.claimed_at ?? null,
				payload.verified_at ?? null,
				payload.ownership_source,
				JSON.stringify(payload.ownership_metadata ?? {}),
			],
		);

		const row = requireSingleRow(result.rows, "token ownership");
		this.tokenOwnershipCache.set(cacheKey, row);
		return row;
	}

	private async upsertRuntimeState(client: PoolClient, seed: RuntimeSeed): Promise<TokenRuntimeStateRow> {
		const ownership =
			(await this.getTokenOwnership(client, seed)) ??
			(await this.upsertTokenOwnership(
				client,
				seed.ownershipSeed ?? {
					chain: seed.chain,
					chainId: seed.chainId,
					contractAddress: seed.contractAddress,
					normalizedContractAddress: seed.normalizedContractAddress,
					launchPlatform: "unknown",
					ownerClaimStatus: "unclaimed",
					ownershipSource: "sync",
					ownershipMetadata: cleanJsonRecord({
						mongoBackfill: {
							seededFrom: "runtime-backfill-placeholder",
						},
					}),
				},
			));
		const existing = await this.getRuntimeState(client, seed);
		const payload = this.mergeRuntimeState(existing, ownership, seed);
		const cacheKey = tokenCacheKey(seed);

		if (this.dryRun) {
			const row = existing ? synthesizeTokenRuntimeRow(existing, payload) : createDryRunTokenRuntimeRow(payload);
			this.runtimeStateCache.set(cacheKey, row);
			return row;
		}

		const result = await client.query<TokenRuntimeStateRow>(
			`insert into public.control_plane_token_runtime_states (
				token_ownership_id,
				token_chain,
				token_chain_id,
				contract_address,
				normalized_contract_address,
				cloud_agent_id,
				runtime_provider,
				agent_status,
				lifecycle_state,
				billing_mode,
				infra_reserve_usd,
				reserve_url,
				web_ui_url,
				bridge_url,
				status_reason,
				last_heartbeat_at,
				last_status_changed_at,
				suspended_at,
				resumed_at,
				deleted_at,
				runtime_metadata
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb
			)
			on conflict (token_chain, token_chain_id, normalized_contract_address) do update set
				token_ownership_id = excluded.token_ownership_id,
				cloud_agent_id = excluded.cloud_agent_id,
				runtime_provider = excluded.runtime_provider,
				agent_status = excluded.agent_status,
				lifecycle_state = excluded.lifecycle_state,
				billing_mode = excluded.billing_mode,
				infra_reserve_usd = excluded.infra_reserve_usd,
				reserve_url = excluded.reserve_url,
				web_ui_url = excluded.web_ui_url,
				bridge_url = excluded.bridge_url,
				status_reason = excluded.status_reason,
				last_heartbeat_at = excluded.last_heartbeat_at,
				last_status_changed_at = excluded.last_status_changed_at,
				suspended_at = excluded.suspended_at,
				resumed_at = excluded.resumed_at,
				deleted_at = excluded.deleted_at,
				runtime_metadata = excluded.runtime_metadata
			returning *`,
			[
				payload.token_ownership_id,
				payload.token_chain,
				payload.token_chain_id,
				payload.contract_address,
				payload.normalized_contract_address,
				payload.cloud_agent_id ?? null,
				payload.runtime_provider,
				payload.agent_status,
				payload.lifecycle_state ?? null,
				payload.billing_mode ?? null,
				payload.infra_reserve_usd ?? null,
				payload.reserve_url ?? null,
				payload.web_ui_url ?? null,
				payload.bridge_url ?? null,
				payload.status_reason ?? null,
				payload.last_heartbeat_at ?? null,
				payload.last_status_changed_at ?? null,
				payload.suspended_at ?? null,
				payload.resumed_at ?? null,
				payload.deleted_at ?? null,
				JSON.stringify(payload.runtime_metadata ?? {}),
			],
		);

		const row = requireSingleRow(result.rows, "token runtime state");
		this.runtimeStateCache.set(cacheKey, row);
		return row;
	}

	private async upsertAllowlistEntry(client: PoolClient, seed: AllowlistSeed): Promise<AllowlistRow> {
		const walletIdentity = await this.upsertWalletIdentity(client, seed.wallet);
		const addedByWalletIdentity = seed.addedByWallet
			? await this.upsertWalletIdentity(client, seed.addedByWallet)
			: null;
		const existing = await this.getAllowlistEntry(client, seed.wallet);
		const payload = this.mergeAllowlistEntry(existing, seed, walletIdentity, addedByWalletIdentity);

		if (this.dryRun) {
			return existing ? synthesizeAllowlistRow(existing, payload) : createDryRunAllowlistRow(payload);
		}

		const result = await client.query<AllowlistRow>(
			`insert into public.control_plane_launch_gate_allowlist (
				wallet_identity_id,
				chain,
				chain_id,
				address,
				normalized_address,
				added_by_user_id,
				added_by_wallet_identity_id,
				reason,
				metadata
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb
			)
			on conflict (chain, chain_id, normalized_address) do update set
				wallet_identity_id = excluded.wallet_identity_id,
				address = excluded.address,
				added_by_user_id = excluded.added_by_user_id,
				added_by_wallet_identity_id = excluded.added_by_wallet_identity_id,
				reason = excluded.reason,
				metadata = excluded.metadata
			returning *`,
			[
				payload.wallet_identity_id ?? null,
				payload.chain,
				payload.chain_id,
				payload.address,
				payload.normalized_address,
				payload.added_by_user_id ?? null,
				payload.added_by_wallet_identity_id ?? null,
				payload.reason ?? null,
				JSON.stringify(payload.metadata ?? {}),
			],
		);

		return requireSingleRow(result.rows, "launch gate allowlist entry");
	}

	private async upsertInviteCode(client: PoolClient, seed: InviteCodeSeed): Promise<InviteCodeRow> {
		const existing = await this.getInviteCode(client, seed.code);
		const createdByWalletIdentity = seed.createdByWallet
			? await this.upsertWalletIdentity(client, seed.createdByWallet)
			: null;
		const payload = this.mergeInviteCode(existing, seed, createdByWalletIdentity);

		if (this.dryRun) {
			const row = existing ? synthesizeInviteCodeRow(existing, payload) : createDryRunInviteCodeRow(payload);
			this.inviteCodeCache.set(seed.code, row);
			return row;
		}

		const result = await client.query<InviteCodeRow>(
			`insert into public.control_plane_invite_codes (
				code,
				created_by_user_id,
				created_by_wallet_identity_id,
				max_uses,
				used_count,
				expires_at,
				disabled_at,
				notes,
				metadata
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb
			)
			on conflict (code) do update set
				created_by_user_id = excluded.created_by_user_id,
				created_by_wallet_identity_id = excluded.created_by_wallet_identity_id,
				max_uses = excluded.max_uses,
				used_count = excluded.used_count,
				expires_at = excluded.expires_at,
				disabled_at = excluded.disabled_at,
				notes = excluded.notes,
				metadata = excluded.metadata
			returning *`,
			[
				payload.code,
				payload.created_by_user_id ?? null,
				payload.created_by_wallet_identity_id ?? null,
				payload.max_uses,
				payload.used_count,
				payload.expires_at ?? null,
				payload.disabled_at ?? null,
				payload.notes ?? null,
				JSON.stringify(payload.metadata ?? {}),
			],
		);

		const row = requireSingleRow(result.rows, "invite code");
		this.inviteCodeCache.set(seed.code, row);
		return row;
	}

	private async upsertInviteRedemption(client: PoolClient, seed: InviteRedemptionSeed): Promise<InviteRedemptionRow> {
		const inviteCode = await this.upsertInviteCode(client, {
			code: seed.inviteCode,
			maxUses: 1,
			usedCount: 0,
			metadata: cleanJsonRecord({
				mongoBackfill: {
					seededFrom: "invite-redemption-backfill",
				},
			}),
		});
		const walletIdentity = await this.upsertWalletIdentity(client, seed.redeemedByWallet);
		const existing = await this.getInviteRedemption(client, inviteCode.id, walletIdentity.id);
		const payload = this.mergeInviteRedemption(existing, inviteCode, walletIdentity, seed);

		if (this.dryRun) {
			return existing ? synthesizeInviteRedemptionRow(existing, payload) : createDryRunInviteRedemptionRow(payload);
		}

		const result = await client.query<InviteRedemptionRow>(
			`insert into public.control_plane_invite_redemptions (
				invite_code_id,
				redeemed_by_wallet_identity_id,
				redeemed_by_user_id,
				metadata,
				created_at
			) values (
				$1,$2,$3,$4::jsonb,$5
			)
			on conflict (invite_code_id, redeemed_by_wallet_identity_id) do update set
				redeemed_by_user_id = excluded.redeemed_by_user_id,
				metadata = excluded.metadata,
				created_at = excluded.created_at
			returning *`,
			[
				payload.invite_code_id,
				payload.redeemed_by_wallet_identity_id,
				payload.redeemed_by_user_id ?? null,
				JSON.stringify(payload.metadata ?? {}),
				payload.created_at,
			],
		);

		return requireSingleRow(result.rows, "invite redemption");
	}

	private async getWalletIdentity(client: PoolClient, wallet: WalletSeed): Promise<WalletIdentityRow | null> {
		const cacheKey = walletCacheKey(wallet);
		const cached = this.walletIdentityCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const result = await client.query<WalletIdentityRow>(
			`select *
			 from public.control_plane_wallet_identities
			 where chain = $1 and chain_id = $2 and normalized_address = $3
			 limit 1`,
			[wallet.chain, wallet.chainId, wallet.normalizedAddress],
		);
		const row = result.rows[0] ?? null;
		if (row) {
			this.walletIdentityCache.set(cacheKey, row);
		}
		return row;
	}

	private async getTokenOwnership(
		client: PoolClient,
		token: Pick<OwnershipSeed | RuntimeSeed, "chain" | "chainId" | "normalizedContractAddress">,
	): Promise<TokenOwnershipRow | null> {
		const cacheKey = tokenCacheKey(token);
		const cached = this.tokenOwnershipCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const result = await client.query<TokenOwnershipRow>(
			`select *
			 from public.control_plane_token_ownerships
			 where token_chain = $1 and token_chain_id = $2 and normalized_contract_address = $3
			 limit 1`,
			[token.chain, token.chainId, token.normalizedContractAddress],
		);
		const row = result.rows[0] ?? null;
		if (row) {
			this.tokenOwnershipCache.set(cacheKey, row);
		}
		return row;
	}

	private async getRuntimeState(
		client: PoolClient,
		token: Pick<RuntimeSeed, "chain" | "chainId" | "normalizedContractAddress">,
	): Promise<TokenRuntimeStateRow | null> {
		const cacheKey = tokenCacheKey(token);
		const cached = this.runtimeStateCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const result = await client.query<TokenRuntimeStateRow>(
			`select *
			 from public.control_plane_token_runtime_states
			 where token_chain = $1 and token_chain_id = $2 and normalized_contract_address = $3
			 limit 1`,
			[token.chain, token.chainId, token.normalizedContractAddress],
		);
		const row = result.rows[0] ?? null;
		if (row) {
			this.runtimeStateCache.set(cacheKey, row);
		}
		return row;
	}

	private async getAllowlistEntry(client: PoolClient, wallet: WalletSeed): Promise<AllowlistRow | null> {
		const result = await client.query<AllowlistRow>(
			`select *
			 from public.control_plane_launch_gate_allowlist
			 where chain = $1 and chain_id = $2 and normalized_address = $3
			 limit 1`,
			[wallet.chain, wallet.chainId, wallet.normalizedAddress],
		);
		return result.rows[0] ?? null;
	}

	private async getInviteCode(client: PoolClient, code: string): Promise<InviteCodeRow | null> {
		const cached = this.inviteCodeCache.get(code);
		if (cached) {
			return cached;
		}

		const result = await client.query<InviteCodeRow>(
			"select * from public.control_plane_invite_codes where code = $1 limit 1",
			[code],
		);
		const row = result.rows[0] ?? null;
		if (row) {
			this.inviteCodeCache.set(code, row);
		}
		return row;
	}

	private async getInviteRedemption(
		client: PoolClient,
		inviteCodeId: string,
		walletIdentityId: string,
	): Promise<InviteRedemptionRow | null> {
		const result = await client.query<InviteRedemptionRow>(
			`select *
			 from public.control_plane_invite_redemptions
			 where invite_code_id = $1 and redeemed_by_wallet_identity_id = $2
			 limit 1`,
			[inviteCodeId, walletIdentityId],
		);
		return result.rows[0] ?? null;
	}

	private mergeWalletIdentity(
		existing: WalletIdentityRow | null,
		seed: WalletSeed,
	): ControlPlaneInsert<"control_plane_wallet_identities"> {
		return {
			user_id: existing?.user_id ?? seed.userId ?? null,
			chain: seed.chain,
			chain_id: seed.chainId,
			address: seed.address,
			normalized_address: seed.normalizedAddress,
			label: existing?.label ?? seed.label ?? null,
			link_source: pickWalletLinkSource(existing?.link_source, seed.linkSource ?? "sync"),
			verified_at: existing?.verified_at ?? seed.verifiedAt ?? null,
			last_seen_at: latestIso(existing?.last_seen_at, seed.lastSeenAt),
			metadata: mergeJsonPreferExisting(asJsonRecord(existing?.metadata), seed.metadata),
		};
	}

	private mergeTokenOwnership(
		existing: TokenOwnershipRow | null,
		seed: OwnershipSeed,
		creatorWalletIdentity: WalletIdentityRow | null,
		ownerWalletIdentity: WalletIdentityRow | null,
	): ControlPlaneInsert<"control_plane_token_ownerships"> {
		return {
			token_chain: seed.chain,
			token_chain_id: seed.chainId,
			contract_address: seed.contractAddress,
			normalized_contract_address: seed.normalizedContractAddress,
			launch_type: existing?.launch_type ?? seed.launchType ?? null,
			launch_platform: pickLaunchPlatform(existing?.launch_platform, seed.launchPlatform),
			owner_claim_status: pickOwnershipStatus(existing?.owner_claim_status, seed.ownerClaimStatus),
			creator_wallet_identity_id: existing?.creator_wallet_identity_id ?? creatorWalletIdentity?.id ?? null,
			creator_user_id: existing?.creator_user_id ?? seed.creatorUserId ?? creatorWalletIdentity?.user_id ?? null,
			owner_wallet_identity_id: existing?.owner_wallet_identity_id ?? ownerWalletIdentity?.id ?? null,
			owner_user_id: existing?.owner_user_id ?? seed.ownerUserId ?? ownerWalletIdentity?.user_id ?? null,
			claimed_at: existing?.claimed_at ?? seed.claimedAt ?? null,
			verified_at: existing?.verified_at ?? seed.verifiedAt ?? null,
			ownership_source: existing?.ownership_source ?? seed.ownershipSource ?? "sync",
			ownership_metadata: mergeJsonPreferExisting(asJsonRecord(existing?.ownership_metadata), seed.ownershipMetadata),
		};
	}

	private mergeRuntimeState(
		existing: TokenRuntimeStateRow | null,
		ownership: TokenOwnershipRow,
		seed: RuntimeSeed,
	): ControlPlaneInsert<"control_plane_token_runtime_states"> {
		const existingRuntimeMetadata = asJsonRecord(existing?.runtime_metadata);
		const existingStatus = existing?.agent_status;
		const preferIncomingAgentState =
			getMongoBackfillSourceCollection(existingRuntimeMetadata) === "tokens" &&
			getMongoBackfillSourceCollection(seed.runtimeMetadata) === "agents";
		const nextStatus = pickAgentStatus(existingStatus, seed.agentStatus, preferIncomingAgentState);
		return {
			token_ownership_id: existing?.token_ownership_id ?? ownership.id,
			token_chain: seed.chain,
			token_chain_id: seed.chainId,
			contract_address: seed.contractAddress,
			normalized_contract_address: seed.normalizedContractAddress,
			cloud_agent_id: existing?.cloud_agent_id ?? seed.cloudAgentId ?? null,
			runtime_provider: pickRuntimeProvider(existing?.runtime_provider, seed.runtimeProvider),
			agent_status: nextStatus,
			lifecycle_state: pickLifecycleState(
				existing?.lifecycle_state,
				seed.lifecycleState,
				nextStatus,
				preferIncomingAgentState,
			),
			billing_mode: existing?.billing_mode ?? seed.billingMode ?? null,
			infra_reserve_usd: existing?.infra_reserve_usd ?? seed.infraReserveUsd ?? null,
			reserve_url: existing?.reserve_url ?? seed.reserveUrl ?? null,
			web_ui_url: existing?.web_ui_url ?? seed.webUiUrl ?? null,
			bridge_url: existing?.bridge_url ?? seed.bridgeUrl ?? null,
			status_reason: existing?.status_reason ?? seed.statusReason ?? null,
			last_heartbeat_at: latestIso(existing?.last_heartbeat_at, seed.lastHeartbeatAt),
			last_status_changed_at: latestIso(existing?.last_status_changed_at, seed.lastStatusChangedAt),
			suspended_at: existing?.suspended_at ?? seed.suspendedAt ?? null,
			resumed_at: existing?.resumed_at ?? seed.resumedAt ?? null,
			deleted_at: existing?.deleted_at ?? seed.deletedAt ?? null,
			runtime_metadata: mergeJsonPreferExisting(existingRuntimeMetadata, seed.runtimeMetadata),
		};
	}

	private mergeAllowlistEntry(
		existing: AllowlistRow | null,
		seed: AllowlistSeed,
		walletIdentity: WalletIdentityRow,
		addedByWalletIdentity: WalletIdentityRow | null,
	): ControlPlaneInsert<"control_plane_launch_gate_allowlist"> {
		return {
			wallet_identity_id: existing?.wallet_identity_id ?? walletIdentity.id,
			chain: seed.wallet.chain,
			chain_id: seed.wallet.chainId,
			address: seed.wallet.address,
			normalized_address: seed.wallet.normalizedAddress,
			added_by_user_id: existing?.added_by_user_id ?? addedByWalletIdentity?.user_id ?? null,
			added_by_wallet_identity_id: existing?.added_by_wallet_identity_id ?? addedByWalletIdentity?.id ?? null,
			reason: existing?.reason ?? seed.reason ?? null,
			metadata: mergeJsonPreferExisting(asJsonRecord(existing?.metadata), seed.metadata),
		};
	}

	private mergeInviteCode(
		existing: InviteCodeRow | null,
		seed: InviteCodeSeed,
		createdByWalletIdentity: WalletIdentityRow | null,
	): ControlPlaneInsert<"control_plane_invite_codes"> {
		return {
			code: seed.code,
			created_by_user_id: existing?.created_by_user_id ?? createdByWalletIdentity?.user_id ?? null,
			created_by_wallet_identity_id: existing?.created_by_wallet_identity_id ?? createdByWalletIdentity?.id ?? null,
			max_uses: Math.max(existing?.max_uses ?? 1, seed.maxUses, 1),
			used_count: Math.max(existing?.used_count ?? 0, seed.usedCount, 0),
			expires_at: existing?.expires_at ?? seed.expiresAt ?? null,
			disabled_at: existing?.disabled_at ?? seed.disabledAt ?? null,
			notes: existing?.notes ?? seed.notes ?? null,
			metadata: mergeJsonPreferExisting(asJsonRecord(existing?.metadata), seed.metadata),
		};
	}

	private mergeInviteRedemption(
		existing: InviteRedemptionRow | null,
		inviteCode: InviteCodeRow,
		walletIdentity: WalletIdentityRow,
		seed: InviteRedemptionSeed,
	): ControlPlaneInsert<"control_plane_invite_redemptions"> {
		return {
			invite_code_id: inviteCode.id,
			redeemed_by_wallet_identity_id: walletIdentity.id,
			redeemed_by_user_id: existing?.redeemed_by_user_id ?? seed.redeemedByUserId ?? walletIdentity.user_id ?? null,
			metadata: mergeJsonPreferExisting(asJsonRecord(existing?.metadata), seed.metadata),
			created_at: existing?.created_at ?? seed.createdAt,
		};
	}

	private extractTokenKey(
		doc: RawMongoDocument,
		context: string,
	): { chain: ControlPlaneChain; chainId: number; contractAddress: string; normalizedContractAddress: string } | null {
		const chain = normalizeChain(
			asOptionalString(doc.chain),
			asOptionalInteger(doc.chainId),
			asOptionalString(doc.contractAddress),
		);
		if (!chain) {
			this.warn(`Skipping ${context}: unable to determine chain.`);
			return null;
		}

		const chainId = normalizeChainId(chain, asOptionalInteger(doc.chainId), this.defaultSolanaChainId);
		if (!chainId) {
			this.warn(`Skipping ${context}: missing chainId for ${chain} token.`);
			return null;
		}

		const contractAddress = asOptionalString(doc.contractAddress);
		if (!contractAddress) {
			this.warn(`Skipping ${context}: missing contractAddress.`);
			return null;
		}

		try {
			const token = normalizeControlPlaneTokenKey({
				chain,
				chainId,
				contractAddress,
			});
			return {
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
				normalizedContractAddress: token.normalizedContractAddress,
			};
		} catch {
			this.warn(`Skipping ${context}: invalid contractAddress ${contractAddress}.`);
			return null;
		}
	}

	private normalizeLegacyWallet(
		value: unknown,
		chainHint: ControlPlaneChain | undefined,
		chainIdHint: number | undefined,
	): WalletSeed | null {
		const address = asOptionalString(value);
		if (!address) return null;

		const chain = chainHint ?? inferWalletChain(address);
		if (!chain) return null;

		const chainId = chainIdHint ?? (chain === "solana" ? this.defaultSolanaChainId : this.defaultEvmChainId);
		try {
			const wallet = normalizeControlPlaneWalletKey({ chain, chainId, address });
			return {
				chain: wallet.chain,
				chainId: wallet.chainId,
				address: wallet.address,
				normalizedAddress: wallet.normalizedAddress,
			};
		} catch {
			return null;
		}
	}

	private requireMongoDb() {
		const db = this.mongoConnection?.db;
		if (!db) {
			throw new Error("Mongo connection is not ready");
		}
		return db;
	}

	private limitCursor<T extends { limit(value: number): T }>(cursor: T, limit?: number): T {
		if (limit && limit > 0) {
			return cursor.limit(limit);
		}

		return cursor;
	}

	private async withMaybeTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
		const client = await this.pool.connect();
		try {
			if (this.dryRun) {
				return await callback(client);
			}

			await client.query("begin");
			try {
				const result = await callback(client);
				await client.query("commit");
				return result;
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
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

function requireSingleRow<T>(rows: T[], label: string): T {
	const row = rows[0];
	if (!row) {
		throw new Error(`Failed to upsert ${label}: no row returned`);
	}
	return row;
}

function walletCacheKey(wallet: Pick<WalletSeed, "chain" | "chainId" | "normalizedAddress">): string {
	return `${wallet.chain}:${wallet.chainId}:${wallet.normalizedAddress}`;
}

function tokenCacheKey(
	token: Pick<OwnershipSeed | RuntimeSeed, "chain" | "chainId" | "normalizedContractAddress">,
): string {
	return `${token.chain}:${token.chainId}:${token.normalizedContractAddress}`;
}

function pickWalletLinkSource(
	existing: ControlPlaneWalletLinkSource | undefined,
	desired: ControlPlaneWalletLinkSource,
): ControlPlaneWalletLinkSource {
	if (!existing) return desired;
	return WALLET_LINK_SOURCE_RANK[desired] > WALLET_LINK_SOURCE_RANK[existing] ? desired : existing;
}

function pickOwnershipStatus(
	existing: ControlPlaneOwnershipStatus | undefined,
	desired: ControlPlaneOwnershipStatus | undefined,
): ControlPlaneOwnershipStatus {
	if (!existing) return desired ?? "unclaimed";
	if (existing === "unclaimed") return desired ?? existing;
	return existing;
}

function pickLaunchPlatform(
	existing: ControlPlaneLaunchPlatform | undefined,
	desired: ControlPlaneLaunchPlatform | undefined,
): ControlPlaneLaunchPlatform {
	if (!existing || existing === "unknown") {
		return desired ?? existing ?? "unknown";
	}
	return existing;
}

function pickRuntimeProvider(
	existing: ControlPlaneRuntimeProvider | undefined,
	desired: ControlPlaneRuntimeProvider | undefined,
): ControlPlaneRuntimeProvider {
	if (!existing || existing === "unknown") {
		return desired ?? existing ?? "milady-cloud";
	}
	return existing;
}

function pickAgentStatus(
	existing: ControlPlaneAgentStatus | undefined,
	desired: ControlPlaneAgentStatus | undefined,
	preferDesired: boolean,
): ControlPlaneAgentStatus {
	if (preferDesired && desired && desired !== "none") {
		return desired;
	}
	if (!existing) return desired ?? "none";
	if (existing === "none") return desired ?? existing;
	return existing;
}

function pickLifecycleState(
	existing: ControlPlaneLifecycleState | null | undefined,
	desired: ControlPlaneLifecycleState | null | undefined,
	agentStatus: ControlPlaneAgentStatus,
	preferDesired: boolean,
): ControlPlaneLifecycleState | null {
	if (preferDesired) {
		return desired ?? deriveLifecycleState(agentStatus);
	}
	if (existing !== undefined && existing !== null) {
		return existing;
	}
	if (desired !== undefined) {
		return desired;
	}
	return deriveLifecycleState(agentStatus);
}

function deriveLifecycleState(agentStatus: ControlPlaneAgentStatus): ControlPlaneLifecycleState | null {
	switch (agentStatus) {
		case "provisioning":
			return "birth";
		case "running":
			return "live";
		case "suspended":
		case "deleted":
			return "dormant";
		default:
			return null;
	}
}

function latestIso(left: string | null | undefined, right: string | null | undefined): string | null {
	if (!left) return right ?? null;
	if (!right) return left;
	return left >= right ? left : right;
}

function normalizeChain(
	chainValue: string | undefined,
	chainIdValue: number | undefined,
	contractAddressValue: string | undefined,
): ControlPlaneChain | undefined {
	const normalized = chainValue?.trim().toLowerCase();
	if (normalized === "solana" || normalized === "evm") {
		return normalized;
	}
	if (contractAddressValue?.startsWith("0x")) {
		return "evm";
	}
	if (chainIdValue === 101 || chainIdValue === 102 || chainIdValue === 103) {
		return "solana";
	}
	if (chainIdValue !== undefined) {
		return "evm";
	}
	return undefined;
}

function normalizeChainId(
	chain: ControlPlaneChain,
	value: number | undefined,
	defaultSolanaChainId: number,
): number | undefined {
	if (value !== undefined && value > 0) {
		return value;
	}
	return chain === "solana" ? defaultSolanaChainId : undefined;
}

function normalizeLaunchType(value: string | undefined, importedValue: unknown): ControlPlaneLaunchType | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "native" || normalized === "imported") {
		return normalized;
	}
	return asBoolean(importedValue) ? "imported" : "native";
}

function normalizeLaunchPlatform(value: string | undefined): ControlPlaneLaunchPlatform {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return "unknown";
	if (normalized.includes("pump")) return "pump";
	if (normalized.includes("flap")) return "flap";
	if (normalized === "external" || normalized === "unknown") return normalized;
	return "external";
}

function normalizeOwnershipStatus(value: string | undefined): ControlPlaneOwnershipStatus {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "claimed" || normalized === "verified" || normalized === "disputed") {
		return normalized;
	}
	return "unclaimed";
}

function normalizeRuntimeProvider(
	value: string | undefined,
	cloudAgentId: string | undefined,
): ControlPlaneRuntimeProvider {
	const normalized = value?.trim().toLowerCase();
	if (normalized?.includes("milady")) return "milady-cloud";
	if (normalized === "unknown") return "unknown";
	return cloudAgentId ? "milady-cloud" : "unknown";
}

function normalizeAgentStatus(value: string | undefined): ControlPlaneAgentStatus {
	const normalized = value?.trim().toLowerCase();
	switch (normalized) {
		case "provisioning":
		case "pending":
		case "starting":
			return "provisioning";
		case "running":
		case "ready":
		case "live":
		case "active":
			return "running";
		case "suspended":
		case "paused":
		case "stopped":
			return "suspended";
		case "failed":
		case "error":
			return "failed";
		case "deleted":
		case "removed":
			return "deleted";
		default:
			return "none";
	}
}

function normalizeLifecycleState(
	value: string | undefined,
	agentStatus: ControlPlaneAgentStatus,
): ControlPlaneLifecycleState | null {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "birth" || normalized === "live" || normalized === "dormant" || normalized === "reviving") {
		return normalized;
	}
	return deriveLifecycleState(agentStatus);
}

function normalizeBillingMode(value: string | undefined): ControlPlaneBillingMode | null {
	const normalized = value?.trim().toLowerCase();
	switch (normalized) {
		case "owner_credits":
		case "owner":
		case "owner-credit":
			return "owner_credits";
		case "waifu_treasury_subsidy":
		case "treasury":
		case "subsidy":
			return "waifu_treasury_subsidy";
		case "hybrid":
			return "hybrid";
		default:
			return null;
	}
}

function inferWalletChain(address: string): ControlPlaneChain | undefined {
	return address.startsWith("0x") ? "evm" : "solana";
}

function normalizeOwnerWallets(
	value: unknown,
	defaultSolanaChainId: number,
	defaultEvmChainId: number,
	warn: (message: string) => void,
): { solana: string[]; evm: string[] } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { solana: [], evm: [] };
	}

	const record = value as Record<string, unknown>;
	return {
		solana: normalizeWalletSeedsFromArray(
			record.solana,
			"solana",
			defaultSolanaChainId,
			defaultSolanaChainId,
			defaultEvmChainId,
			warn,
		).map((wallet) => wallet.address),
		evm: normalizeWalletSeedsFromArray(
			record.evm,
			"evm",
			defaultEvmChainId,
			defaultSolanaChainId,
			defaultEvmChainId,
			warn,
		).map((wallet) => wallet.address),
	};
}

function normalizeWalletSeedsFromArray(
	value: unknown,
	chainHint: ControlPlaneChain | undefined,
	chainIdHint: number | undefined,
	defaultSolanaChainId: number,
	defaultEvmChainId: number,
	warn: (message: string) => void,
): WalletSeed[] {
	if (!Array.isArray(value)) return [];

	const deduped = new Map<string, WalletSeed>();
	for (const entry of value) {
		const address = asOptionalString(entry);
		if (!address) continue;
		const chain = chainHint ?? inferWalletChain(address);
		if (!chain) continue;
		const chainId = chainIdHint ?? (chain === "solana" ? defaultSolanaChainId : defaultEvmChainId);
		try {
			const wallet = normalizeControlPlaneWalletKey({ chain, chainId, address });
			deduped.set(wallet.normalizedAddress, {
				chain: wallet.chain,
				chainId: wallet.chainId,
				address: wallet.address,
				normalizedAddress: wallet.normalizedAddress,
			});
		} catch {
			warn(`Skipping invalid wallet value ${address} while normalizing ${chain ?? "mixed"} wallet array.`);
		}
	}

	return Array.from(deduped.values());
}

function pickPrimaryOwnerWallet(
	wallets: { solana: string[]; evm: string[] },
	tokenChain: ControlPlaneChain,
	defaultSolanaChainId: number,
	defaultEvmChainId: number,
): WalletSeed | null {
	if (tokenChain === "solana") {
		const address = wallets.solana[0] ?? wallets.evm[0];
		if (!address) return null;
		const chain = address.startsWith("0x") ? "evm" : "solana";
		const chainId = chain === "solana" ? defaultSolanaChainId : defaultEvmChainId;
		const wallet = normalizeControlPlaneWalletKey({ chain, chainId, address });
		return {
			chain: wallet.chain,
			chainId: wallet.chainId,
			address: wallet.address,
			normalizedAddress: wallet.normalizedAddress,
		};
	}

	const address = wallets.evm[0] ?? wallets.solana[0];
	if (!address) return null;
	const chain = address.startsWith("0x") ? "evm" : "solana";
	const chainId = chain === "solana" ? defaultSolanaChainId : defaultEvmChainId;
	const wallet = normalizeControlPlaneWalletKey({ chain, chainId, address });
	return {
		chain: wallet.chain,
		chainId: wallet.chainId,
		address: wallet.address,
		normalizedAddress: wallet.normalizedAddress,
	};
}

function normalizeCharacterConfig(value: unknown): JsonRecord | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const normalized = cleanJsonRecord({
		name: asOptionalString(record.name),
		bio: asOptionalString(record.bio),
		avatar: asOptionalString(record.avatar),
	});
	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function extractExplicitRedemptions(
	doc: RawMongoDocument,
	inviteCode: string,
	defaultSolanaChainId: number,
	defaultEvmChainId: number,
	inviteCreatedAt: string | null,
	inviteUpdatedAt: string | null,
	warn: (message: string) => void,
): InviteRedemptionSeed[] {
	const rawRedemptions = doc.redemptions;
	if (!Array.isArray(rawRedemptions)) return [];

	const redemptions: InviteRedemptionSeed[] = [];
	for (const [index, entry] of rawRedemptions.entries()) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			continue;
		}
		const redemption = entry as Record<string, unknown>;
		const wallet = normalizeWalletSeedsFromArray(
			[redemption.walletAddress ?? redemption.wallet ?? redemption.address ?? redemption.usedBy],
			undefined,
			undefined,
			defaultSolanaChainId,
			defaultEvmChainId,
			warn,
		)[0];
		if (!wallet) {
			continue;
		}
		const redeemedAt = toIsoString(asOptionalDate(redemption.redeemedAt ?? redemption.usedAt ?? redemption.createdAt));
		redemptions.push({
			inviteCode,
			redeemedByWallet: {
				...wallet,
				linkSource: "sync",
			},
			createdAt: redeemedAt ?? inviteUpdatedAt ?? inviteCreatedAt ?? ZERO_DATE_ISO,
			metadata: cleanJsonRecord({
				mongoBackfill: {
					sourceInviteMongoId: mongoIdToString(doc._id),
					sourcePosition: index,
					redeemedAtKnown: Boolean(redeemedAt),
					originalRedeemedAt: redeemedAt,
				},
			}),
		});
	}

	return redemptions;
}

function cleanJsonRecord(value: Record<string, unknown>): JsonRecord {
	const result: JsonRecord = {};
	for (const [key, entry] of Object.entries(value)) {
		const normalized = toJsonValue(entry);
		if (normalized !== undefined) {
			result[key] = normalized;
		}
	}
	return result;
}

function toJsonValue(value: unknown): Json | undefined {
	if (value === undefined) return undefined;
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Array.isArray(value)) {
		return value.map((entry) => toJsonValue(entry)).filter((entry): entry is Json => entry !== undefined);
	}
	if (typeof value === "object") {
		return cleanJsonRecord(value as Record<string, unknown>);
	}
	return String(value);
}

function asJsonRecord(value: Json | null | undefined): JsonRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as JsonRecord;
}

function mergeJsonPreferExisting(existing: JsonRecord, desired: JsonRecord | undefined): JsonRecord {
	if (!desired) {
		return existing;
	}

	const merged: JsonRecord = { ...existing };
	for (const [key, desiredValue] of Object.entries(desired)) {
		const existingValue = merged[key];
		if (existingValue === undefined) {
			merged[key] = desiredValue;
			continue;
		}
		if (isJsonRecord(existingValue) && isJsonRecord(desiredValue)) {
			merged[key] = mergeJsonPreferExisting(existingValue, desiredValue);
		}
	}
	return merged;
}

function getMongoBackfillSourceCollection(metadata: JsonRecord | undefined): string | undefined {
	if (!metadata) {
		return undefined;
	}

	const mongoBackfill = metadata.mongoBackfill;
	if (!mongoBackfill || !isJsonRecord(mongoBackfill)) {
		return undefined;
	}

	const sourceCollection = mongoBackfill.sourceCollection;
	return typeof sourceCollection === "string" ? sourceCollection : undefined;
}

function isJsonRecord(value: Json): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

function formatNumeric(value: number | undefined): string | null {
	if (value === undefined) return null;
	return Number.isInteger(value) ? `${value}` : value.toFixed(2);
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

function toIsoString(value: Date | undefined): string | null {
	return value ? value.toISOString() : null;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(value.map((entry) => asOptionalString(entry)).filter((entry): entry is string => Boolean(entry))),
	);
}

function hasMeaningfulValue(value: unknown): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === "string") return value.trim().length > 0;
	return true;
}

function createDryRunWalletIdentityRow(
	payload: ControlPlaneInsert<"control_plane_wallet_identities">,
): WalletIdentityRow {
	const now = new Date().toISOString();
	return {
		id: `dryrun-wallet:${walletCacheKey({
			chain: payload.chain,
			chainId: payload.chain_id,
			normalizedAddress: payload.normalized_address,
		})}`,
		user_id: payload.user_id ?? null,
		chain: payload.chain,
		chain_id: payload.chain_id,
		address: payload.address,
		normalized_address: payload.normalized_address,
		label: payload.label ?? null,
		link_source: payload.link_source ?? "manual",
		verified_at: payload.verified_at ?? null,
		last_seen_at: payload.last_seen_at ?? null,
		metadata: payload.metadata ?? {},
		created_at: now,
		updated_at: now,
	};
}

function synthesizeWalletIdentityRow(
	existing: WalletIdentityRow,
	payload: ControlPlaneInsert<"control_plane_wallet_identities">,
): WalletIdentityRow {
	return {
		...existing,
		user_id: payload.user_id ?? null,
		address: payload.address,
		normalized_address: payload.normalized_address,
		label: payload.label ?? null,
		link_source: payload.link_source ?? existing.link_source,
		verified_at: payload.verified_at ?? null,
		last_seen_at: payload.last_seen_at ?? null,
		metadata: payload.metadata ?? existing.metadata,
	};
}

function createDryRunTokenOwnershipRow(
	payload: ControlPlaneInsert<"control_plane_token_ownerships">,
): TokenOwnershipRow {
	const now = new Date().toISOString();
	return {
		id: `dryrun-ownership:${payload.token_chain}:${payload.token_chain_id}:${payload.normalized_contract_address}`,
		token_chain: payload.token_chain,
		token_chain_id: payload.token_chain_id,
		contract_address: payload.contract_address,
		normalized_contract_address: payload.normalized_contract_address,
		launch_type: payload.launch_type ?? null,
		launch_platform: payload.launch_platform ?? "unknown",
		owner_claim_status: payload.owner_claim_status ?? "unclaimed",
		creator_wallet_identity_id: payload.creator_wallet_identity_id ?? null,
		creator_user_id: payload.creator_user_id ?? null,
		owner_wallet_identity_id: payload.owner_wallet_identity_id ?? null,
		owner_user_id: payload.owner_user_id ?? null,
		claimed_at: payload.claimed_at ?? null,
		verified_at: payload.verified_at ?? null,
		ownership_source: payload.ownership_source ?? "manual",
		ownership_metadata: payload.ownership_metadata ?? {},
		created_at: now,
		updated_at: now,
	};
}

function synthesizeTokenOwnershipRow(
	existing: TokenOwnershipRow,
	payload: ControlPlaneInsert<"control_plane_token_ownerships">,
): TokenOwnershipRow {
	return {
		...existing,
		launch_type: payload.launch_type ?? null,
		launch_platform: payload.launch_platform ?? existing.launch_platform,
		owner_claim_status: payload.owner_claim_status ?? existing.owner_claim_status,
		creator_wallet_identity_id: payload.creator_wallet_identity_id ?? null,
		creator_user_id: payload.creator_user_id ?? null,
		owner_wallet_identity_id: payload.owner_wallet_identity_id ?? null,
		owner_user_id: payload.owner_user_id ?? null,
		claimed_at: payload.claimed_at ?? null,
		verified_at: payload.verified_at ?? null,
		ownership_source: payload.ownership_source ?? existing.ownership_source,
		ownership_metadata: payload.ownership_metadata ?? existing.ownership_metadata,
	};
}

function createDryRunTokenRuntimeRow(
	payload: ControlPlaneInsert<"control_plane_token_runtime_states">,
): TokenRuntimeStateRow {
	const now = new Date().toISOString();
	return {
		id: `dryrun-runtime:${payload.token_chain}:${payload.token_chain_id}:${payload.normalized_contract_address}`,
		token_ownership_id: payload.token_ownership_id,
		token_chain: payload.token_chain,
		token_chain_id: payload.token_chain_id,
		contract_address: payload.contract_address,
		normalized_contract_address: payload.normalized_contract_address,
		cloud_agent_id: payload.cloud_agent_id ?? null,
		runtime_provider: payload.runtime_provider ?? "milady-cloud",
		agent_status: payload.agent_status ?? "none",
		lifecycle_state: payload.lifecycle_state ?? null,
		billing_mode: payload.billing_mode ?? null,
		infra_reserve_usd: payload.infra_reserve_usd ?? null,
		reserve_url: payload.reserve_url ?? null,
		web_ui_url: payload.web_ui_url ?? null,
		bridge_url: payload.bridge_url ?? null,
		status_reason: payload.status_reason ?? null,
		last_heartbeat_at: payload.last_heartbeat_at ?? null,
		last_status_changed_at: payload.last_status_changed_at ?? null,
		suspended_at: payload.suspended_at ?? null,
		resumed_at: payload.resumed_at ?? null,
		deleted_at: payload.deleted_at ?? null,
		runtime_metadata: payload.runtime_metadata ?? {},
		created_at: now,
		updated_at: now,
	};
}

function synthesizeTokenRuntimeRow(
	existing: TokenRuntimeStateRow,
	payload: ControlPlaneInsert<"control_plane_token_runtime_states">,
): TokenRuntimeStateRow {
	return {
		...existing,
		token_ownership_id: payload.token_ownership_id,
		cloud_agent_id: payload.cloud_agent_id ?? null,
		runtime_provider: payload.runtime_provider ?? existing.runtime_provider,
		agent_status: payload.agent_status ?? existing.agent_status,
		lifecycle_state: payload.lifecycle_state ?? null,
		billing_mode: payload.billing_mode ?? null,
		infra_reserve_usd: payload.infra_reserve_usd ?? null,
		reserve_url: payload.reserve_url ?? null,
		web_ui_url: payload.web_ui_url ?? null,
		bridge_url: payload.bridge_url ?? null,
		status_reason: payload.status_reason ?? null,
		last_heartbeat_at: payload.last_heartbeat_at ?? null,
		last_status_changed_at: payload.last_status_changed_at ?? null,
		suspended_at: payload.suspended_at ?? null,
		resumed_at: payload.resumed_at ?? null,
		deleted_at: payload.deleted_at ?? null,
		runtime_metadata: payload.runtime_metadata ?? existing.runtime_metadata,
	};
}

function createDryRunAllowlistRow(payload: ControlPlaneInsert<"control_plane_launch_gate_allowlist">): AllowlistRow {
	const now = new Date().toISOString();
	return {
		id: `dryrun-allowlist:${payload.chain}:${payload.chain_id}:${payload.normalized_address}`,
		wallet_identity_id: payload.wallet_identity_id ?? null,
		chain: payload.chain,
		chain_id: payload.chain_id,
		address: payload.address,
		normalized_address: payload.normalized_address,
		added_by_user_id: payload.added_by_user_id ?? null,
		added_by_wallet_identity_id: payload.added_by_wallet_identity_id ?? null,
		reason: payload.reason ?? null,
		metadata: payload.metadata ?? {},
		created_at: now,
		updated_at: now,
	};
}

function synthesizeAllowlistRow(
	existing: AllowlistRow,
	payload: ControlPlaneInsert<"control_plane_launch_gate_allowlist">,
): AllowlistRow {
	return {
		...existing,
		wallet_identity_id: payload.wallet_identity_id ?? null,
		address: payload.address,
		normalized_address: payload.normalized_address,
		added_by_user_id: payload.added_by_user_id ?? null,
		added_by_wallet_identity_id: payload.added_by_wallet_identity_id ?? null,
		reason: payload.reason ?? null,
		metadata: payload.metadata ?? existing.metadata,
	};
}

function createDryRunInviteCodeRow(payload: ControlPlaneInsert<"control_plane_invite_codes">): InviteCodeRow {
	const now = new Date().toISOString();
	return {
		id: `dryrun-invite:${payload.code}`,
		code: payload.code,
		created_by_user_id: payload.created_by_user_id ?? null,
		created_by_wallet_identity_id: payload.created_by_wallet_identity_id ?? null,
		max_uses: payload.max_uses ?? 1,
		used_count: payload.used_count ?? 0,
		expires_at: payload.expires_at ?? null,
		disabled_at: payload.disabled_at ?? null,
		notes: payload.notes ?? null,
		metadata: payload.metadata ?? {},
		created_at: now,
		updated_at: now,
	};
}

function synthesizeInviteCodeRow(
	existing: InviteCodeRow,
	payload: ControlPlaneInsert<"control_plane_invite_codes">,
): InviteCodeRow {
	return {
		...existing,
		created_by_user_id: payload.created_by_user_id ?? null,
		created_by_wallet_identity_id: payload.created_by_wallet_identity_id ?? null,
		max_uses: payload.max_uses ?? existing.max_uses,
		used_count: payload.used_count ?? existing.used_count,
		expires_at: payload.expires_at ?? null,
		disabled_at: payload.disabled_at ?? null,
		notes: payload.notes ?? null,
		metadata: payload.metadata ?? existing.metadata,
	};
}

function createDryRunInviteRedemptionRow(
	payload: ControlPlaneInsert<"control_plane_invite_redemptions">,
): InviteRedemptionRow {
	return {
		id: `dryrun-redemption:${payload.invite_code_id}:${payload.redeemed_by_wallet_identity_id}`,
		invite_code_id: payload.invite_code_id,
		redeemed_by_wallet_identity_id: payload.redeemed_by_wallet_identity_id,
		redeemed_by_user_id: payload.redeemed_by_user_id ?? null,
		metadata: payload.metadata ?? {},
		created_at: payload.created_at ?? new Date().toISOString(),
	};
}

function synthesizeInviteRedemptionRow(
	existing: InviteRedemptionRow,
	payload: ControlPlaneInsert<"control_plane_invite_redemptions">,
): InviteRedemptionRow {
	return {
		...existing,
		redeemed_by_user_id: payload.redeemed_by_user_id ?? null,
		metadata: payload.metadata ?? existing.metadata,
		created_at: payload.created_at ?? existing.created_at,
	};
}
