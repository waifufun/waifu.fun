import { and, desc, eq, ilike, or } from "drizzle-orm";

import type { Database } from "../client.js";
import { agents } from "../schema/agents.js";
import { events } from "../schema/events.js";
import { launches } from "../schema/launches.js";
import { tokens } from "../schema/tokens.js";

export interface WaifuListQuery {
	status?: "tradable" | "dex" | "staged" | undefined;
	creatorAddress?: string | undefined;
	search?: string | undefined;
	featured?: boolean | undefined;
	limit: number;
}

export type WaifuLaunchType = "native" | "imported";
export type WaifuLaunchPlatform = "pump" | "flap" | "external";
export type WaifuOwnerClaimStatus = "unclaimed" | "claimed" | "verified" | "disputed";
export type WaifuAgentStatus = "none" | "provisioning" | "running" | "suspended" | "failed" | "deleted";
export type WaifuAgentLifecycleState = "birth" | "live" | "dormant" | "reviving";
export type WaifuBillingMode = "owner_credits" | "waifu_treasury_subsidy" | "hybrid";
export type WaifuCommandName = "activate" | "suspend" | "revive" | "resume" | "restart";
export type WaifuCommandAction = "activate" | "suspend" | "revive" | "restart";
export type WaifuEventType =
	| "TokenCreated"
	| "TokenBought"
	| "TokenSold"
	| "FlapTokenProgressChanged"
	| "LaunchedToDEX"
	| "SwapExecuted"
	| "CurveGraduated"
	| "LPLocked"
	| "FeesDistributed"
	| "Staked"
	| "Withdrawn"
	| "RewardClaimed"
	| "RewardNotified"
	| "AgentCreated"
	| "TokenCreate"
	| "TokenPurchase"
	| "TokenSale"
	| "LiquidityAdded"
	| "TradeStop"
	| "NftAdded"
	| "NftRemoved";

export interface WaifuRuntimeOverlay {
	launchType: WaifuLaunchType;
	launchPlatform: WaifuLaunchPlatform;
	ownerClaimStatus: WaifuOwnerClaimStatus;
	agentId: string | null;
	cloudAgentId: string | null;
	agentStatus: WaifuAgentStatus;
	agentLifecycleState: WaifuAgentLifecycleState | null;
	billingMode: WaifuBillingMode | null;
	infraReserveUsd: number | null;
	webUiUrl: string | null;
	lastTradeAt: string | null;
	suspendAt: string | null;
	reviveAt: string | null;
}

export interface WaifuSummary extends WaifuRuntimeOverlay {
	id: string;
	address: string;
	name: string;
	symbol: string;
	status: "tradable" | "dex" | "staged";
	progressPercent: number;
	creatorAddress: string;
	price: string;
	marketCap: string;
	volume24h: string;
	holders: number;
	priceChange24h: string;
	createdAt: string;
	image: string | null;
	chain: string;
	chainId: number;
	featured: boolean;
	description: string | null;
}

export interface WaifuDetail extends WaifuSummary {
	description: string;
	metadataCid: string | null;
	metadataUri: string | null;
	quoteTokenSymbol: string;
	quoteTokenAddress: string | null;
	poolAddress: string | null;
	createdBlock: number | null;
}

export interface WaifuCommandAvailability {
	command: WaifuCommandAction;
	available: boolean;
	requiresClaim: boolean;
	reason: string | null;
}

export interface WaifuStatus extends WaifuRuntimeOverlay {
	id: string;
	address: string;
	creatorAddress: string;
	isOwner: boolean;
	canClaim: boolean;
	canManage: boolean;
	commands: WaifuCommandAvailability[];
}

export interface WaifuEventRecord {
	id: string;
	type: WaifuEventType;
	actorAddress: string | null;
	txHash: string;
	blockNumber: number;
	logIndex: number;
	timestamp: string;
	payload: Record<string, unknown>;
	chainId: number;
	portalAddress: string;
	processed: boolean;
}

export interface WaifuEventsQuery {
	id: string;
	limit: number;
	type?: WaifuEventType | undefined;
}

export interface WaifuClaimState {
	id: string;
	address: string;
	creatorAddress: string;
	ownerClaimStatus: WaifuOwnerClaimStatus;
	isOwner: boolean;
	canClaim: boolean;
	canManage: boolean;
}

export interface WaifuCommandInput {
	command: WaifuCommandName;
	billingMode?: WaifuBillingMode | undefined;
}

export interface WaifuCommandResult {
	accepted: boolean;
	command: WaifuCommandName;
	normalizedCommand: WaifuCommandAction;
	appliedAt: string;
	message: string;
	status: WaifuStatus;
}

