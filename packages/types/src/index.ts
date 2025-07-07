import type { Address as SolanaAddressLikeImport } from "@solana/kit";
import type { Address as EvmAddressLikeImport, Hash } from "viem";
import type { Types } from "mongoose";

export type EvmAddressLike = EvmAddressLikeImport;
export type SolanaAddressLike = SolanaAddressLikeImport;

export type TChain = "solana" | "evm";

export type AddressLike = SolanaAddressLike | EvmAddressLike;

export enum SolanaNetworkIds {
	Mainnet = 101,
	Devnet = 103,
}

export interface SlotInfo {
	slot: number;
	parent: number;
	root: number;
}

export type FalModelMode = "image" | "llm" | "audio" | "video";
export type FALModels = {
	image: {
		fast: string;
		ultra: string;
	};
	llm: {
		gemini: string;
	};
	audio: {
		mmaudiov2: string;
	};
	video: {
		klingVideo: string;
	};
};

export type TSupportProtocol = "uniswapv2" | "uniswapv3" | "uniswapv4";

export enum EvmChainIds {
	BaseMainnet = 8453,
	BaseSepolia = 84532,
	EthereumMainnet = 1,
	EthereumSepolia = 11155111,
}

export type TURLLike = `https://${string}` | `http://${string}`;

export type TChainId = TChain extends "solana" ? SolanaNetworkIds : EvmChainIds;

export interface SolanaTokenLookup {
	chain: "solana";
	chainId: SolanaNetworkIds;
	contractAddress: AddressLike;
}

export interface EvmTokenLookup {
	chain: Exclude<TChain, "solana">;
	chainId: EvmChainIds;
	contractAddress: AddressLike;
}

export type ITokenLookUp = SolanaTokenLookup | EvmTokenLookup;

export interface IToken<T extends TChain = TChain> extends Omit<MongooseDocument, "updatedAt" | "createdAt"> {
	contractAddress: T extends "solana" ? SolanaAddressLike : EvmAddressLike;
	chain: T;
	chainId: T extends "solana" ? SolanaNetworkIds : EvmChainIds;
	name: string;
	ticker: string;
	image: TURLLike;
	description?: string;
	price: number;
	totalSupply: number;
	marketcap: number;
	volume24h: number;
	decimals: number;
	holders: number;
	status: string;
	metadataUrl?: TURLLike;
	bondingCurveBalance?: number;
	bondingCurveAddress?: AddressLike;
	curveCompleted?: boolean;
	curveProgress?: number;
	curveLimit?: number;
	reserveAmount?: number;
	reserveLamport?: number;
	virtualReserves?: number;
	socials: ITokenSocials;
	version: number;
	creator?: T extends "solana" ? SolanaAddressLike : EvmAddressLike;
	hidden?: boolean;
	featured?: boolean;
	imported?: boolean;
	verified?: boolean;
	pool?: string;
	isToken2022?: boolean;
	tradingStartsAt?: Date;
	lastClaimedAt?: Date;
	maxBuyAmount?: number;
	delayForTrade?: number;
	createdAt?: string;
	updatedAt?: string;
}

export interface ITokenSocials {
	twitter?: TURLLike;
	website?: TURLLike;
	discord?: TURLLike;
	telegram?: TURLLike;
}

export interface IPresale extends Omit<MongooseDocument, "updatedAt" | "createdAt"> {
	contractAddress: AddressLike;
	chain: TChain;
	chainId: number;
	name: string;
	symbol: string;
	image: TURLLike;
	description: string;
	totalSupply: number;
	decimals: number;

	presaleAddress?: AddressLike;
	creator: AddressLike;
	status: "draft" | "active" | "paused" | "completed" | "cancelled" | "failed";

	tokenomics: {
		presaleAllocation: number;
		liquidityAllocation: number;
		teamAllocation: number;
		marketingAllocation: number;
		developmentAllocation: number;
		communityAllocation: number;
		otherAllocation?: number;
		vestingSchedule?: {
			teamVesting: {
				percentage: number;
				cliff: number;
				duration: number;
			};
			marketingVesting: {
				percentage: number;
				cliff: number;
				duration: number;
			};
		};
	};

