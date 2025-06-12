import { PublicKey, Keypair, type Transaction } from "@solana/web3.js";
import BN from "bn.js";
import type { MigrationContext } from "../../types";
import DB from "@autofun/database";
import * as spl from "@solana/spl-token";
import { parseWithdrawLogs, handleTransaction, recordTransaction } from "../../utils/protocol-utils";
import {
	CpAmm,
	MIN_SQRT_PRICE,
	MAX_SQRT_PRICE,
	getSqrtPriceFromPrice,
	type AddLiquidityParams,
	type InitializeCustomizeablePoolParams,
} from "@meteora-ag/cp-amm-sdk";
import Decimal from "decimal.js";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import { depositToMeteora } from "../../vaults/meteoraVault";
import { VersionedTransaction } from "@solana/web3.js";
import { derivePositionNftAccount } from "../../vaults/meteroaPdas";

export async function createPositionNft(
	context: MigrationContext,
	isPrimary: boolean,
): Promise<{ txId: string; nftMint: string; positionNftSecret: string }> {
	const positionNftKeypair = Keypair.generate();
	const positionNftAccount = derivePositionNftAccount(positionNftKeypair.publicKey);
	const positionNftMint = positionNftKeypair.publicKey;

	console.log(`${isPrimary ? "Primary" : "Secondary"} position NFT mint created:`, positionNftMint.toString());
	console.log(
		`${isPrimary ? "Primary" : "Secondary"} position NFT token account created:`,
		positionNftAccount.toString(),
	);

	if (!positionNftMint) {
		throw new Error("No position NFT mint found for pool creation");
	}

	const txId = `createPositionMint${isPrimary ? "" : "2"}`;
	const nftMint = positionNftMint.toString();
	const positionNftSecret = JSON.stringify(Array.from(positionNftKeypair.secretKey));

	// Update MongoDB with NFT mint and secret
	await DB.Migration.findOneAndUpdate(
		{ contractAddress: context.state.tokenMint },
		{
			$push: {
				positionNftsSecrets: positionNftSecret,
			},
			$set: {
				[isPrimary ? "primaryNftMint" : "secondaryNftMint"]: nftMint,
				updatedAt: new Date(),
			},
		},
	);
	await recordTransaction(context.state, isPrimary ? "createPrimaryPositionNft" : "createSecondaryPositionNft", txId, {
		positionNftMint: nftMint,
		nft: isPrimary ? "primaryNftMint" : "secondaryNftMint",
		timestamp: new Date(),
	});

	return {
		txId,
		nftMint,
		positionNftSecret,
	};
}

