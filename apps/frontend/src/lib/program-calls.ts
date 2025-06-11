import { type Connection, PublicKey, type Transaction } from "@solana/web3.js";
import type { Program, BN } from "@coral-xyz/anchor";
import type { Autofun } from "./autofun";
import { getConfigPda } from "./pdas";

export interface LaunchParams {
	decimals: number;
	tokenSupply: BN;
	virtualLamportReserves: BN;
	curveLimit: BN;
	initBondingCurve: number;
	name: string;
	symbol: string;
	uri: string;
}

export interface LaunchAndSwapParams extends LaunchParams {
	swapAmount: BN;
	minimumReceiveAmount: BN;
	deadline: BN;
}

export interface SwapParams {
	amount: BN;
	direction: number; // 0 for buy, 1 for sell
	minimumReceiveAmount: BN;
	deadline: BN;
}

export interface SetMaxAmountsParams {
	maxBuyAmount: BN;
	maxSellAmount: BN;
}

export interface CompleteEvent {
	user: PublicKey;
	mint: PublicKey;
	bondingCurve: PublicKey;
}

export interface InstantModeSwitchedEvent {
	instantTrade: boolean;
}

export interface MaxAmountsSetEvent {
	bondingCurve: PublicKey;
	creator: PublicKey;
	modifiedTime: BN;
	maxBuyAmount: BN;
	maxSellAmount: BN;
}

// Program Calls
export const launchTx = async (
	user: PublicKey,
	token: PublicKey,
	params: LaunchParams,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const configPda = getConfigPda(program.programId);

	const configAccount = await program.account.config.fetch(configPda);

	const tx = await program.methods
		.launch(
			params.decimals,
			params.tokenSupply,
			params.virtualLamportReserves,
			params.curveLimit,
			params.initBondingCurve,
			params.name,
			params.symbol,
			params.uri,
		)
		.accounts({
			creator: user,
			token,
			teamWallet: configAccount.teamWallet,
		})
		.transaction();

	tx.feePayer = user;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};

export const launchAndSwapTx = async (
	user: PublicKey,
	token: PublicKey,
	params: LaunchAndSwapParams,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const configPda = getConfigPda(program.programId);

	const configAccount = await program.account.config.fetch(configPda);

	const tx = await program.methods
		.launchAndSwap(
			params.decimals,
			params.tokenSupply,
			params.virtualLamportReserves,
			params.curveLimit,
			params.initBondingCurve,
			params.name,
			params.symbol,
			params.uri,
			params.swapAmount,
			params.minimumReceiveAmount,
			params.deadline,
		)
		.accounts({
			creator: user,
			token,
			teamWallet: configAccount.teamWallet,
		})
		.transaction();

	tx.feePayer = user;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};

export const swapTx = async (
	user: PublicKey,
	token: PublicKey,
	params: SwapParams,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const configPda = getConfigPda(program.programId);

	const configAccount = await program.account.config.fetch(configPda);

	const tx = await program.methods
		.swap(params.amount, params.direction, params.minimumReceiveAmount, params.deadline)
		.accounts({
			user,
			tokenMint: token,
			teamWallet: configAccount.teamWallet,
		})
		.transaction();

	tx.feePayer = user;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};

export const setMaxAmountsTx = async (
	authority: PublicKey,
	token: PublicKey,
	params: SetMaxAmountsParams,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const [bondingCurve] = PublicKey.findProgramAddressSync(
		[Buffer.from("bonding_curve"), token.toBuffer()],
		program.programId,
	);

	const tx = await program.methods
		.setMaxAmounts(params.maxBuyAmount, params.maxSellAmount)
		.accounts({
			authority,
			tokenMint: token,
		})
		.transaction();

	tx.feePayer = authority;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};

export const withdrawTx = async (
	user: PublicKey,
	token: PublicKey,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const tx = await program.methods
		.withdraw()
		.accounts({
			admin: user,
			tokenMint: token,
		})
		.transaction();

	tx.feePayer = user;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};

export const switchToInstantModeTx = async (
	authority: PublicKey,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

	const tx = await program.methods
		.switchToInstantMode()
		.accounts({
			authority,
		})
		.transaction();

	tx.feePayer = authority;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};

export const switchToDelayModeTx = async (
	authority: PublicKey,
	connection: Connection,
	program: Program<Autofun>,
): Promise<Transaction> => {
	const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

	const tx = await program.methods
		.switchToDelayMode()
		.accounts({
			authority,
		})
		.transaction();

	tx.feePayer = authority;
	tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

	return tx;
};
