import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  Raydium,
  TxVersion,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  ApiV3PoolInfoItem,
} from "@raydium-io/raydium-sdk-v2";
import type { MigrationContext } from "../../types";
import {
  handleTransaction,
  recordTransaction,
} from "../../utils/protocol-utils";
import { NATIVE_MINT } from "@solana/spl-token";
import { ensureObject } from "../../utils/tools";
import DB from "@autofun/database";
import { depositToRaydiumVault } from "../../vaults/raydiumVault";
import * as spl from "@solana/spl-token";
import { retryOperation } from "../../utils";

interface CreatePoolParams {
  tokenMint: string;
  amountToken: number;
  amountSol: number;
  deadline: number;
}

interface LockLPParams {
  context: MigrationContext;
  poolId: string;
  amount: BN;
  isPrimary: boolean;
}

export async function createPool(
  context: MigrationContext,
  params: CreatePoolParams
): Promise<{
  txId: string;
  poolAddresses: any;
  extraData: {
    primaryAmount: string;
    secondaryAmount: string;
    primaryAmountSol: string;
    secondaryAmountSol: string;
  };
}> {
  const { rpc, wallet, state } = context;
  if (!wallet) {
    throw new Error("Wallet is required for pool creation");
  }

  try {
    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      owner: wallet.payer,
      connection: rpc,
      cluster: "mainnet",
      disableFeatureCheck: true,
      disableLoadToken: false,
      blockhashCommitment: "finalized",
    });

    const mintConstantFee = new BN(Number(process.env.FIXED_FEE ?? 6) * 1e9); // 6 SOL
    const withdrawnTokensBN = new BN(params.amountToken);
    const withdrawnSolBN = new BN(params.amountSol);

    const remainingTokens = withdrawnTokensBN;
    const remainingSol = withdrawnSolBN.sub(mintConstantFee);

    // Split amounts 90% and 10%
    const primaryAmount = remainingTokens
      .muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90))
      .divn(100);
    const secondaryAmount = remainingTokens.sub(primaryAmount);

    const primaryAmountSol = remainingSol
      .muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90))
      .divn(100);
    const secondaryAmountSol = remainingSol.sub(primaryAmountSol);

    // Get token info
    const mintA = await raydium.token.getTokenInfo(
      new PublicKey(params.tokenMint)
    );
    const mintB = await raydium.token.getTokenInfo(NATIVE_MINT);

    // Get fee configs
    const feeConfigs = await raydium.api.getCpmmConfigs();
    const feeConfig = feeConfigs[1]; // Use the second config for mainnet
    const startTime = new BN(Math.floor(Date.now() / 1000) + 5 * 60);

    // Create pool using Raydium SDK
    const poolCreation = await raydium.cpmm.createPool({
      programId: CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
      mintA,
      mintB,
      mintAAmount: primaryAmount,
      mintBAmount: primaryAmountSol,
      startTime: startTime,
      feeConfig,
      associatedOnly: true,
      ownerInfo: { useSOLBalance: true },
      txVersion: TxVersion.V0,
    });

    // Execute the transaction
    const { txId } = await poolCreation.execute({ sendAndConfirm: true });

    // Get pool addresses
    const poolAddresses = {
      id: poolCreation.extInfo.address.poolId.toString(),
      lpMint: poolCreation.extInfo.address.lpMint.toString(),
      vaultA: poolCreation.extInfo.address.vaultA.toString(),
      vaultB: poolCreation.extInfo.address.vaultB.toString(),
    };

    // Update state and DB with both poolAddresses and poolInfo
    state.poolAddresses = poolAddresses;

    await DB.Migration.findOneAndUpdate(
      { contractAddress: params.tokenMint },
      {
        $set: {
          marketId: poolAddresses.id,
          poolAddresses: JSON.stringify(poolAddresses),
          quoteVault: poolAddresses.vaultB,
          baseVault: poolAddresses.vaultA,
          updatedAt: new Date(),
          status: "migrated"
        },
      }
    );
    await recordTransaction(
      state,
      "createPool",
      txId,
      {
        poolAddresses,
        primaryAmount: primaryAmount.toString(),
        secondaryAmount: secondaryAmount.toString(),
        primaryAmountSol: primaryAmountSol.toString(),
        secondaryAmountSol: secondaryAmountSol.toString(),
      }
    );

    // change token status to migrated in the database 
    await DB.Token.findOneAndUpdate(
      { contractAddress: params.tokenMint },
      {
        $set: {
          status: "migrated",
          poolId: poolAddresses.id,
          updatedAt: new Date(),
        },
      }
    );


    return {
      txId,
      poolAddresses,
      extraData: {
        primaryAmount: primaryAmount.toString(),
        secondaryAmount: secondaryAmount.toString(),
        primaryAmountSol: primaryAmountSol.toString(),
        secondaryAmountSol: secondaryAmountSol.toString(),
      },
    };
  } catch (error) {
    console.error("Error creating pool:", error);
    throw error;
  }
}