export async function finalizePositionNft(
	context: MigrationContext,
	primary: { txId: string; nftMint: string },
	secondary: { txId: string; nftMint: string },
): Promise<{
	txId: string;
	extraData: {
		lockLpTxId: string;
		nftMinted: string;
		primaryAmount: string;
		secondaryAmount: string;
		primaryAmountSol: string;
		secondaryAmountSol: string;
	};
}> {
	if (!context.provider || !context.state) {
		throw new Error("Provider and state are required for position NFT finalization");
	}
	const aggregatedTxId = `${primary.txId},${secondary.txId}`;
	const aggregatedNftMint = `${primary.nftMint},${secondary.nftMint}`;

	const mintConstantFee = new BN(Number(process.env.FIXED_FEE ?? 6) * 1e9); // 6 SOL
	const withdrawnAmounts = context.state.withdrawnAmounts;
	if (!withdrawnAmounts) {
		throw new Error("No withdrawn amounts found for pool creation");
	}

	// Get the withdraw transaction from the transactions array
	const withdrawTx = context.state.transactions?.find((tx) => tx.step === "withdrawLiquidity");
	if (!withdrawTx?.txId) {
		throw new Error("No withdraw transaction found in state");
	}

	const lastInfo = await context.provider.connection.getTransaction(withdrawTx.txId, {
		maxSupportedTransactionVersion: 0,
	});

	const backupLogs = lastInfo?.meta?.logMessages || [];
	const withdrawLogs = parseWithdrawLogs(backupLogs);

	// Verify amounts match
	if (withdrawLogs.sol !== withdrawnAmounts.sol || withdrawLogs.token !== withdrawnAmounts.token) {
		console.log(`Amounts do not match for token ${context.state.tokenMint}`);
		throw new Error(
			`Withdrawn amounts do not match: ${withdrawLogs.token} vs ${withdrawnAmounts.token} and ${withdrawLogs.sol} vs ${withdrawnAmounts.sol}`,
		);
	}

	const withdrawnTokensBN = new BN(withdrawnAmounts.token);
	const withdrawnSolBN = new BN(withdrawnAmounts.sol);

	const remainingTokens = withdrawnTokensBN;
	const remainingSol = withdrawnSolBN.sub(mintConstantFee);

	// Split amounts 90% and 10%
	const primaryAmount = remainingTokens.muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90)).divn(100);
	const secondaryAmount = remainingTokens.sub(primaryAmount);

	const primaryAmountSol = remainingSol.muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90)).divn(100);
	const secondaryAmountSol = remainingSol.sub(primaryAmountSol);

	// Update MongoDB with finalization data
	await DB.Migration.findOneAndUpdate(
		{ contractAddress: context.state.tokenMint },
		{
			$set: {
				nftMinted: aggregatedNftMint,
				lockId: aggregatedTxId,
				status: "migrating",
				lastUpdated: new Date().toISOString(),
				lockedAt: new Date(),
				"migration.extraData.primaryAmount": primaryAmount.toString(),
				"migration.extraData.secondaryAmount": secondaryAmount.toString(),
				"migration.extraData.primaryAmountSol": primaryAmountSol.toString(),
				"migration.extraData.secondaryAmountSol": secondaryAmountSol.toString(),
				updatedAt: new Date(),
			},
		},
	);

	await recordTransaction(context.state, "finalizePositionNft", aggregatedTxId, {
		primaryAmount: primaryAmount.toString(),
		secondaryAmount: secondaryAmount.toString(),
		primaryAmountSol: primaryAmountSol.toString(),
		secondaryAmountSol: secondaryAmountSol.toString(),
		timestamp: new Date(),
	});

	console.log(`[Lock] Finalizing position NFT lock for token ${context.state.tokenMint} with txId: ${aggregatedTxId}`);

	return {
		txId: aggregatedTxId,
		extraData: {
			lockLpTxId: aggregatedTxId,
			nftMinted: aggregatedNftMint,
			primaryAmount: primaryAmount.toString(),
			secondaryAmount: secondaryAmount.toString(),
			primaryAmountSol: primaryAmountSol.toString(),
			secondaryAmountSol: secondaryAmountSol.toString(),
		},
	};
}

