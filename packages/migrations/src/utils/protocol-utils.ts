import {
	type Connection,
	PublicKey,
	Transaction,
	SystemProgram,
	sendAndConfirmTransaction,
	TransactionMessage,
	VersionedTransaction,
	type TransactionConfirmationStatus,
	type Keypair,
} from "@solana/web3.js";
import {
	TOKEN_PROGRAM_ID,
	TOKEN_2022_PROGRAM_ID,
	getAssociatedTokenAddressSync,
	createAssociatedTokenAccountInstruction,
	createTransferInstruction,
} from "@solana/spl-token";
import type { MigrationContext } from "../types";
import DB from "@autofun/database";
import type { ProtocolState } from "../types";
import { derivePositionNftAccount } from "../vaults/meteroaPdas";
import BN from "bn.js";

export interface WithdrawLog {
	sol: number;
	token: number;
}

export interface TransactionResult {
	signature: string;
	confirmed: boolean;
	error?: string;
}

export async function handleTransaction(
	rpc: Connection,
	tx: Transaction | VersionedTransaction,
	wallet: Keypair,
	options: {
		preflightCommitment?: TransactionConfirmationStatus;
		maxRetries?: number;
		timeout?: number;
	} = {},
): Promise<TransactionResult> {
	const { preflightCommitment = "confirmed", maxRetries = 3, timeout = 60000 } = options;

	let retries = 0;
	while (retries < maxRetries) {
		try {
			let signature: string;
			if (tx instanceof Transaction) {
				signature = await rpc.sendTransaction(tx, [wallet], {
					preflightCommitment,
					maxRetries: 0,
				});
			} else if (tx instanceof VersionedTransaction) {
				signature = await rpc.sendTransaction(tx);
			} else {
				throw new Error("Unknown transaction type");
			}

			// Wait for confirmation with timeout
			const confirmationPromise = rpc.confirmTransaction(signature, preflightCommitment);
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error("Transaction confirmation timeout")), timeout),
			);

			try {
				await Promise.race([confirmationPromise, timeoutPromise]);
			} catch (error) {
				// If timeout occurs, check if transaction was actually confirmed
				const status = await rpc.getSignatureStatus(signature);
				if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
					return { signature, confirmed: true };
				}
				throw error;
			}

			return { signature, confirmed: true };
		} catch (error) {
			retries++;
			if (retries === maxRetries) {
				return {
					signature: "",
					confirmed: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
			// Wait before retrying
			await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
		}
	}

	return {
		signature: "",
		confirmed: false,
		error: "Max retries exceeded",
	};
}

export function parseWithdrawLogs(logs: string[]): WithdrawLog {
	let sol = 0;
	let token = 0;
	// biome-ignore lint/complexity/noForEach: <explanation>
	logs.forEach((log) => {
		if (log.includes("withdraw lamports:")) {
			sol = Number(log.replace("Program log: withdraw lamports:", "").trim());
		}
		if (log.includes("withdraw token:")) {
			token = Number(log.replace("Program log: withdraw token:", "").trim());
		}
	});
	return { sol, token };
}

export async function withdrawLiquidity(context: MigrationContext, tokenMint: string): Promise<void> {
	const { rpc, state, wallet, programContext } = context;
	if (!wallet || !programContext) {
		throw new Error("Wallet and program context are required for withdrawal");
	}

	try {
		console.log(`Starting liquidity withdrawal for token ${tokenMint}`);
	{	/* TO do malibu: add the possibility for legacy tokens to be withdrawn , in order to migrate
		Legacy tokens should migrate to meteora and be branded v2 once that is done */ }

		// Create transaction
		const tx = await programContext.autofunProgram.methods
			.withdraw()
			.accounts({
				admin: wallet.publicKey,
				tokenMint: new PublicKey(tokenMint),
			})
			.transaction();

		const result = await handleTransaction(rpc, tx, wallet.payer);

		if (!result.confirmed) {
			throw new Error(`Transaction failed: ${result.error}`);
		}

		// Get transaction logs
		const txInfo = await rpc.getTransaction(result.signature, {
			maxSupportedTransactionVersion: 0,
		});
		const logs = txInfo?.meta?.logMessages || [];

		// Parse withdrawal logs
		const withdrawnAmounts = parseWithdrawLogs(logs);
		// biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
		console.log(`Withdrawal successful. Withdrawn amounts:`, withdrawnAmounts);

		// Update state
		state.withdrawnAmounts = withdrawnAmounts;
		state.txId = result.signature;

		// Update database with withdrawn amounts
		await DB.Migration.findOneAndUpdate(
			{ contractAddress: tokenMint },
			{
				$set: {
					withdrawnAmounts: JSON.stringify(withdrawnAmounts),
					withdrawnAt: new Date(),
					updatedAt: new Date(),
				},
			},
		);
		recordTransaction(state, "withdrawLiquidity", result.signature, withdrawnAmounts);
	} catch (error) {
		console.error("Error withdrawing liquidity:", error);
		throw error;
	}
}

