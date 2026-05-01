import { and, desc, ne, sql } from "drizzle-orm";

import type { Database } from "./client.js";
import * as creatorQueries from "./queries/creators.js";
import * as healthQueries from "./queries/health.js";
import * as inviteQueries from "./queries/invites.js";
import * as launchQueries from "./queries/launches.js";
import * as tokenQueries from "./queries/tokens.js";
import * as waifuQueries from "./queries/waifus.js";
import { agentWallets } from "./schema/agent-wallets.js";
import { agents } from "./schema/agents.js";
import { tokens } from "./schema/tokens.js";

export interface ActiveAgentRecord {
	id: string;
	name: string;
	tokenAddress: string | null;
	treasuryAddress: string | null;
	cachedBalance: string | null;
}

export interface DbClient {
	ping: () => Promise<boolean>;
	health: () => Promise<healthQueries.HealthCheckResult>;
	listTokens: (query: tokenQueries.TokenListQuery) => Promise<tokenQueries.TokenSummary[]>;
	getTokenByAddress: (address: string) => Promise<tokenQueries.TokenDetail | null>;
	listTokenTrades: (query: tokenQueries.TokenTradesQuery) => Promise<tokenQueries.TradeRecord[]>;
	createLaunch: (
		creatorAddress: string,
		input: launchQueries.CreateLaunchInput,
		options: { curatedLaunchOnly: boolean },
	) => Promise<launchQueries.LaunchRecord>;
	getLaunchById: (id: string) => Promise<launchQueries.LaunchRecord | null>;
	listAdminLaunches: () => Promise<launchQueries.LaunchRecord[]>;
	updateLaunchStatus: (id: string, status: launchQueries.LaunchStatus) => Promise<launchQueries.LaunchRecord | null>;
	getCreatorProfile: (address: string) => Promise<creatorQueries.CreatorProfile>;
	updateCreatorProfile: (
		address: string,
		input: creatorQueries.UpdateCreatorInput,
	) => Promise<creatorQueries.CreatorProfile>;
	validateInviteCode: (code: string) => Promise<inviteQueries.ValidateInviteCodeResult>;
	createInviteCode: (input: inviteQueries.CreateInviteCodeInput) => Promise<inviteQueries.InviteCodeRecord>;
	listInviteCodes: () => Promise<inviteQueries.InviteCodeRecord[]>;
	getTokenChartData: (query: tokenQueries.ChartQuery) => Promise<tokenQueries.CandleRecord[]>;
	linkAgentToToken: (tokenAddress: string, agentId: string) => Promise<void>;
	listActiveAgents: (limit?: number) => Promise<ActiveAgentRecord[]>;
	listTopAgentsByTreasury: (limit?: number) => Promise<ActiveAgentRecord[]>;
	listWaifus: (query: waifuQueries.WaifuListQuery) => Promise<waifuQueries.WaifuSummary[]>;
	getWaifuById: (id: string) => Promise<waifuQueries.WaifuDetail | null>;
	getWaifuStatus: (id: string, requesterAddress?: string) => Promise<waifuQueries.WaifuStatus | null>;
	listWaifuEvents: (query: waifuQueries.WaifuEventsQuery) => Promise<waifuQueries.WaifuEventRecord[]>;
	getWaifuClaimState: (id: string, requesterAddress?: string) => Promise<waifuQueries.WaifuClaimState | null>;
	claimWaifu: (id: string, requesterAddress?: string) => Promise<waifuQueries.WaifuClaimState | null>;
	getWaifuCommands: (id: string, requesterAddress?: string) => Promise<waifuQueries.WaifuCommandAvailability[] | null>;
	issueWaifuCommand: (
		id: string,
		input: waifuQueries.WaifuCommandInput,
		requesterAddress?: string,
	) => Promise<waifuQueries.WaifuCommandResult | null>;
}

/**
 * Create a DbClient repository from a Drizzle database instance.
 * This implements the DbClient interface required by the API.
 */