export async function initRaydiumSdkAndFetchPoolInfo(
  context: MigrationContext,
  poolId: string
): Promise<{ raydium: Raydium; poolInfo: ApiV3PoolInfoItem }> {
  const { rpc, wallet, state } = context;
  if (!wallet) {
    throw new Error("Wallet is required for pool operations");
  }

  try {
    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      owner: wallet.payer,
      connection: rpc,
      cluster: "mainnet",
      disableFeatureCheck: true,
      disableLoadToken: false,
      blockhashCommitment: "finalized",
    });

    // Fetch pool information using the api module
    let result;
    result = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    if (!result) {
      const data = await raydium.api.fetchPoolById({ ids: poolId });
      if (!data || data.length === 0) {
        throw new Error("Pool info not found");
      }
      const pool = data[0];
      // check if pool contains lpMint
      if (
        !("lpMint" in pool) ||
        !pool.lpMint ||
        !("address" in pool.lpMint) ||
        !pool.lpMint.address
      ) {
        throw new Error("Pool does not contain lpMint address");
      }
      result = {
        poolInfo: pool,
        poolKeys: {
          id: pool.id,
        },
      };
    }
    await raydium.account.fetchWalletTokenAccounts();

    const poolInfoResult = result.poolInfo;
    const poolKeys = result.poolKeys;
    const pool = { poolInfo: poolInfoResult, poolKeys };
    const lpMintStr = pool.poolInfo.lpMint.address;
    const lpAccount = raydium.account.tokenAccounts.find(
      (a: any) => a.mint.toBase58() === lpMintStr
    );
    if (!lpAccount) throw new Error(`No LP balance found for pool: ${poolId}`);

    // Get token information
    const totalLP = lpAccount.amount as BN;
    const primaryAmount = totalLP
      .muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90))
      .divn(100);
    const secondaryAmount = totalLP.sub(primaryAmount);

    // Update state with pool info and additional data
    state.poolInfo = poolInfoResult;

    await recordTransaction(
      context.state,
      "initLockLP",
      state.txId || "init-lock-lp",
      {
        poolInfo: poolInfoResult,
        poolKeys,
        totalLP: totalLP.toString(),
        primaryAmount: primaryAmount.toString(),
        secondaryAmount: secondaryAmount.toString(),
      }
    );

    // Update database with pool info
    await DB.Migration.findOneAndUpdate(
      { contractAddress: state.tokenMint },
      {
        $set: {
          poolInfo: JSON.stringify(poolInfoResult),
          updatedAt: new Date(),
        },
      }
    );

    return { raydium, poolInfo: poolInfoResult };
  } catch (error) {
    console.error(
      "Error initializing Raydium SDK and fetching pool info:",
      error
    );
    throw error;
  }
}