export async function sendNftToManager(
	context: MigrationContext,
	nftMint: string,
	managerAddress: string,
	version: "2022" | "legacy" = "legacy",
): Promise<string> {
	const { rpc, wallet } = context;
	if (!wallet) {
		throw new Error("Wallet is required for NFT transfer");
	}

	try {
		let signerTokenAccount = null;
		if (version === "2022") {
			signerTokenAccount = derivePositionNftAccount(new PublicKey(nftMint));
		} else {
			signerTokenAccount = getAssociatedTokenAddressSync(new PublicKey(nftMint), wallet.publicKey);
		}
		let managerTokenAccount = null;
		if (version === "2022") {
			managerTokenAccount = derivePositionNftAccount(new PublicKey(nftMint));
		} else {
			managerTokenAccount = getAssociatedTokenAddressSync(new PublicKey(nftMint), new PublicKey(managerAddress));
		}

		console.log({
			signerTokenAccount: signerTokenAccount.toBase58(),
			managerTokenAccount: managerTokenAccount.toBase58(),
		});
		// toAtaInfo = derivePositionNftAccount(new PublicKey(nftMint));

		const toAtaInfo = await rpc.getAccountInfo(managerTokenAccount);

		const instructions = [];

		if (!toAtaInfo) {
			instructions.push(
				createAssociatedTokenAccountInstruction(
					wallet.publicKey,
					managerTokenAccount,
					new PublicKey(managerAddress),
					new PublicKey(nftMint),
					version === "2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
				),
			);
		}

		const transferIx = createTransferInstruction(
			signerTokenAccount,
			managerTokenAccount,
			wallet.publicKey,
			1,
			[],
			version === "2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
		);
		instructions.push(transferIx);

		const latestBlockhash = await rpc.getLatestBlockhash();
		const messageV0 = new TransactionMessage({
			payerKey: wallet.publicKey,
			recentBlockhash: latestBlockhash.blockhash,
			instructions: instructions,
		}).compileToV0Message();

		const transaction = new VersionedTransaction(messageV0);
		transaction.sign([wallet.payer]);
		const signature = await rpc.sendTransaction(transaction);
		await rpc.confirmTransaction(
			{
				signature,
				blockhash: latestBlockhash.blockhash,
				lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
			},
			"finalized",
		);
		return signature;
		// const result = await handleTransaction(rpc, transaction, wallet.payer);

		// if (!result.confirmed) {
		// 	throw new Error(`Transaction failed: ${result.error}`);
		// }

		// return result.signature;
	} catch (error) {
		console.error("Error sending NFT to manager:", error);
		throw error;
	}
}

export async function collectProtocolFees(
	context: MigrationContext,
	tokenMint: string,
): Promise<{ txId: string; extraData: object }> {
	const { rpc, wallet } = context;
	if (!wallet) {
		throw new Error("Wallet is required for fee collection");
	}

	let fixedFee = new BN(Number(process.env.FIXED_FEE ?? 6) * 1e9);
	const withdrawnAmounts = context.state.withdrawnAmounts;
	if (!withdrawnAmounts || typeof withdrawnAmounts !== "object" || !withdrawnAmounts.sol) {
		throw new Error("Withdrawn amounts not found in state");
	}
	const withdrawnSolBN = new BN(withdrawnAmounts.sol);

	if (withdrawnSolBN.gt(new BN(100 * 1e9))) {
		// add 1% of withdrawnSolBN for withdrawnSolBN > 100 SOL
		fixedFee = fixedFee.add(withdrawnSolBN.muln(1).divn(100));
	}
	if (!fixedFee || fixedFee.isZero()) {
		return { txId: "no_fee", extraData: {} };
	}

	// biome-ignore lint/style/noNonNullAssertion: <explanation>
	const feeWallet = new PublicKey(process.env.ACCOUNT_FEE_MULTISIG!);
	const signerWallet = wallet;

	const transaction = new Transaction().add(
		SystemProgram.transfer({
			fromPubkey: signerWallet.publicKey,
			toPubkey: feeWallet,
			lamports: Number(fixedFee),
		}),
	);

	try {
		const signature = await sendAndConfirmTransaction(rpc, transaction, [signerWallet.payer]);
		return { txId: signature, extraData: {} };
	} catch (error: unknown) {
		console.error("transaction failed: ", error);
		throw error;
	}
}

export async function recordTransaction(state: ProtocolState, step: string, txId?: string, data?: unknown) {
	try {
		if (!state.transactions) state.transactions = [];
		state.transactions.push({
			step,
			txId,
			data,
			timestamp: new Date(),
		});
		await DB.Migration.findOneAndUpdate(
			{ contractAddress: state.tokenMint },
			{ $set: { protocolState: JSON.stringify(state) } },
		);
	} catch (error) {
		console.error("Error recording transaction:", error);
		throw error;
	}
}