	raise: {
		targetAmount: number;
		targetAmountUsd?: number;
		minimumRaise: number;
		minimumRaiseUsd?: number;
		maximumRaise: number;
		maximumRaiseUsd?: number;
		raisedAmount: number;
		raisedAmountUsd?: number;
		softCap: number;
		softCapUsd?: number;
		hardCap: number;
		hardCapUsd?: number;
		pricePerToken: number;
		pricePerTokenUsd?: number;
		targetMarketcap?: number;
		targetMarketcapUsd?: number;
		currency: "USDT" | "USDC" | "ETH" | "SOL" | "BNB";
		currencyAddress?: AddressLike;
	};

	schedule: {
		startDate: Date;
		endDate: Date;
		claimDate?: Date;
		vestingStartDate?: Date;
	};

	allocations: {
		presale: {
			percentage: number;
			amount: number;
			price: number;
		};
		liquidity: {
			percentage: number;
			amount: number;
			lockDuration: number;
		};
		team?: {
			percentage: number;
			amount: number;
			vestingMonths: number;
		};
		marketing?: {
			percentage: number;
			amount: number;
			vestingMonths: number;
		};
		development?: {
			percentage: number;
			amount: number;
			vestingMonths: number;
		};
		community?: {
			percentage: number;
			amount: number;
		};
		staking?: {
			percentage: number;
			amount: number;
			lockDuration: number;
			apy?: number;
		};
		reserves?: {
			percentage: number;
			amount: number;
			purpose: string;
		};
		vc?: {
			rounds: Array<{
				round: string;
				percentage: number;
				amount: number;
				price: number;
				vestingMonths: number;
				cliffMonths: number;
				investors?: string[];
			}>;
			totalPercentage: number;
			totalAmount: number;
		};
	};

	utility: {
		description: string;
		features: string[];
		useCases: string[];
		benefits: string[];
	};

	roadmap: {
		phases: Array<{
			phase: string;
			title: string;
			description: string;
			estimatedDate: Date;
			completed: boolean;
			milestones: string[];
		}>;
	};

	team: {
		members: Array<{
			name: string;
			role: string;
			avatar?: TURLLike;
			linkedin?: TURLLike;
			twitter?: TURLLike;
			github?: TURLLike;
		}>;
		description: string;
	};

	socials: {
		website?: TURLLike;
		twitter?: TURLLike;
		telegram?: TURLLike;
		discord?: TURLLike;
		medium?: TURLLike;
		github?: TURLLike;
		linkedin?: TURLLike;
		youtube?: TURLLike;
		whitepaper?: TURLLike;
	};

	kyc: {
		completed: boolean;
		provider?: string;
		reportUrl?: TURLLike;
		completedAt?: Date;
	};

	audit: {
		completed: boolean;
		provider?: string;
		reportUrl?: TURLLike;
		completedAt?: Date;
	};

	participants: Array<{
		address: AddressLike;
		amount: number;
		tokens: number;
		participatedAt: Date;
		claimed: boolean;
		claimedAt?: Date;
		signature?: string;
		refunded?: boolean;
		refundedAt?: Date;
	}>;

	settings: {
		minimumInvestment: number;
		maximumInvestment: number;
		refundable: boolean;
		whitelistRequired: boolean;
		whitelistAddresses?: AddressLike[];
		kycRequired: boolean;
		vestingEnabled: boolean;
	};

	stats: {
		totalParticipants: number;
		totalInvested: number;
		totalInvestedUsd?: number;
		averageInvestment: number;
		averageInvestmentUsd?: number;
		largestInvestment: number;
		largestInvestmentUsd?: number;
		smallestInvestment: number;
		smallestInvestmentUsd?: number;
		completionPercentage: number;
	};

	metadataUrl?: TURLLike;
	hidden: boolean;
	featured: boolean;
	verified: boolean;

	createdAt?: Date;
	updatedAt?: Date;
}

export type CreatePresaleBody = {
	totalSupply: number;
	decimals: number;
	image?: string;
	tokenomics: {
		presaleAllocation: number;
		liquidityAllocation: number;
		teamAllocation: number;
		vesting: string;
	};
	raise: {
		targetAmount: number;
		targetAmountUsd: number;
		pricePerToken: number;
		pricePerTokenUsd: number;
		currency: string;
		minGoal: number;
		maxGoal: number;
	};
	schedule: {
		startDate: string;
		endDate: string;
		claimDate?: string;
	};
	allocations: IPresale["allocations"];
	utility: IPresale["utility"];
	roadmap: IPresale["roadmap"];
	team: IPresale["team"];
	socials: IPresale["socials"];
	kyc: IPresale["kyc"];
	audit: IPresale["audit"];
	settings: IPresale["settings"];
	metadata?: Record<string, unknown>;
	description: string;
	chain: TChain;
	chainId: number;
	contractAddress: AddressLike;
	name: string;
	symbol: string;
	creator: AddressLike;
};

