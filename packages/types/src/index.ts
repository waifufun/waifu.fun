import type { Address as SolanaAddressLikeImport } from "@solana/kit";
import type { Address as EvmAddressLikeImport } from "viem";

export type EvmAddressLike = EvmAddressLikeImport;
export type SolanaAddressLike = SolanaAddressLikeImport;

export type TChain = "solana" | "evm";

export type AddressLike = SolanaAddressLike | EvmAddressLike;

export enum SolanaNetworkIds {
	Mainnet = 101,
	Devnet = 103,
}

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

export interface IToken<T extends TChain = TChain> {
	contractAddress: T extends "solana" ? SolanaAddressLike : EvmAddressLike;
	chain: T;
	chainId: T extends "solana" ? SolanaNetworkIds : EvmChainIds;
	name: string;
	ticker: string;
	image: TURLLike;
	price: number;
	totalSupply: number;
	marketcap: number;
	volume24h: number;
	decimals: number;
	holders: number;
	curveCompleted?: boolean;
	curveProgress?: number;
	socials: ITokenSocials;
	creator?: T extends "solana" ? SolanaAddressLike : EvmAddressLike;
	hidden?: boolean;
	featured?: boolean;
	imported?: boolean;
	createdAt?: Date;
	verified?: boolean;
	updatedAt?: Date;
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

export type TChatRooms = 1000 | 100_000 | 1_000_000;

export interface IHolder {
	address: AddressLike;
	balance: number | string;
	balanceFormatted: number | string;
	percentage: number;
	isBondingCurve?: boolean;
	isCreator?: boolean;
}

export interface IChatMessage {
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
