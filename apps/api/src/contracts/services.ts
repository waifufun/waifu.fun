import type { AuthPrincipal } from "./auth.js";
import type { CreatorProfile, UpdateCreatorInput } from "./creators.js";
import type { CreateInviteCodeInput, InviteCodeRecord, ValidateInviteCodeResult } from "./invites.js";
import type { CreateLaunchInput, LaunchPrepareResponse, LaunchRecord, LaunchStatus } from "./launches.js";
import type {
	CandleRecord,
	ChartInterval,
	TokenDetail,
	TokenListQuery,
	TokenListResult,
	TokenTradesQuery,
} from "./tokens.js";
import type { PrepareSwapResponse, TradeQuoteInput, TradeQuoteResponse, TradeRecord } from "./trades.js";

export interface AppConfig {
	app: {
		name: string;
		env: string;
		host: string;
		port: number;
		corsOrigins: string[];
	};
	auth: {
		accessTokenTtlSeconds: number;
		refreshTokenTtlSeconds: number;
	};
	chain: {
		chainId: number;
		rpcUrl: string;
		portalAddress: string;
		nativeQuoteTokenSymbol: "BNB";
	};
	flap: {
		uploadApiUrl: string;
		metadataGatewayBaseUrl: string;
	};
	features: {
		curatedLaunchOnly: boolean;
	};
	steward: {
		jwtSecret: string;
		apiUrl: string;
		tenantId: string;
		tenantApiKey: string;
	};
}

export interface DependencyHealth {
	ok: boolean;
	provider: string;
	notes?: string[];
}

export interface DbClient {
	ping: () => Promise<boolean>;
	health: () => Promise<DependencyHealth>;
	listTokens: (query: TokenListQuery) => Promise<TokenListResult>;
	getTokenByAddress: (address: string) => Promise<TokenDetail | null>;
	listTokenTrades: (query: TokenTradesQuery) => Promise<TradeRecord[]>;
	createLaunch: (
		creatorAddress: string,
		input: CreateLaunchInput,
		options: { curatedLaunchOnly: boolean },
	) => Promise<LaunchRecord>;
	getLaunchById: (id: string) => Promise<LaunchRecord | null>;
	listAdminLaunches: () => Promise<LaunchRecord[]>;
	updateLaunchStatus: (id: string, status: LaunchStatus) => Promise<LaunchRecord | null>;
	getCreatorProfile: (address: string) => Promise<CreatorProfile>;
	updateCreatorProfile: (address: string, input: UpdateCreatorInput) => Promise<CreatorProfile>;
	validateInviteCode: (code: string) => Promise<ValidateInviteCodeResult>;
	createInviteCode: (input: CreateInviteCodeInput) => Promise<InviteCodeRecord>;
	listInviteCodes: () => Promise<InviteCodeRecord[]>;
	getTokenChartData: (query: {
		address: string;
		interval: ChartInterval;
		from: Date;
		to: Date;
		limit: number;
	}) => Promise<CandleRecord[]>;
	linkAgentToToken: (tokenAddress: string, agentId: string) => Promise<void>;
}

export interface FlapClient {
	ping: () => Promise<boolean>;
	health: () => Promise<DependencyHealth>;
	prepareLaunchPayload: (launch: LaunchRecord) => Promise<LaunchPrepareResponse>;
	quoteExactInput: (input: TradeQuoteInput) => Promise<TradeQuoteResponse>;
	prepareSwap: (input: TradeQuoteInput & { traderAddress: string }) => Promise<PrepareSwapResponse>;
}

export interface AppDependencies {
	config: AppConfig;
	db: DbClient;
	flap: FlapClient;
	runtime: {
		startedAt: string;
		compatibilityMode: "local-compat" | "real-db";
		notes: string[];
	};
}

export interface AuthenticatedDependencies {
	deps: AppDependencies;
	auth: AuthPrincipal;
}