export function createDbRepository(db: Database): Database & DbClient {
	const repository: DbClient = {
		ping: () => healthQueries.ping(db),
		health: () => healthQueries.health(db),
		listTokens: (query) => waifuQueries.listWaifus(db, query) as any,
		getTokenByAddress: (address) => waifuQueries.getWaifuById(db, address) as any,
		listTokenTrades: (query) => tokenQueries.listTokenTrades(db, query),
		createLaunch: (creatorAddress, input, options) => launchQueries.createLaunch(db, creatorAddress, input, options),
		getLaunchById: (id) => launchQueries.getLaunchById(db, id),
		listAdminLaunches: () => launchQueries.listAdminLaunches(db),
		updateLaunchStatus: (id, status) => launchQueries.updateLaunchStatus(db, id, status),
		getCreatorProfile: (address) => creatorQueries.getCreatorProfile(db, address),
		updateCreatorProfile: (address, input) => creatorQueries.updateCreatorProfile(db, address, input),
		validateInviteCode: (code) => inviteQueries.validateInviteCode(db, code),
		createInviteCode: (input) => inviteQueries.createInviteCode(db, input),
		listInviteCodes: () => inviteQueries.listInviteCodes(db),
		getTokenChartData: (query) => tokenQueries.getTokenChartData(db, query),
		linkAgentToToken: (tokenAddress, agentId) => tokenQueries.linkAgentToToken(db, tokenAddress, agentId),
		listActiveAgents: (limit = 100) => listActiveAgents(db, limit),
		listTopAgentsByTreasury: (limit = 25) => listTopAgentsByTreasury(db, limit),
		listWaifus: (query) => waifuQueries.listWaifus(db, query),
		getWaifuById: (id) => waifuQueries.getWaifuById(db, id),
		getWaifuStatus: (id, requesterAddress) => waifuQueries.getWaifuStatus(db, id, requesterAddress),
		listWaifuEvents: (query) => waifuQueries.listWaifuEvents(db, query),
		getWaifuClaimState: (id, requesterAddress) => waifuQueries.getWaifuClaimState(db, id, requesterAddress),
		claimWaifu: (id, requesterAddress) => waifuQueries.claimWaifu(db, id, requesterAddress),
		getWaifuCommands: (id, requesterAddress) => waifuQueries.getWaifuCommands(db, id, requesterAddress),
		issueWaifuCommand: (id, input, requesterAddress) => waifuQueries.issueWaifuCommand(db, id, input, requesterAddress),
	};

	return Object.assign(db, repository);
}

async function listActiveAgents(db: Database, limit: number): Promise<ActiveAgentRecord[]> {
	const rows = await db
		.select({
			id: agents.id,
			name: agents.name,
			tokenAddress: tokens.contractAddress,
			treasuryAddress: agentWallets.safeAddress,
			cachedBalance: agents.infraReserveUsd,
		})
		.from(agents)
		.leftJoin(tokens, sql`${tokens.id} = ${agents.tokenId}`)
		.leftJoin(agentWallets, sql`${agentWallets.internalAgentId} = ${agents.id}::text`)
		.where(and(ne(agents.agentStatus, "killed"), sql`${agents.lifecycleState} is distinct from 'killed'`))
		.limit(limit);

	return rows;
}

async function listTopAgentsByTreasury(db: Database, limit: number): Promise<ActiveAgentRecord[]> {
	const rows = await db
		.select({
			id: agents.id,
			name: agents.name,
			tokenAddress: tokens.contractAddress,
			treasuryAddress: agentWallets.safeAddress,
			cachedBalance: agents.infraReserveUsd,
		})
		.from(agents)
		.leftJoin(tokens, sql`${tokens.id} = ${agents.tokenId}`)
		.leftJoin(agentWallets, sql`${agentWallets.internalAgentId} = ${agents.id}::text`)
		.where(and(ne(agents.agentStatus, "killed"), sql`${agents.lifecycleState} is distinct from 'killed'`))
		.orderBy(desc(sql`coalesce(${agents.infraReserveUsd}, '0')::numeric`))
		.limit(limit);

	return rows;
}