export async function lockLP({
  context,
  poolId,
  amount,
  isPrimary,
}: LockLPParams): Promise<string> {
  const { rpc, wallet, state } = context;
  if (!wallet) {
    throw new Error("Wallet is required for LP locking");
  }

  try {
    const raydium = await Raydium.load({
      owner: wallet.payer,
      connection: rpc,
      cluster: "mainnet",
      disableFeatureCheck: true,
      disableLoadToken: false,
      blockhashCommitment: "finalized",
    });

    if (!state.poolInfo) {
      throw new Error("Pool info not found in state");
    }
    // Create lock transaction
    const lockTx = await raydium.cpmm.lockLp({
      poolInfo: state.poolInfo,
      lpAmount: amount,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 300000,
        microLamports: 0.0001 * 1e9,
      },
    });

    // Execute the transaction
    const { txId } = await lockTx.execute({ sendAndConfirm: true });

    // Get NFT mint from transaction
    const nftMint = lockTx.extInfo.nftMint.toString();

    await recordTransaction(
      state,
      isPrimary ? "lockPrimaryLP" : "lockSecondaryLP",
      txId,
      {
        amount: amount.toString(),
        nftMint,
      }
    );

    // Update database with lock information
    await DB.Migration.findOneAndUpdate(
      { contractAddress: state.tokenMint },
      {
        $set: {
          [`${isPrimary ? "primary" : "secondary"}LockAmount`]:
            amount.toString(),
          [`${isPrimary ? "primary" : "secondary"}LockTxId`]: txId,
          [`${isPrimary ? "primary" : "secondary"}NftMint`]: nftMint,
          updatedAt: new Date(),
        },
      }
    );

    return txId;
  } catch (error) {
    console.error(
      `Error locking ${isPrimary ? "primary" : "secondary"} LP:`,
      error
    );
    throw error;
  }
}

export async function lockPrimaryLP(
  context: MigrationContext
): Promise<string> {
  const { state } = context;
  if (!state.poolInfo) {
    throw new Error("Pool info not found in state");
  }

  // Get the primary lock amount from state transactions
  const initLockTx = state.transactions?.find((tx) => tx.step === "initLockLP");
  if (!initLockTx?.data?.primaryAmount) {
    throw new Error("Primary lock amount not found in state");
  }

  const primaryAmount = new BN(initLockTx.data.primaryAmount);
  await recordTransaction(state, "lockPrimaryLP", "lock-primary-lp", {
    primaryAmount: primaryAmount.toString(),
    timestamp: new Date(),
  });
  return lockLP({
    context,
    poolId: state.poolInfo.id.toString(),
    amount: primaryAmount,
    isPrimary: true,
  });
}

export async function lockSecondaryLP(
  context: MigrationContext
): Promise<string> {
  const { state } = context;
  if (!state.poolInfo) {
    throw new Error("Pool info not found in state");
  }

  // Get the secondary lock amount from state transactions
  const initLockTx = state.transactions?.find((tx) => tx.step === "initLockLP");
  if (!initLockTx?.data?.secondaryAmount) {
    throw new Error("Secondary lock amount not found in state");
  }

  const secondaryAmount = new BN(initLockTx.data.secondaryAmount);
  await recordTransaction(state, "lockSecondaryLP", "lock-secondary-lp", {
    secondaryAmount: secondaryAmount.toString(),
    timestamp: new Date(),
  });

  return lockLP({
    context,
    poolId: state.poolInfo.id.toString(),
    amount: secondaryAmount,
    isPrimary: false,
  });
}

