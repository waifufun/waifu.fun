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

export interface IToken<T extends TChain = TChain> extends Omit<MongooseDocument, "updatedAt"> {
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
	bondingCurveAddress?: AddressLike;
	curveCompleted?: boolean;
	curveProgress?: number;
	curveLimit?: number;
	reserveAmount?: number;
	reserveLamport?: number;
	virtualReserves?: number;
	socials: ITokenSocials;
	creator?: T extends "solana" ? SolanaAddressLike : EvmAddressLike;
	hidden?: boolean;
	featured?: boolean;
	imported?: boolean;
	verified?: boolean;
	updatedAt: Date;
	pool?: string;
}

export interface ITokenSocials {
	twitter?: TURLLike;
	website?: TURLLike;
	discord?: TURLLike;
	telegram?: TURLLike;
}

export interface IUser {
	address: AddressLike;
	suspended?: boolean;
	displayName?: string;
	avatar?: TURLLike;
	verified?: boolean;
	twitter?: string;
	points?: number;
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
	lockLpTxId?: string | undefined;
	status: string;
	positionIds?: string[] | undefined;
	positionNftsSecrets?: string[] | undefined;
	nftMinted?: string[] | undefined;
	contractAddress: AddressLike;
	chain: TChain;
	chainId: TChainId;
	creator: string;
	createdAt?: Date | undefined;
	updatedAt?: Date | undefined;
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