export async function createPool(
	context: MigrationContext,
	amountToken: BN,
	amountSol: BN,
	primaryNft: PublicKey,
): Promise<{
	txId: string;
	extraData: {
		lockLpTxId: string;
		poolId: string;
		primaryPosition: string;
		primaryToken: string;
		primarySol: string;
	};
}> {
	const { provider, state, wallet } = context;

	if (!wallet) {
		throw new Error("Wallet is required for pool creation");
	}
	if (!provider) {
		throw new Error("Provider is required for NFT deposit");
	}
	const mintConstantFee = new BN(Number(process.env.FIXED_FEE ?? 6) * 1e9);
	const withdrawnTokensBN = new BN(amountToken);
	const withdrawnSolBN = new BN(amountSol);
	const remainingSol = withdrawnSolBN.sub(mintConstantFee);
	const primaryTokens = withdrawnTokensBN.muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90)).divn(100);
	const primarySol = remainingSol.muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90)).divn(100);

	const withdrawnAmounts = state.withdrawnAmounts;
	if (!withdrawnAmounts) {
		throw new Error("No withdrawn amounts found for pool creation");
	}

	// Get the withdraw transaction from the transactions array
	const withdrawTx = state.transactions?.find((tx) => tx.step === "withdrawLiquidity");
	if (!withdrawTx?.txId) {
		throw new Error("No withdraw transaction found in state");
	}

	const lastInfo = await provider.connection.getTransaction(withdrawTx.txId, {
		maxSupportedTransactionVersion: 0,
	});

	const backupLogs = lastInfo?.meta?.logMessages || [];
	const withdrawLogs = parseWithdrawLogs(backupLogs);

	// Verify amounts match
	if (withdrawLogs.sol !== withdrawnAmounts.sol || withdrawLogs.token !== withdrawnAmounts.token) {
		console.log(`Amounts do not match for token ${state.tokenMint}`);
		throw new Error(
			`Withdrawn amounts do not match: ${withdrawLogs.token} vs ${withdrawnAmounts.token} and ${withdrawLogs.sol} vs ${withdrawnAmounts.sol}`,
		);
	}

	// Get token decimals from database
	const token = await DB.Token.findOne({ contractAddress: state.tokenMint });
	if (!token) {
		throw new Error(`Token not found in database: ${state.tokenMint}`);
	}

	// Add token decimals to state
	state.tokenDecimals = token.decimals;

	const tokenAMint = new PublicKey(state.tokenMint);
	const tokenBMint = spl.NATIVE_MINT;
	const cpAmm = new CpAmm(provider.connection);
	const configs = await cpAmm.getAllConfigs();
	// choose config with 0.5 fee
	const config = configs?.[0]?.publicKey;
	if (!config) {
		throw new Error("No config found for pool creation");
	}

	// Prepare pool creation transaction
	const { tx, pool, position, activationPoint } = await prepareCreatePoolTransaction(
		context,
		primaryTokens,
		primarySol,
		primaryNft,
	);

	// Get the position NFT secret from the database
	const migration = await DB.Migration.findOne({
		contractAddress: state.tokenMint,
	});
	if (!migration?.positionNftsSecrets?.length) {
		throw new Error("No position NFT secret found for pool creation");
	}
	const positionNftKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(migration.positionNftsSecrets[0])));

	// Send and confirm the transaction directly
	const txId = await provider.connection.sendTransaction(tx, [wallet.payer as Keypair, positionNftKeypair]);
	await provider.connection.confirmTransaction(txId, "confirmed");

	console.log("createPoolTxId", txId);

	// get date from activationPoint
	const activationDate = new Date(activationPoint.toNumber() * 1000);

	// Update database with pool info
	await DB.Migration.findOneAndUpdate(
		{ contractAddress: state.tokenMint },
		{
			$set: {
				status: "migrated",
				lockedAt: new Date(),
				txId: txId,
				marketId: pool.toString(),
				poolId: pool.toString(),
				primaryPosition: position.toString(),
				updatedAt: new Date(),
				migratedAt: activationDate,
			},
		},
	);
	await recordTransaction(state, "createPool", txId, {
		poolId: pool.toString(),
		primaryPosition: position.toString(),
		timestamp: new Date(),
	});

	console.log(`[createPool] Migration update POSTed for ${state.tokenMint}`);

	return {
		txId: txId,
		extraData: {
			lockLpTxId: txId,
			poolId: pool.toString(),
			primaryPosition: position.toString(),
			primaryToken: primaryTokens.toString(),
			primarySol: primarySol.toString(),
		},
	};
}

