import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { CP_AMM_PROGRAM_ID, derivePoolAuthority, derivePositionAddress, deriveTokenVaultAddress } from "@meteora-ag/cp-amm-sdk";
import { MeteoraVault } from "./programs/types/meteora_vault";
import { getVaultConfig, getUserPosition, getNftTokenFaucet, getEventAuthority } from "./meteroaPdas";
import { retryOperation } from "../utils";

export async function depositToMeteora(
  provider: anchor.AnchorProvider,
  signerWallet: anchor.web3.Keypair,
  program: Program<MeteoraVault>,
  position_nft: anchor.web3.PublicKey,
  claimer_address: anchor.web3.PublicKey,
  from_account: anchor.web3.PublicKey,
) {
  try {
    anchor.setProvider(provider);

    const vault_config = getVaultConfig(program.programId);
    const user_position = getUserPosition(program.programId, position_nft);


    const nft_token_faucet = getNftTokenFaucet(program.programId, position_nft);

    const accounts = {
      authority: signerWallet.publicKey,
      vaultConfig: vault_config,
      userPosition: user_position,
      positionNft: position_nft,
      fromAccount: from_account,
      nftTokenFaucet: nft_token_faucet,
      tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    };
    console.log("Accounts: ", accounts);

    const call = program.methods.deposit(claimer_address).accounts(accounts);
    const txSignature = await call.rpc();
    console.log("Transaction Signature", txSignature);

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await retryOperation(
      async () => {
        await provider.connection.confirmTransaction(
          {
            signature: txSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "finalized"
        );
      },
      3,
      2000
    );

    return txSignature;
  } catch (error) {
    console.error("Error in depositToMeteora:", error);
    throw error;
  }
}

export async function claimPositionFee(
  provider: anchor.AnchorProvider,
  signerWallet: anchor.web3.Keypair,
  program: Program<MeteoraVault>,
  position_nft: anchor.web3.PublicKey,
  pool: anchor.web3.PublicKey,
  token_mint_a: anchor.web3.PublicKey,
  token_mint_b: anchor.web3.PublicKey,
  token_a_program: anchor.web3.PublicKey = spl.TOKEN_PROGRAM_ID,
  token_b_program: anchor.web3.PublicKey = spl.TOKEN_PROGRAM_ID,
) {
  try {
    const vault_config = getVaultConfig(program.programId);
    const pool_authority = derivePoolAuthority();
    const token_vault_a = deriveTokenVaultAddress(token_mint_a, pool);
    const token_vault_b = deriveTokenVaultAddress(token_mint_b, pool);
    const position_nft_account = getNftTokenFaucet(program.programId, position_nft);
    const position = derivePositionAddress(position_nft);
    const event_authority = getEventAuthority();

    // Ensure associated token accounts exist
    await spl.getOrCreateAssociatedTokenAccount(
      provider.connection,
      signerWallet,
      token_mint_a,
      signerWallet.publicKey,
      true,
      undefined,
      undefined,
      token_a_program
    );
    await spl.getOrCreateAssociatedTokenAccount(
      provider.connection,
      signerWallet,
      token_mint_b,
      signerWallet.publicKey,
      true,
      undefined,
      undefined,
      token_b_program
    );

    const token_a_account = spl.getAssociatedTokenAddressSync(
      token_mint_a,
      signerWallet.publicKey,
      true,
      token_a_program
    );
    const token_b_account = spl.getAssociatedTokenAddressSync(
      token_mint_b,
      signerWallet.publicKey,
      true,
      token_b_program
    );

    const accounts = {
      authority: signerWallet.publicKey,
      vaultConfig: vault_config,
      poolAuthority: pool_authority,
      pool: pool,
      position: position,
      tokenAAccount: token_a_account,
      tokenBAccount: token_b_account,
      tokenAVault: token_vault_a,
      tokenBVault: token_vault_b,
      tokenAMint: token_mint_a,
      tokenBMint: token_mint_b,
      positionNftAccount: position_nft_account,
      owner: vault_config,
      tokenAProgram: token_a_program,
      tokenBProgram: token_b_program,
      eventAuthority: event_authority,
      dynamicAmm: CP_AMM_PROGRAM_ID,
    };

    const call = program.methods.claimPositionFee().accounts(accounts);
    const txSignature = await call.rpc();
    console.log("Transaction Signature", txSignature);

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await retryOperation(
      async () => {
        await provider.connection.confirmTransaction(
          {
            signature: txSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "finalized"
        );
      },
      3,
      2000
    );

    return txSignature;
  } catch (error) {
    console.error("Error in claimPositionFee:", error);
    throw error;
  }
}

export async function emergencyWithdraw(
  provider: anchor.AnchorProvider,
  signerWallet: anchor.web3.Keypair,
  program: Program<MeteoraVault>,
  position_nft: anchor.web3.PublicKey,
) {
  try {
    const vault_config = getVaultConfig(program.programId);
    const user_position = getUserPosition(program.programId, position_nft);
    const to_account = spl.getAssociatedTokenAddressSync(
      position_nft,
      signerWallet.publicKey,
      true,
      spl.TOKEN_2022_PROGRAM_ID
    );
    const nft_token_faucet = getNftTokenFaucet(program.programId, position_nft);

    const accounts = {
      authority: signerWallet.publicKey,
      vaultConfig: vault_config,
      userPosition: user_position,
      positionNft: position_nft,
      toAccount: to_account,
      nftTokenFaucet: nft_token_faucet,
      tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
    };

    const call = program.methods.emergencyWithdraw().accounts(accounts);
    const txSignature = await call.rpc();
    console.log("Transaction Signature", txSignature);

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    await retryOperation(
      async () => {
        await provider.connection.confirmTransaction(
          {
            signature: txSignature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          },
          "finalized"
        );
      },
      3,
      2000
    );

    return txSignature;
  } catch (error) {
    console.error("Error in emergencyWithdraw:", error);
    throw error;
  }
}

export async function checkBalance(
  connection: anchor.web3.Connection,
  signerWallet: anchor.web3.Keypair,
  position_nft: anchor.web3.PublicKey,
) {
  try {
    const signer_nft_account = spl.getAssociatedTokenAddressSync(
      position_nft,
      signerWallet.publicKey,
      true,
      spl.TOKEN_2022_PROGRAM_ID
    );

    const balance = await connection.getTokenAccountBalance(signer_nft_account);
    return balance.value.uiAmount;
  } catch (error) {
    console.error("Error in checkBalance:", error);
    throw error;
  }
}