type WaifuProjectionRow = {
	id: string;
	address: string;
	name: string;
	symbol: string;
	description: string | null;
	status: "active" | "migrating" | "migrated" | "hidden" | "delisted";
	creatorAddress: string;
	price: string | null;
	marketCap: string | null;
	curveProgress: string | null;
	curveLimit: string | null;
	metadataUri: string | null;
	poolAddress: string | null;
	createdAt: Date;
	chainId: number;
	image: string | null;
	isFeatured: boolean;
	volume24h: string | null;
	holderCount: number | null;
	priceChange24h: string | null;
	isImported: boolean;
	launchPlatform: string;
	ownerClaimStatus: string;
	tokenAgentId: string | null;
	tokenAgentStatus: string;
	lastTradeAt: Date | null;
	launchType: string | null;
	agentRowId: string | null;
	cloudAgentId: string | null;
	agentRowStatus: string | null;
	lifecycleState: string | null;
	billingMode: string | null;
	infraReserveUsd: string | null;
	webUiUrl: string | null;
};

function mapTokenStatus(
	dbStatus: "active" | "migrating" | "migrated" | "hidden" | "delisted",
): "tradable" | "dex" | "staged" {
	switch (dbStatus) {
		case "active":
			return "tradable";
		case "migrated":
			return "dex";
		default:
			return "staged";
	}
}

function mapApiStatusToDb(
	apiStatus: "tradable" | "dex" | "staged",
): "active" | "migrating" | "migrated" | "hidden" | "delisted" {
	switch (apiStatus) {
		case "tradable":
			return "active";
		case "dex":
			return "migrated";
		case "staged":
			return "migrating";
	}
}

function calculateProgress(curveProgress: string | null, curveLimit: string | null): number {
	if (!curveProgress || !curveLimit) return 0;
	const progress = Number.parseFloat(curveProgress);
	const limit = Number.parseFloat(curveLimit);
	if (!Number.isFinite(progress) || !Number.isFinite(limit) || limit <= 0) return 0;
	return Math.min(100, Math.round((progress / limit) * 100));
}

function toIso(value: Date | null | undefined): string | null {
	return value ? value.toISOString() : null;
}

