import * as assert from "node:assert";
import * as anchor from "@coral-xyz/anchor";
import { BN, type Program } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Keypair, type Connection } from "@solana/web3.js";
import type { Autofun } from "../target/types/autofun";
import {
  SEED_BONDING_CURVE,
  TEST_NAME,
  TEST_SYMBOL,
  TEST_URI,
} from "./constant";
import {
  TEST_CONFIG,
  airdropSol,
  ensureConfigured,
  getAutofunProgram,
  isSolanaAuditIntegrationEnabled,
} from "./helpers";
import { getAssociatedTokenAccount } from "./utils";

require("dotenv").config();

(isSolanaAuditIntegrationEnabled() ? describe : describe.skip)(
  "launch_and_swap",
  () => {
  let provider: anchor.AnchorProvider;
  let program: Program<Autofun>;
  let connection: Connection;

  const adminKp = Keypair.generate();
  const creatorKp = Keypair.generate();
  const tokenKp = Keypair.generate();

  before(async () => {
    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    program = getAutofunProgram(provider) as Program<Autofun>;
    connection = provider.connection;
    await airdropSol(connection, adminKp.publicKey, 5);
    await airdropSol(connection, creatorKp.publicKey, 5);
  });

  it("launches token and swaps in one transaction", async () => {
    const configAccount = await ensureConfigured(
      program,
      adminKp,
      adminKp.publicKey
    );

    const swapAmount = 100_000_000;
    const deadline = Math.floor(Date.now() / 1000) + 120;
    const initialBalance = await connection.getBalance(creatorKp.publicKey);

    const tx = await program.methods
      .launchAndSwap(
        TEST_CONFIG.decimals,
        new BN(TEST_CONFIG.tokenSupply),
        new BN(TEST_CONFIG.virtualReserves),
        TEST_NAME,
        TEST_SYMBOL,
        TEST_URI,
        new BN(swapAmount),
        new BN(0),
        new BN(deadline)
      )
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400_000,
        }),
      ])
      .accounts({
        teamWallet: configAccount.teamWallet,
        creator: creatorKp.publicKey,
        token: tokenKp.publicKey,
      })
      .signers([creatorKp, tokenKp])
      .rpc();

    console.log("Launch and swap tx signature:", tx);

    const supply = await connection.getTokenSupply(tokenKp.publicKey);
    assert.equal(supply.value.amount, TEST_CONFIG.tokenSupply);

    const creatorTokenAccount = getAssociatedTokenAccount(
      creatorKp.publicKey,
      tokenKp.publicKey
    );
    const tokenBalance = await connection.getTokenAccountBalance(
      creatorTokenAccount
    );
    assert.ok(
      Number(tokenBalance.value.amount) > 0,
      "creator should have tokens after launchAndSwap"
    );

    const [bondingCurvePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), tokenKp.publicKey.toBytes()],
      program.programId
    );
    const curveAccount = await program.account.bondingCurve.fetch(
      bondingCurvePda
    );

    assert.equal(
      curveAccount.creator.toString(),
      creatorKp.publicKey.toString()
    );
    assert.ok(
      curveAccount.reserveLamport.gt(new BN(TEST_CONFIG.virtualReserves)),
      "bonding curve should reflect the initial buy"
    );

    const finalBalance = await connection.getBalance(creatorKp.publicKey);
    assert.ok(
      initialBalance - finalBalance > swapAmount,
      "creator should spend SOL on launch and initial swap"
    );
  });
});