export async function finalizeLockLP(context: MigrationContext): Promise<void> {
  const { state } = context;
  if (!state.poolInfo) {
    throw new Error("Pool info not found in state");
  }

  // Verify that both primary and secondary locks have been completed
  const primaryLockTx = state.transactions?.find(
    (tx) => tx.step === "lockPrimaryLP"
  );
  const secondaryLockTx = state.transactions?.find(
    (tx) => tx.step === "lockSecondaryLP"
  );

  if (!primaryLockTx?.data?.txId) {
    throw new Error("Primary LP lock transaction not found");
  }
  if (!secondaryLockTx?.data?.txId) {
    throw new Error("Secondary LP lock transaction not found");
  }

  // Record the finalization
  await recordTransaction(state, "finalizeLockLP", "finalize-lock-lp", {
    primaryLockTxId: primaryLockTx.data.txId,
    secondaryLockTxId: secondaryLockTx.data.txId,
    timestamp: new Date(),
  });

  // Update database with lock finalization
  await DB.Migration.findOneAndUpdate(
    { contractAddress: state.tokenMint },
    {
      $set: {
        lockFinalized: true,
        lockFinalizedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  console.log("LP token lock finalized for pool:", state.poolInfo.id);
}

export async function depositNftToRaydiumVault(
  context: MigrationContext,
  nftMint: string,
  claimerAddress: PublicKey
): Promise<{ txId: string; extraData: object }> {
  const { rpc, wallet, state, provider } = context;
  if (!wallet) {
    throw new Error("Wallet is required for NFT deposit");
  }
  if (!provider) {
    throw new Error("Provider is required for NFT deposit");
  }

  try {
    // Get the signer wallet
    const signerWallet = wallet;

    // Get the program from context
    if (!context.programContext?.raydiumVaultProgram) {
      throw new Error("Raydium vault program not initialized");
    }

    // Execute the deposit transaction
    const txSignature = await depositToRaydiumVault(
      provider,
      signerWallet.payer,
      context.programContext.raydiumVaultProgram,
      new PublicKey(nftMint),
      claimerAddress
    );

    await recordTransaction(state, "depositNftToRaydiumVault", txSignature, {
      nftMint,
      claimerAddress: claimerAddress.toString(),
      timestamp: new Date(),
    });

    // Update database with deposit information
    await DB.Migration.findOneAndUpdate(
      { contractAddress: state.tokenMint },
      {
        $set: {
          nftDeposited: true,
          nftDepositedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return {
      txId: txSignature,
      extraData: { depositedNftMint: nftMint },
    };
  } catch (error) {
    console.error("Error depositing NFT to Raydium vault:", error);
    throw error;
  }
}

export async function sendNftToManagerMultisig(
  context: MigrationContext,
  nftMint: string,
  multisigAddress: PublicKey
): Promise<{ txId: string; extraData: object }> {
  const { rpc, wallet, state } = context;
  if (!wallet) {
    throw new Error("Wallet is required for NFT transfer");
  }

  try {
    // Derive the associated token addresses
    const signerTokenAccount = spl.getAssociatedTokenAddressSync(
      new PublicKey(nftMint),
      wallet.publicKey
    );
    const multisigTokenAccount = spl.getAssociatedTokenAddressSync(
      new PublicKey(nftMint),
      multisigAddress
    );

    // Check if recipient ATA exists and create if needed
    const toAtaInfo = await rpc.getAccountInfo(multisigTokenAccount);
    const instructions = [];

    if (!toAtaInfo) {
      instructions.push(
        spl.createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          multisigTokenAccount,
          multisigAddress,
          new PublicKey(nftMint)
        )
      );
    }

    // Create the transfer instruction
    const transferIx = spl.createTransferInstruction(
      signerTokenAccount,
      multisigTokenAccount,
      wallet.publicKey,
      1, // transferring one NFT
      [],
      spl.TOKEN_PROGRAM_ID
    );
    instructions.push(transferIx);

    // Get the latest blockhash
    const latestBlockhash = await rpc.getLatestBlockhash();

    // Create and sign the transaction
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet.payer]);

    // Send and confirm the transaction
    const signature = await rpc.sendTransaction(transaction);
    await retryOperation(
      async () => {
        await rpc.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "finalized"
        );
      },
      3,
      2000
    );

    await recordTransaction(state, "sendNftToManager", signature, {
      nftMint,
      multisigAddress: multisigAddress.toString(),
      timestamp: new Date(),
    });

    // Update database with transfer information
    await DB.Migration.findOneAndUpdate(
      { contractAddress: state.tokenMint },
      {
        $set: {
          nftSentToManager: true,
          nftSentToManagerAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    return {
      txId: signature,
      extraData: { sentNftMint: nftMint },
    };
  } catch (error) {
    console.error("Error sending NFT to manager multisig:", error);
    throw error;
  }
}

export async function finalizeMigration(
  context: MigrationContext
): Promise<void> {
  const { state } = context;

  if (!state.poolAddresses || !state.poolInfo) {
    throw new Error("Pool addresses or info not found in state");
  }

  await recordTransaction(state, "finalizeMigration", "finalize-migration", {
    poolId: state.poolAddresses.id,
    tokenMint: state.tokenMint,
    timestamp: new Date(),
  });

  await DB.Migration.findOneAndUpdate(
    { contractAddress: state.tokenMint },
    {
      $set: {
        migrationFinalized: true,
        migrationFinalizedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  console.log("Migration finalized for pool:", state.poolAddresses.id);
}