async function prepareCreatePoolTransaction(
	context: MigrationContext,
	tokenAAmount: BN,
	tokenBAmount: BN,
	positionNft: PublicKey,
): Promise<{
	tx: Transaction;
	pool: PublicKey;
	position: PublicKey;
	activationPoint: BN;
}> {
	const { provider, state } = context;

	if (!provider) {
		throw new Error("Provider is required for pool creation");
	}
	const token = state;

	const tokenAMint = new PublicKey(token.tokenMint);
	const tokenBMint = NATIVE_MINT;
	const cpAmm = new CpAmm(provider.connection);

	const tokenADecimal = token.tokenDecimals ?? 6; // fallback if not set
	const tokenBDecimal = 9;

	// Calculate initial price
	const humanA = new Decimal(tokenAAmount.toString()).div(new Decimal(10).pow(tokenADecimal));
	const humanB = new Decimal(tokenBAmount.toString()).div(new Decimal(10).pow(tokenBDecimal));
	const initPrice = humanB.div(humanA).toString();

	// Set activation point to 5 minutes from now
	const activationPoint = new BN(Math.floor(Date.now() / 1000) + 5 * 60);

	// Calculate liquidity delta
	const liquidityDelta = cpAmm.getLiquidityDelta({
		maxAmountTokenA: tokenAAmount,
		maxAmountTokenB: tokenBAmount,
		sqrtPrice: getSqrtPriceFromPrice(initPrice, tokenADecimal, tokenBDecimal),
		sqrtMinPrice: MIN_SQRT_PRICE,
		sqrtMaxPrice: MAX_SQRT_PRICE,
	});

	const createCustomPoolParams: InitializeCustomizeablePoolParams = {
		payer: provider.wallet.publicKey,
		creator: provider.wallet.publicKey,
		positionNft,
		tokenAMint,
		tokenBMint,
		tokenAAmount,
		tokenBAmount,
		sqrtMinPrice: MIN_SQRT_PRICE,
		sqrtMaxPrice: MAX_SQRT_PRICE,
		liquidityDelta,
		initSqrtPrice: getSqrtPriceFromPrice(initPrice, tokenADecimal, tokenBDecimal),
		poolFees: {
			baseFee: {
				cliffFeeNumerator: new BN(2_500_000),
				numberOfPeriod: 0,
				periodFrequency: new BN(0),
				reductionFactor: new BN(0),
				feeSchedulerMode: 0,
			},
			protocolFeePercent: 20,
			partnerFeePercent: 0,
			referralFeePercent: 20,
			dynamicFee: null,
		},
		hasAlphaVault: false,
		activationType: 1,
		collectFeeMode: 0,
		activationPoint,
		tokenAProgram: TOKEN_PROGRAM_ID,
		tokenBProgram: TOKEN_PROGRAM_ID,
	};

	const { tx, pool, position } = await cpAmm.createCustomPool(createCustomPoolParams);

	// Get recent blockhash and add it to the transaction
	const { blockhash } = await provider.connection.getLatestBlockhash();
	tx.recentBlockhash = blockhash;
	tx.feePayer = provider.wallet.publicKey;

	return {
		tx,
		pool,
		position,
		activationPoint,
	};
}

export async function createPosition(
	context: MigrationContext,
	poolId: string,
	positionNft: PublicKey,
): Promise<{
	txId: string;
	extraData: Record<string, any>;
}> {
	const { provider, state, wallet } = context;
	if (!provider) {
		throw new Error("Wallet is required for position creation");
	}
	if (!wallet) {
		throw new Error("Wallet is required for position creation");
	}

	// Get the secondary position NFT secret from the database
	const migration = await DB.Migration.findOne({
		contractAddress: state.tokenMint,
	});
	if (!migration?.positionNftsSecrets?.length || migration.positionNftsSecrets.length < 2) {
		throw new Error("No secondary position NFT secret found for position creation");
	}
	const positionNftKeypair = Keypair.fromSecretKey(
		Uint8Array.from(JSON.parse(migration.positionNftsSecrets[1])), // Use the second secret for secondary position
	);

	const pool = new PublicKey(poolId);
	const cpAmm = new CpAmm(provider.connection);

	// Create position transaction
	const createPositionTx = await cpAmm.createPosition({
		owner: provider.wallet.publicKey,
		payer: provider.wallet.publicKey,
		pool,
		positionNft: positionNftKeypair.publicKey,
	});

	// Check if position already exists

	const positionNftAccount = derivePositionNftAccount(positionNftKeypair.publicKey);
	const userPositions = await cpAmm.getUserPositionByPool(pool, provider.wallet.publicKey);
	const existingPosition = userPositions.find((p) => p.positionNftAccount.equals(positionNftAccount));

	if (existingPosition) {
		console.log("Position already exists, skipping creation");
		const txId = "position-already-exists";
		await recordTransaction(state, "createPosition", txId, {
			positionId: positionNftKeypair.publicKey.toString(),
			timestamp: new Date(),
		});

		return {
			txId,
			extraData: {
				positionId: positionNftKeypair.publicKey.toString(),
			},
		};
	}

	// Get recent blockhash and add it to the transaction
	const { blockhash } = await provider.connection.getLatestBlockhash();
	createPositionTx.recentBlockhash = blockhash;
	createPositionTx.feePayer = provider.wallet.publicKey;

	// Send and confirm the transaction with both keypairs in the correct order
	const txId = await provider.connection.sendTransaction(createPositionTx, [
		wallet.payer as Keypair,
		positionNftKeypair,
	]);
	await provider.connection.confirmTransaction(txId, "confirmed");

	console.log("createPositionTxId", txId);

	// Get the position address from the transaction
	const positionAddress = positionNftKeypair.publicKey.toString();

	await recordTransaction(state, "createPosition", txId, {
		positionId: positionAddress,
		timestamp: new Date(),
	});

	console.log(`[createPosition] Secondary position created for ${state.tokenMint} with txId: ${txId}`);

	return {
		txId,
		extraData: {
			positionId: positionAddress,
		},
	};
}

