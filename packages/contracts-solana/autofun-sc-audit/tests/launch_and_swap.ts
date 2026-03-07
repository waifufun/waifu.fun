import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Autofun } from "../target/types/autofun";
import { ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import * as assert from "assert";
import {
  TEST_NAME,
  TEST_SYMBOL,
  TEST_URI,
  SEED_BONDING_CURVE,
} from "./constant";
import { getAssociatedTokenAccount } from "./utils";
import {
  TEST_CONFIG,
  airdropSol,
  ensureConfigured,
  getAutofunProgram,
} from "./helpers";

require("dotenv").config();

describe("launch_and_swap", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = getAutofunProgram(provider) as Program<Autofun>;

  const adminKp = Keypair.generate();
  const creatorKp = Keypair.generate();
  const tokenKp = Keypair.generate();

  const connection = provider.connection;

  before(async () => {
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
