import * as assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { BN, type Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { Autofun } from "../target/types/autofun";
import {
  SEED_BONDING_CURVE,
  SEED_GLOBAL,
  TEST_NAME,
  TEST_SYMBOL,
  TEST_URI,
} from "./constant";
import {
  TEST_CONFIG,
  airdropSol,
  buildConfig,
  getAutofunProgram,
  getConfigPda,
} from "./helpers";
import { getAssociatedTokenAccount } from "./utils";

require("dotenv").config();

describe("autofun", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = getAutofunProgram(provider) as Program<Autofun>;

  const adminKp = Keypair.generate();
  const userKp = Keypair.generate();
  const user2Kp = Keypair.generate();
  const tokenKp = Keypair.generate();

  const connection = provider.connection;

  before(async () => {
    await airdropSol(connection, adminKp.publicKey, 5);
    await airdropSol(connection, userKp.publicKey, 5);
    await airdropSol(connection, user2Kp.publicKey, 10);
  });

  it("correctly configured", async () => {
    const newConfig = buildConfig(adminKp.publicKey, adminKp.publicKey);

    const tx = await program.methods
      .configure(newConfig)
      .accounts({
        payer: adminKp.publicKey,
      })
      .signers([adminKp])
      .rpc();

    console.log("tx signature:", tx);

    const configPda = getConfigPda(program.programId);
    const configAccount = await program.account.config.fetch(configPda);

    assert.equal(
      configAccount.authority.toString(),
      adminKp.publicKey.toString()
    );
    assert.equal(configAccount.platformBuyFee.toString(), "500");
    assert.equal(configAccount.platformSellFee.toString(), "500");
    assert.equal(
      configAccount.lamportAmountConfig.range.min?.toString(),
      "1000000000"
    );
    assert.equal(
      configAccount.lamportAmountConfig.range.max?.toString(),
      "100000000000"
    );
    assert.equal(configAccount.tokenSupplyConfig.range.min?.toString(), "5000");
    assert.equal(
      configAccount.tokenSupplyConfig.range.max?.toString(),
      TEST_CONFIG.tokenSupply
    );
    assert.equal(configAccount.tokenDecimalsConfig.range.min, 6);
    assert.equal(configAccount.tokenDecimalsConfig.range.max, 9);
    assert.equal(configAccount.initBondingCurve, TEST_CONFIG.initBondingCurve);
  });

  it("token created", async () => {
    const configPda = getConfigPda(program.programId);
    const configAccount = await program.account.config.fetch(configPda);

    const tx = await program.methods
      .launch(
        TEST_CONFIG.decimals,
        new BN(TEST_CONFIG.tokenSupply),
        new BN(TEST_CONFIG.virtualReserves),
        TEST_NAME,
        TEST_SYMBOL,
        TEST_URI
      )
      .accounts({
        creator: userKp.publicKey,
        token: tokenKp.publicKey,
        teamWallet: configAccount.teamWallet,
      })
      .signers([userKp, tokenKp])
      .rpc();

    console.log("tx signature:", tx);

    const supply = await connection.getTokenSupply(tokenKp.publicKey);
    assert.equal(supply.value.amount, TEST_CONFIG.tokenSupply);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );
    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    assert.equal(curveAccount.creator.toBase58(), userKp.publicKey.toBase58());

    const teamTokenAccount = getAssociatedTokenAccount(
      adminKp.publicKey,
      tokenKp.publicKey
    );
    const [globalVault] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_GLOBAL)],
      program.programId
    );
    const globalVaultTokenAccount = getAssociatedTokenAccount(
      globalVault,
      tokenKp.publicKey
    );
    const teamTokenBalance = await connection.getTokenAccountBalance(
      teamTokenAccount
    );
    const globalVaultBalance = await connection.getTokenAccountBalance(
      globalVaultTokenAccount
    );

    const teamShare =
      (BigInt(TEST_CONFIG.tokenSupply) *
        BigInt(100 - TEST_CONFIG.initBondingCurve)) /
      100n;
    const curveShare =
      (BigInt(TEST_CONFIG.tokenSupply) * BigInt(TEST_CONFIG.initBondingCurve)) /
      100n;

    assert.equal(teamTokenBalance.value.amount, teamShare.toString());
    assert.equal(globalVaultBalance.value.amount, curveShare.toString());
  });

  it("user1's swap SOL for token completed", async () => {
    const configPda = getConfigPda(program.programId);
    const configAccount = await program.account.config.fetch(configPda);
    const deadline = Math.floor(Date.now() / 1000) + 120;

    try {
      await program.methods
        .swap(
          new BN(5_000_000),
          0,
          new BN(TEST_CONFIG.tokenSupply),
          new BN(deadline)
        )
        .accounts({
          teamWallet: configAccount.teamWallet,
          user: userKp.publicKey,
          tokenMint: tokenKp.publicKey,
        })
        .signers([userKp])
        .rpc();
      assert.fail("expected slippage protection to reject the swap");
    } catch (error) {
      assert.match(
        JSON.stringify(error),
        /Return amount is too small compared to the minimum received amount./
      );
    }

    const tx = await program.methods
      .swap(new BN(5_000_000), 0, new BN(0), new BN(deadline))
      .accounts({
        teamWallet: configAccount.teamWallet,
        user: userKp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([userKp])
      .rpc();

    console.log("tx signature:", tx);

    const tokenAccount = getAssociatedTokenAccount(
      userKp.publicKey,
      tokenKp.publicKey
    );
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);

    assert.ok(
      Number(tokenBalance.value.amount) > 0,
      "user should receive tokens on buy"
    );
  });

  it("user1's swap Token for SOL completed", async () => {
    const configPda = getConfigPda(program.programId);
    const configAccount = await program.account.config.fetch(configPda);
    const tokenAccount = getAssociatedTokenAccount(
      userKp.publicKey,
      tokenKp.publicKey
    );
    const tokenBalanceBefore = await connection.getTokenAccountBalance(
      tokenAccount
    );
    const deadline = Math.floor(Date.now() / 1000) + 120;

    const tx = await program.methods
      .swap(
        new BN(tokenBalanceBefore.value.amount),
        1,
        new BN(0),
        new BN(deadline)
      )
      .accounts({
        teamWallet: configAccount.teamWallet,
        user: userKp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([userKp])
      .rpc();

    console.log("tx signature:", tx);

    const tokenBalanceAfter = await connection.getTokenAccountBalance(
      tokenAccount
    );
    assert.equal(tokenBalanceAfter.value.amount, "0");
  });

  it("curve reached the limit", async () => {
    const configPda = getConfigPda(program.programId);
    const configAccount = await program.account.config.fetch(configPda);
    const deadline = Math.floor(Date.now() / 1000) + 120;

    const tx = await program.methods
      .swap(new BN(4_000_000_000), 0, new BN(0), new BN(deadline))
      .accounts({
        teamWallet: configAccount.teamWallet,
        user: user2Kp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([user2Kp])
      .rpc();

    console.log("tx signature:", tx);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );
    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    assert.equal(curveAccount.isCompleted, true);
    assert.equal(
      curveAccount.reserveLamport.toString(),
      configAccount.curveLimit.toString()
    );
  });

  it("admin withdrew token and SOL", async () => {
    const tx = await program.methods
      .withdraw()
      .accounts({
        admin: adminKp.publicKey,
        tokenMint: tokenKp.publicKey,
      })
      .signers([adminKp])
      .rpc();

    console.log("tx signature:", tx);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );
    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    assert.equal(curveAccount.reserveLamport.toString(), "0");
    assert.equal(curveAccount.reserveToken.toString(), "0");
  });
});