export async function addLiquidity(
	context: MigrationContext,
	poolId: string,
): Promise<{
	txId: string;
	extraData: {
		positionId: string;
	};
}> {
	const { provider, state, wallet } = context;
	if (!provider) {
		throw new Error("Provider is required for adding liquidity");
	}
	if (!wallet) {
		throw new Error("Wallet is required for adding liquidity");
	}
	console.log("wallet", wallet.publicKey.toString());

	const pool = new PublicKey(poolId);
	const cpAmm = new CpAmm(provider.connection);

	// Get pool state
	const poolState = await cpAmm.fetchPoolState(pool);
	const tokenAMint = new PublicKey(state.tokenMint);
	const tokenBMint = NATIVE_MINT;
	const tokenADecimal = state.tokenDecimals ?? 6;
	const tokenBDecimal = 9;

	// Get secondary amounts from state
	if (!state.secondaryAmount || !state.secondaryAmountSol) {
		throw new Error("Secondary amounts not found in state");
	}
	const secondaryAmount = new BN(state.secondaryAmount ?? "0");
	const secondaryAmountSol = new BN(state.secondaryAmountSol ?? "0");
	// Get the secondary position NFT secret from the database
	const migration = await DB.Migration.findOne({
		contractAddress: state.tokenMint,
	});
	if (!migration?.positionNftsSecrets?.length || migration.positionNftsSecrets.length < 2) {
		throw new Error("No secondary position NFT secret found for position creation");
	}
	const positionNftKeypair = Keypair.fromSecretKey(
		Uint8Array.from(JSON.parse(migration.positionNftsSecrets[1])), // Use the second secret for secondary position
	);

	const positionNftAccount = derivePositionNftAccount(positionNftKeypair.publicKey);

	// const positionNftAccount = derivePositionNftAccount(positionNftMint);

	// Calculate liquidity delta
	const liquidityDelta = await cpAmm.getLiquidityDelta({
		maxAmountTokenA: secondaryAmount,
		maxAmountTokenB: secondaryAmountSol,
		sqrtPrice: poolState.sqrtPrice,
		sqrtMinPrice: MIN_SQRT_PRICE,
		sqrtMaxPrice: MAX_SQRT_PRICE,
	});

	// Get user position
	// console.log("allPosition", allPosition);
	const userPositions = await cpAmm.getUserPositionByPool(pool, provider.wallet.publicKey);
	const userPosition = userPositions.find((p) => p.positionNftAccount.equals(positionNftAccount));
	if (!userPosition) {
		throw new Error("No user position found for pool");
	}

	// Get position state and deposit quote
	const positionState = await cpAmm.fetchPositionState(userPosition.position);
	const quote = await cpAmm.getDepositQuote({
		inAmount: secondaryAmount,
		isTokenA: true,
		minSqrtPrice: MIN_SQRT_PRICE,
		maxSqrtPrice: MAX_SQRT_PRICE,
		sqrtPrice: poolState.sqrtPrice,
	});

	const maxAmountTokenA = quote.actualInputAmount;
	const maxAmountTokenB = quote.outputAmount;
	const tokenAAmountThreshold = quote.actualInputAmount;
	const tokenBAmountThreshold = quote.outputAmount;
	const positionAddress = userPosition.position;

	// Prepare add liquidity parameters
	const addLiquidityParams: AddLiquidityParams = {
		owner: provider.wallet.publicKey,
		pool,
		position: userPosition.position,
		positionNftAccount: positionNftAccount,
		liquidityDelta: quote.liquidityDelta,
		maxAmountTokenA,
		maxAmountTokenB,
		tokenAAmountThreshold,
		tokenBAmountThreshold,
		tokenAMint: poolState.tokenAMint,
		tokenBMint: poolState.tokenBMint,
		tokenAVault: poolState.tokenAVault,
		tokenBVault: poolState.tokenBVault,
		tokenAProgram: TOKEN_PROGRAM_ID,
		tokenBProgram: TOKEN_PROGRAM_ID,
	};

	// Create and send transaction
	const addLiquidityTx = await cpAmm.addLiquidity(addLiquidityParams);

	// Send and confirm the transaction using handleTransaction { /* Malibu - need to use this for all transactions - except sdk transactions */ }
	const result = await handleTransaction(provider.connection, addLiquidityTx, wallet.payer as Keypair, {
		preflightCommitment: "confirmed",
		maxRetries: 3,
		timeout: 60000,
	});

	if (!result.confirmed) {
		throw new Error(`Transaction failed: ${result.error}`);
	}

	const txId = result.signature;
	console.log("addLiquidityTxId", txId);

	// Update database with both position IDs
	await DB.Migration.findOneAndUpdate(
		{ contractAddress: state.tokenMint },
		{
			$set: {
				status: "migrated",
				txId: txId,
				nftMinted: state.nftMinted,
				secondaryPosition: positionAddress.toString(),
				updatedAt: new Date(),
			},
			$addToSet: {
				positionIds: positionAddress.toString(),
			},
		},
	);

	// Update database with position info
	await DB.Token.findOneAndUpdate(
		{ contractAddress: state.tokenMint },
		{
			$set: {
				status: "migrated",
				txId: txId,
				nftMinted: state.nftMinted,
				secondaryPosition: positionAddress,
				updatedAt: new Date(),
			},
			$push: {
				positionIds: positionAddress,
			},
		},
	);
	await recordTransaction(state, "addLiquidity", txId, {
		positionId: positionAddress.toString(),
		timestamp: new Date(),
	});

	console.log(`[addLiquidity] Liquidity added for ${state.tokenMint} with txId: ${txId}`);

	return {
		txId,
		extraData: {
			positionId: positionAddress.toString(),
		},
	};
}