function toNullableNumber(value: string | null | undefined): number | null {
	if (value == null) return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLaunchType(isImported: boolean, launchType: string | null): WaifuLaunchType {
	if (launchType === "imported") return "imported";
	if (launchType === "native") return "native";
	return isImported ? "imported" : "native";
}

function normalizeLaunchPlatform(platform: string | null | undefined): WaifuLaunchPlatform {
	switch ((platform ?? "").toLowerCase()) {
		case "pump":
			return "pump";
		case "flap":
			return "flap";
		default:
			return "external";
	}
}

function normalizeOwnerClaimStatus(status: string | null | undefined): WaifuOwnerClaimStatus {
	switch ((status ?? "").toLowerCase()) {
		case "claimed":
			return "claimed";
		case "verified":
			return "verified";
		case "disputed":
			return "disputed";
		default:
			return "unclaimed";
	}
}

function normalizeAgentStatus(status: string | null | undefined): WaifuAgentStatus {
	switch ((status ?? "").toLowerCase()) {
		case "provisioning":
		case "starting":
		case "restarting":
		case "reviving":
			return "provisioning";
		case "running":
		case "ready":
		case "active":
		case "live":
			return "running";
		case "suspended":
		case "stopped":
		case "stopping":
		case "paused":
			return "suspended";
		case "failed":
		case "error":
		case "errored":
			return "failed";
		case "deleted":
		case "removed":
			return "deleted";
		default:
			return "none";
	}
}

function normalizeLifecycleState(
	lifecycleState: string | null | undefined,
	agentStatus: WaifuAgentStatus,
): WaifuAgentLifecycleState | null {
	switch ((lifecycleState ?? "").toLowerCase()) {
		case "birth":
			return "birth";
		case "live":
			return "live";
		case "dormant":
			return "dormant";
		case "reviving":
			return "reviving";
	}

	switch (agentStatus) {
		case "provisioning":
			return "birth";
		case "running":
			return "live";
		case "suspended":
		case "none":
		case "deleted":
			return "dormant";
		case "failed":
			return null;
	}
}

function normalizeBillingMode(mode: string | null | undefined): WaifuBillingMode | null {
	switch ((mode ?? "").toLowerCase()) {
		case "owner_credits":
			return "owner_credits";
		case "waifu_treasury_subsidy":
			return "waifu_treasury_subsidy";
		case "hybrid":
			return "hybrid";
		default:
			return null;
	}
}

function buildCommandAvailability(
	command: WaifuCommandAction,
	available: boolean,
	reason: string | null,
): WaifuCommandAvailability {
	return {
		command,
		available,
		requiresClaim: true,
		reason,
	};
}

function buildWaifuCommands(status: Pick<WaifuStatus, "agentStatus" | "canManage" | "ownerClaimStatus">) {
	const ownerReason = "Only the creator can manage runtime";
	const claimReason = "Claim ownership before sending runtime commands";

	if (!status.canManage) {
		return [
			buildCommandAvailability("activate", false, ownerReason),
			buildCommandAvailability("suspend", false, ownerReason),
			buildCommandAvailability("revive", false, ownerReason),
			buildCommandAvailability("restart", false, ownerReason),
		];
	}

	if (status.ownerClaimStatus === "unclaimed") {
		return [
			buildCommandAvailability("activate", false, claimReason),
			buildCommandAvailability("suspend", false, claimReason),
			buildCommandAvailability("revive", false, claimReason),
			buildCommandAvailability("restart", false, claimReason),
		];
	}

	return [
		buildCommandAvailability(
			"activate",
			status.agentStatus === "none" || status.agentStatus === "failed" || status.agentStatus === "deleted",
			status.agentStatus === "running"
				? "Runtime is already active"
				: status.agentStatus === "suspended"
					? 'Use "revive" to bring a suspended runtime back online'
					: null,
		),
		buildCommandAvailability(
			"suspend",
			status.agentStatus === "running" || status.agentStatus === "provisioning",
			status.agentStatus === "suspended"
				? "Runtime is already suspended"
				: status.agentStatus === "none"
					? "No runtime is active for this waifu"
					: null,
		),
		buildCommandAvailability(
			"revive",
			status.agentStatus === "suspended" || status.agentStatus === "failed" || status.agentStatus === "deleted",
			status.agentStatus === "running"
				? "Runtime is already active"
				: status.agentStatus === "none"
					? "Activate the runtime before reviving it"
					: null,
		),
		buildCommandAvailability(
			"restart",
			status.agentStatus === "running" || status.agentStatus === "suspended",
			status.agentStatus === "none"
				? "No runtime is active for this waifu"
				: status.agentStatus === "provisioning"
					? "Runtime is already provisioning"
					: null,
		),
	];
}

function mapWaifuOverlay(row: WaifuProjectionRow): WaifuRuntimeOverlay {
	const agentStatus = normalizeAgentStatus(row.agentRowStatus ?? row.tokenAgentStatus);

	return {
		launchType: normalizeLaunchType(row.isImported, row.launchType),
		launchPlatform: normalizeLaunchPlatform(row.launchPlatform),
		ownerClaimStatus: normalizeOwnerClaimStatus(row.ownerClaimStatus),
		agentId: row.agentRowId ?? row.tokenAgentId ?? null,
		cloudAgentId: row.cloudAgentId ?? row.tokenAgentId ?? null,
		agentStatus,
		agentLifecycleState: normalizeLifecycleState(row.lifecycleState, agentStatus),
		billingMode: normalizeBillingMode(row.billingMode),
		infraReserveUsd: toNullableNumber(row.infraReserveUsd),
		webUiUrl: row.webUiUrl ?? null,
		lastTradeAt: toIso(row.lastTradeAt),
		suspendAt: null,
		reviveAt: null,
	};
}

function mapWaifuSummary(row: WaifuProjectionRow): WaifuSummary {
	return {
		id: row.address,
		address: row.address,
		name: row.name,
		symbol: row.symbol,
		status: mapTokenStatus(row.status),
		progressPercent: calculateProgress(row.curveProgress, row.curveLimit),
		creatorAddress: row.creatorAddress,
		price: row.price ?? "0",
		marketCap: row.marketCap ?? "0",
		volume24h: row.volume24h ?? "0",
		holders: Number(row.holderCount ?? 0),
		priceChange24h: row.priceChange24h ?? "0",
		createdAt: row.createdAt.toISOString(),
		image: row.image ?? null,
		chain: "evm",
		chainId: row.chainId,
		featured: row.isFeatured,
		description: row.description ?? null,
		...mapWaifuOverlay(row),
	};
}

function mapWaifuDetail(row: WaifuProjectionRow): WaifuDetail {
	let metadataCid: string | null = null;
	if (row.metadataUri) {
		const cidMatch = row.metadataUri.match(/(?:ipfs:\/\/|\/ipfs\/)([a-zA-Z0-9]+)/);
		metadataCid = cidMatch?.[1] ?? null;
	}

	return {
		...mapWaifuSummary(row),
		description: row.description ?? "",
		metadataCid,
		metadataUri: row.metadataUri ?? null,
		quoteTokenSymbol: "BNB",
		quoteTokenAddress: null,
		poolAddress: row.poolAddress ?? null,
		createdBlock: null,
	};
}

function mapWaifuStatus(row: WaifuProjectionRow, requesterAddress?: string): WaifuStatus {
	const overlay = mapWaifuOverlay(row);
	const isOwner = requesterAddress?.toLowerCase() === row.creatorAddress.toLowerCase();

	const status: WaifuStatus = {
		id: row.address,
		address: row.address,
		creatorAddress: row.creatorAddress,
		isOwner,
		canClaim: isOwner && overlay.ownerClaimStatus === "unclaimed",
		canManage: isOwner,
		commands: [],
		...overlay,
	};

	status.commands = buildWaifuCommands(status);
	return status;
}

function mapWaifuClaimState(row: WaifuProjectionRow, requesterAddress?: string): WaifuClaimState {
	const status = mapWaifuStatus(row, requesterAddress);

	return {
		id: row.address,
		address: row.address,
		creatorAddress: row.creatorAddress,
		ownerClaimStatus: status.ownerClaimStatus,
		isOwner: status.isOwner,
		canClaim: status.canClaim,
		canManage: status.canManage,
	};
}

function normalizeCommand(command: WaifuCommandName): WaifuCommandAction {
	switch (command) {
		case "resume":
			return "revive";
		default:
			return command;
	}
}

function baseProjectionSelect() {
	return {
		id: tokens.id,
		address: tokens.contractAddress,
		name: tokens.name,
		symbol: tokens.ticker,
		description: tokens.description,
		status: tokens.status,
		creatorAddress: tokens.creatorAddress,
		price: tokens.currentPrice,
		marketCap: tokens.marketCapUsd,
		curveProgress: tokens.curveProgress,
		curveLimit: tokens.curveLimit,
		metadataUri: tokens.metadataUri,
		poolAddress: tokens.dexPoolAddress,
		createdAt: tokens.createdAt,
		chainId: tokens.chainId,
		image: tokens.imageUrl,
		isFeatured: tokens.isFeatured,
		volume24h: tokens.volume24h,
		holderCount: tokens.holderCount,
		priceChange24h: tokens.priceChange24h,
		isImported: tokens.isImported,
		launchPlatform: tokens.launchPlatform,
		ownerClaimStatus: tokens.ownerClaimStatus,
		tokenAgentId: tokens.agentId,
		tokenAgentStatus: tokens.agentStatus,
		lastTradeAt: tokens.lastTradeAt,
		launchType: launches.tokenType,
		agentRowId: agents.id,
		cloudAgentId: agents.cloudAgentId,
		agentRowStatus: agents.agentStatus,
		lifecycleState: agents.lifecycleState,
		billingMode: agents.billingMode,
		infraReserveUsd: agents.infraReserveUsd,
		webUiUrl: agents.webUiUrl,
	};
}

async function getWaifuProjectionRow(db: Database, id: string): Promise<WaifuProjectionRow | null> {
	const result = await db
		.select(baseProjectionSelect())
		.from(tokens)
		.leftJoin(launches, eq(tokens.launchId, launches.id))
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(eq(tokens.contractAddress, id.toLowerCase()))
		.limit(1);

	return result[0] ?? null;
}

export async function listWaifus(db: Database, query: WaifuListQuery): Promise<WaifuSummary[]> {
	const conditions = [];

	if (query.status) {
		conditions.push(eq(tokens.status, mapApiStatusToDb(query.status)));
	}

	if (query.creatorAddress) {
		conditions.push(eq(tokens.creatorAddress, query.creatorAddress.toLowerCase()));
	}

	if (query.featured !== undefined) {
		conditions.push(eq(tokens.isFeatured, query.featured));
	}

	if (query.search) {
		const searchTerm = `%${query.search.toLowerCase()}%`;
		conditions.push(
			or(ilike(tokens.name, searchTerm), ilike(tokens.ticker, searchTerm), ilike(tokens.contractAddress, searchTerm)),
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const rows = await db
		.select(baseProjectionSelect())
		.from(tokens)
		.leftJoin(launches, eq(tokens.launchId, launches.id))
		.leftJoin(agents, eq(agents.tokenId, tokens.id))
		.where(whereClause)
		.orderBy(desc(tokens.createdAt))
		.limit(query.limit);

	return rows.map(mapWaifuSummary);
}

export async function getWaifuById(db: Database, id: string): Promise<WaifuDetail | null> {
	const row = await getWaifuProjectionRow(db, id);
	return row ? mapWaifuDetail(row) : null;
}

export async function getWaifuStatus(db: Database, id: string, requesterAddress?: string): Promise<WaifuStatus | null> {
	const row = await getWaifuProjectionRow(db, id);
	return row ? mapWaifuStatus(row, requesterAddress) : null;
}

export async function listWaifuEvents(db: Database, query: WaifuEventsQuery): Promise<WaifuEventRecord[]> {
	const conditions = [eq(events.tokenAddress, query.id.toLowerCase())];

	if (query.type) {
		conditions.push(eq(events.eventType, query.type));
	}

	const rows = await db
		.select({
			id: events.id,
			type: events.eventType,
			actorAddress: events.actorAddress,
			txHash: events.txHash,
			blockNumber: events.blockNumber,
			logIndex: events.logIndex,
			timestamp: events.blockTimestamp,
			payload: events.payload,
			chainId: events.chainId,
			portalAddress: events.portalAddress,
			processed: events.processed,
		})
		.from(events)
		.where(and(...conditions))
		.orderBy(desc(events.blockTimestamp), desc(events.blockNumber), desc(events.logIndex))
		.limit(query.limit);

	return rows.map((row) => ({
		id: row.id.toString(),
		type: row.type,
		actorAddress: row.actorAddress ?? null,
		txHash: row.txHash,
		blockNumber: Number(row.blockNumber),
		logIndex: row.logIndex,
		timestamp: row.timestamp.toISOString(),
		payload: row.payload,
		chainId: row.chainId,
		portalAddress: row.portalAddress,
		processed: row.processed,
	}));
}

export async function getWaifuClaimState(
	db: Database,
	id: string,
	requesterAddress?: string,
): Promise<WaifuClaimState | null> {
	const row = await getWaifuProjectionRow(db, id);
	return row ? mapWaifuClaimState(row, requesterAddress) : null;
}

export async function claimWaifu(db: Database, id: string, requesterAddress?: string): Promise<WaifuClaimState | null> {
	await db
		.update(tokens)
		.set({
			ownerClaimStatus: "claimed",
			updatedAt: new Date(),
		})
		.where(eq(tokens.contractAddress, id.toLowerCase()));

	return getWaifuClaimState(db, id, requesterAddress);
}

export async function getWaifuCommands(
	db: Database,
	id: string,
	requesterAddress?: string,
): Promise<WaifuCommandAvailability[] | null> {
	const status = await getWaifuStatus(db, id, requesterAddress);
	return status ? status.commands : null;
}

export async function issueWaifuCommand(
	db: Database,
	id: string,
	input: WaifuCommandInput,
	requesterAddress?: string,
): Promise<WaifuCommandResult | null> {
	const normalizedCommand = normalizeCommand(input.command);
	const appliedAt = new Date();
	const lifecycleState =
		normalizedCommand === "activate" ? "birth" : normalizedCommand === "suspend" ? "dormant" : "reviving";
	const agentStatus = normalizedCommand === "suspend" ? "suspended" : "provisioning";

	await db.transaction(async (tx) => {
		const current = await tx
			.select({
				tokenId: tokens.id,
				contractAddress: tokens.contractAddress,
			})
			.from(tokens)
			.where(eq(tokens.contractAddress, id.toLowerCase()))
			.limit(1);

		const tokenRecord = current[0];
		if (!tokenRecord) {
			return;
		}

		await tx
			.update(tokens)
			.set({
				agentStatus,
				updatedAt: appliedAt,
			})
			.where(eq(tokens.contractAddress, id.toLowerCase()));

		const agentRows = await tx
			.select({
				id: agents.id,
			})
			.from(agents)
			.where(eq(agents.tokenId, tokenRecord.tokenId))
			.limit(1);

		const agentRow = agentRows[0];

		if (agentRow) {
			await tx
				.update(agents)
				.set({
					agentStatus,
					lifecycleState,
					...(input.billingMode ? { billingMode: input.billingMode } : {}),
					updatedAt: appliedAt,
				})
				.where(eq(agents.id, agentRow.id));
		}
	});

	const status = await getWaifuStatus(db, id, requesterAddress);
	if (!status) {
		return null;
	}

	return {
		accepted: true,
		command: input.command,
		normalizedCommand,
		appliedAt: appliedAt.toISOString(),
		message:
			normalizedCommand === "activate"
				? "Runtime activation recorded"
				: normalizedCommand === "suspend"
					? "Runtime suspension recorded"
					: normalizedCommand === "restart"
						? "Runtime restart recorded"
						: "Runtime revival recorded",
		status,
	};
}
