import { readFileSync } from "node:fs";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  LAMPORTS_PER_SOL,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { SEED_CONFIG } from "./constant";

function getEnvNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid numeric env ${name}=${rawValue}`);
  }

  return parsedValue;
}

function getEnvString(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const TEST_CONFIG = {
  initBondingCurve: getEnvNumber("INIT_BONDING_CURVE", 30),
  decimals: getEnvNumber("DECIMALS", 6),
  tokenSupply: getEnvString("TOKEN_SUPPLY", "1000000000000000"),
  virtualReserves: getEnvString("VIRTUAL_RESERVES", "2800000000"),
};

const AUTOFUN_IDL = JSON.parse(readFileSync("target/idl/autofun.json", "utf8"));
const LOCAL_IDL_ACCOUNT_FILTERS = new Map([
  [
    "launch",
    new Set(["token_metadata_account", "rent", "mpl_token_metadata_program"]),
  ],
  [
    "launch_and_swap",
    new Set(["token_metadata_account", "rent", "mpl_token_metadata_program"]),
  ],
]);

function normalizeLocalIdl(idl: any) {
  for (const instruction of idl.instructions ?? []) {
    const excludedAccounts = LOCAL_IDL_ACCOUNT_FILTERS.get(instruction.name);
    if (!excludedAccounts) {
      continue;
    }

    instruction.accounts = (instruction.accounts ?? []).filter(
      (account: { name: string }) => !excludedAccounts.has(account.name)
    );
  }

  return idl;
}

export async function airdropSol(
  connection: Connection,
  publicKey: PublicKey,
  solAmount: number
) {
  const signature = await connection.requestAirdrop(
    publicKey,
    solAmount * LAMPORTS_PER_SOL
  );
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );
}

export function getConfigPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    programId
  )[0];
}

export function getAutofunProgram(provider: any) {
  const idl = normalizeLocalIdl(structuredClone(AUTOFUN_IDL));
  if (process.env.SOLANA_PROGRAM_ID) {
    idl.address = process.env.SOLANA_PROGRAM_ID;
  }

  return new Program(idl, provider);
}

export function buildConfig(authority: PublicKey, teamWallet: PublicKey) {
  return {
    authority,
    pendingAuthority: PublicKey.default,
    teamWallet,
    initBondingCurve: TEST_CONFIG.initBondingCurve,
    platformBuyFee: new BN(500),
    platformSellFee: new BN(500),
    curveLimit: new BN(4_000_000_000),
    lamportAmountConfig: {
      range: { min: new BN(1_000_000_000), max: new BN(100_000_000_000) },
    },
    tokenSupplyConfig: {
      range: {
        min: new BN(5_000),
        max: new BN(TEST_CONFIG.tokenSupply),
      },
    },
    tokenDecimalsConfig: {
      range: { min: 6, max: 9 },
    },
  };
}

function isMissingAccountError(error: unknown) {
  return /(Account does not exist|has no data|AccountNotInitialized|could not find account)/i.test(
    String(error)
  );
}

export async function ensureConfigured(
  program: Program<any>,
  authority: Keypair,
  teamWallet: PublicKey
) {
  const configPda = getConfigPda(program.programId);

  try {
    return await program.account.config.fetch(configPda);
  } catch (error) {
    if (!isMissingAccountError(error)) {
      throw error;
    }
  }

  await program.methods
    .configure(buildConfig(authority.publicKey, teamWallet))
    .accounts({
      payer: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  return program.account.config.fetch(configPda);
}