export async function depositNftToMeteora(
	context: MigrationContext,
	nftMint: string,
	claimerAddress: PublicKey,
): Promise<{ txId: string; extraData: object }> {
	const { provider, wallet, state } = context;
	if (!wallet) {
		throw new Error("Wallet is required for NFT deposit");
	}
	if (!provider) {
		throw new Error("Provider is required for NFT deposit");
	}

	try {
		const signerWallet = wallet;
		if (!context.programContext?.meteoraVaultProgram) {
			throw new Error("Meteora vault program not initialized");
		}
		const fromAccount = derivePositionNftAccount(new PublicKey(nftMint));
		const balance = await provider.connection.getTokenAccountBalance(fromAccount);
		if (balance.value.uiAmount && balance.value.uiAmount < 1) {
			throw new Error("Insufficient NFT balance in token account");
		}

		const txSignature = await depositToMeteora(
			provider,
			signerWallet.payer,
			context.programContext.meteoraVaultProgram,
			new PublicKey(nftMint),
			claimerAddress,
			fromAccount,
		);

		await DB.Migration.findOneAndUpdate(
			{ contractAddress: state.tokenMint },
			{
				$set: {
					nftDeposited: true,
					nftDepositedAt: new Date(),
					updatedAt: new Date(),
				},
			},
		);
		await recordTransaction(state, "depositNft", txSignature, {
			nftMint,
			claimerAddress: claimerAddress.toString(),
			timestamp: new Date(),
		});

		return {
			txId: txSignature,
			extraData: { depositedNftMint: nftMint },
		};
	} catch (error) {
		console.error("Error depositing NFT to Meteora vault:", error);
		throw error;
	}
}