export interface IUser {
	address: AddressLike;
	suspended?: boolean;
	displayName?: string;
	avatar?: TURLLike;
	verified?: boolean;
	twitter?: string;
	points?: number;
	weekly_points?: number;
	// Admin fields
	adminRole?: "super_admin" | "admin" | "moderator";
	adminPermissions?: string[];
	adminCreatedBy?: AddressLike;
	adminCreatedAt?: Date;
}

export type TChatRooms = "1000" | "100000" | "1000000";

export interface IHolder {
	address: AddressLike;
	balance: number | string;
	balanceFormatted: number | string;
	percentage: number;
	isBondingCurve?: boolean;
	isCreator?: boolean;
}

export interface ITrade {
	address: AddressLike;
	type: "buy" | "sell";
	txId: string;
	fromToken: string;
	fromAmount: string | bigint | number;
	toAmount: string | bigint | number;
	usdValue?: string | bigint | number;
	timestamp: number;
}

interface MongooseDocument {
	_id?: Types.ObjectId | string;
	createdAt?: string;
	updatedAt?: string;
}

export interface IChatMessage extends MongooseDocument {
	contractAddress: Pick<IToken, "contractAddress">;
	sender: AddressLike;
	room: TChatRooms;
	image?: TURLLike;
	message: string;
}

export interface IFile {
	data: string | Buffer;
	mimetype: string;
}

export interface ISwapToken {
	tokenAddress: AddressLike;
	amount: string | number | bigint;
	symbol: string;
	decimals: number;
	amountFormatted: string | number | bigint;
}

export interface IRecentTransaction {
	from?: AddressLike;
	status: "success" | "reverted" | "pending";
	txId: Hash | string;
	chain: TChain;
	chainId: TChainId;
	protocol?: TSupportProtocol;
	input?: ISwapToken;
	output?: ISwapToken;
	timestamp?: Date;
}

export enum MediaType {
	IMAGE = "image",
	VIDEO = "video",
	AUDIO = "audio",
}

export interface IMigration {
	_id?: string;
	withdrawnAt?: Date | undefined;
	migratedAt?: Date | undefined;
	marketId?: string | undefined;
	description?: string | undefined;
	baseVault?: string | undefined;
	quoteVault?: string | undefined;
	withdrawnAmount?: number | undefined;
	migration?: string | undefined;
	withdrawnAmounts?: string | undefined;
	poolInfo?: string | undefined;
	poolKeys?: string | undefined;
	lockLpTxId?: string | undefined;
	primaryNftMint?: string | undefined;
	secondaryNftMint?: string | undefined;
	status: "active" | "migrating" | "migrated" | "finalized" | "failed";
	protocolState?: string | undefined;
	protocol: "raydium" | "meteora";
	currentStep?: number | undefined;
	lastSuccessfulStep?: number | undefined;
	positionIds?: string[] | undefined;
	positionNftsSecrets?: string[] | undefined;
	nftMinted?: string[] | undefined;
	contractAddress: AddressLike;
	chain: TChain;
	chainId: TChainId;
	creator: string;
	version: number;
	createdAt?: Date | undefined;
	updatedAt?: Date | undefined;
	startedAt?: Date | undefined;
}

export type IAdvancedSettingsProps = {
	settings: ISwapSettings;
	onChange?: (settings: ISwapSettings) => void;
};

export type ISwapSettings = {
	speed: "normal" | "turbo" | "ultra";
	slippage: string;
	deadline: string;
};

export interface IAgent {
	_id: string;
	name: string;
	bio: string;
	createdBy: string;
	avatar: string;
	contractAddress: Pick<IToken, "contractAddress">;
	chain: Pick<IToken, "chain">;
	chainId: Pick<IToken, "chainId">;
}

export interface IEventsMeta {
	_id?: string;
	programId: string;
	networkId: string;
	currentBlock: number;
	highestSyncedBlock: number;
	minBlock: number;
	doneGenesisSync: boolean;
	lastSyncTimestamp: Date;
	isActive: boolean;
}
