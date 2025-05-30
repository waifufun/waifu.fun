import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/solana-objects";
import {
  DataSourceBuilder,
  Instruction,
  SolanaRpcClient,
} from "@subsquid/solana-stream";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import dotenv from "dotenv";
import * as autofun from "./abi/autofun";
import * as tokenProgram from "./abi/token-program";
import { Event } from "./model";

dotenv.config();

if (!process.env.SOLANA_RPC) {
  console.error("SOLANA_RPC environment variable is required");
  process.exit(1);
}

console.log("Starting Autofun Indexer...");

const CONFIG = {
  GATEWAY_URL: "https://v2.archive.subsquid.io/network/solana-mainnet",
  // start right before SQUID for testing purposes
  START_BLOCK: 336000000,
  // START_BLOCK: 300000000,
  RPC_STRIDE_CONCURRENCY: 100,
} as const;

interface LaunchData {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  mintAddress: string;
}

interface SwapData {
  amount: number;
  direction: "buy" | "sell";
  minimumReceiveAmount: number;
  wantedAmount: number;
  receivedAmount: number;
  tokenMint: string;
}

interface CurveCompleteData {
  user: string;
  mint: string;
  bondingCurve: string;
}

interface EventData {
  event: "launch" | "swap" | "curveComplete";
  signature: string;
  data: LaunchData | SwapData | CurveCompleteData;
  blockHeight: number;
  from: string;
  timestamp: number;
}
const dataSource = new DataSourceBuilder()
  .setGateway(CONFIG.GATEWAY_URL)
  .setRpc(
    process.env.SOLANA_RPC
      ? {
          client: new SolanaRpcClient({
            url: process.env.SOLANA_RPC,
          }),
          strideConcurrency: CONFIG.RPC_STRIDE_CONCURRENCY,
        }
      : undefined
  )
  .setBlockRange({ from: CONFIG.START_BLOCK })
  .setFields({
    log: {
      kind: true,
      message: true,
    },
    balance: {
      post: true,
      pre: true,
    },
    block: {
      timestamp: true,
    },
    transaction: {
      err: true,
      signatures: true,
    },
    instruction: {
      programId: true,
      accounts: true,
      data: true,
      error: true,
      hasDroppedLogMessages: true,
      isCommitted: true,
    },
    tokenBalance: {
      postDecimals: true,
      postMint: true,
      postProgramId: true,
      preDecimals: true,
      preMint: true,
      preProgramId: true,
      preAmount: true,
      postAmount: true,
      preOwner: true,
      postOwner: true,
    },
  })
  .addInstruction({
    where: {
      programId: [autofun.programId],
      d8: [
        autofun.instructions.swap.d8,
        autofun.instructions.launchAndSwap.d8,
        autofun.instructions.launch.d8,
      ],
      isCommitted: true,
    },
    include: {
      logs: true,
      innerInstructions: true,
      transactionInstructions: true,
      transaction: true,
      transactionBalances: true,
      transactionTokenBalances: true,
    },
  })
  .addLog({
    where: {
      programId: [autofun.programId],
      kind: ["log"],
    },
    include: {
      transaction: true,
      instruction: true,
    },
  })
  .build();

const database = new TypeormDatabase();

function calculateSwapAmounts(tokenBalances: any[], tokenMint: string) {
  const relevantBalances = tokenBalances.filter(
    (balance) => balance.postMint === tokenMint || balance.preMint === tokenMint
  );

  let swapAmount = BigInt(0);
  let receivedAmount = BigInt(0);

  for (const balance of relevantBalances) {
    const amount =
      BigInt(balance.postAmount || "0") - BigInt(balance.preAmount || "0");

    if (amount > 0) {
      receivedAmount = amount;
    } else if (amount < 0) {
      swapAmount = -amount;
    }
  }

  return {
    swapAmount: Number(swapAmount),
    receivedAmount: Number(receivedAmount),
  };
}

function createSwapEvent(
  instruction: Instruction,
  tx: any,
  block: any
): EventData {
  const swapData = autofun.instructions.swap.decode(instruction);
  const tokenMint = swapData.accounts.tokenMint;
  const { swapAmount, receivedAmount } = calculateSwapAmounts(
    tx.tokenBalances || [],
    tokenMint
  );

  const swapEventData: SwapData = {
    wantedAmount: Number(swapData.data.amount),
    direction: swapData.data.direction === 0 ? "buy" : "sell",
    minimumReceiveAmount: Number(swapData.data.minimumReceiveAmount),
    amount: swapAmount,
    receivedAmount,
    tokenMint: swapData.accounts.tokenMint,
  };

  return {
    event: "swap",
    signature: tx.signatures[0],
    data: swapEventData,
    blockHeight: block.header.height,
    timestamp: block.header.timestamp,
    from: swapData.accounts.user,
  };
}

function createCurveCompleteEvent(log: any, tx: any, block: any): EventData {
  const eventData = autofun.events.CompleteEvent.decode(log);
  
  const curveCompleteData: CurveCompleteData = {
    user: eventData.user,
    mint: eventData.mint,
    bondingCurve: eventData.bondingCurve,
  };

  return {
    event: "curveComplete",
    signature: tx.signatures[0],
    data: curveCompleteData,
    blockHeight: block.header.height,
    timestamp: block.header.timestamp,
    from: eventData.user,
  };
}

function createLaunchEvent(instruction: any, tx: any, block: any): EventData {
  const launchData = autofun.instructions.launch.decode(instruction);

  const launchEventData: LaunchData = {
    name: launchData.data.name,
    symbol: launchData.data.symbol,
    uri: launchData.data.uri,
    decimals: launchData.data.decimals,
    mintAddress: launchData.accounts.token,
  };

  return {
    event: "launch",
    signature: tx.signatures[0],
    data: launchEventData,
    blockHeight: block.header.height,
    timestamp: block.header.timestamp,
    from: launchData.accounts.creator, // signer/user
  };
}

function createLaunchAndSwapEvents(
  instruction: any,
  tx: any,
  block: any
): EventData[] {
  const launchSwapData = autofun.instructions.launchAndSwap.decode(instruction);
  const mintAddress = launchSwapData.accounts.token;
  const { swapAmount, receivedAmount } = calculateSwapAmounts(
    tx.tokenBalances || [],
    mintAddress
  );

  const launchEventData: LaunchData = {
    name: launchSwapData.data.name,
    symbol: launchSwapData.data.symbol,
    uri: launchSwapData.data.uri,
    decimals: launchSwapData.data.decimals,
    mintAddress: mintAddress,
  };

  const launchEvent: EventData = {
    event: "launch",
    signature: tx.signatures[0],
    data: launchEventData,
    blockHeight: block.header.height,
    timestamp: block.header.timestamp,
    from: launchSwapData.accounts.creator,
  };

  const swapEventData: SwapData = {
    wantedAmount: Number(launchSwapData.data.swapAmount),
    direction: "buy", // Launch and swap is always a buy
    minimumReceiveAmount: Number(launchSwapData.data.minimumReceiveAmount) || 0,
    amount: swapAmount,
    receivedAmount,
    tokenMint: mintAddress,
  };

  const swapEvent: EventData = {
    event: "swap",
    signature: tx.signatures[0],
    data: swapEventData,
    blockHeight: block.header.height,
    timestamp: block.header.timestamp,
    from: launchSwapData.accounts.creator,
  };

  return [launchEvent, swapEvent];
}

function processInstruction(
  instruction: any,
  tx: any,
  block: any
): EventData[] {
  const events: EventData[] = [];

  try {
    // Handle swap instruction
    if (instruction.d8 === autofun.instructions.swap.d8) {
      const tokenMint = instruction.accounts;
      const swapEvent = createSwapEvent(instruction, tx, block);
      events.push(swapEvent);
      // console.log("Swap event created:", swapEvent);
    }

    // Handle launch instruction
    else if (instruction.d8 === autofun.instructions.launch.d8) {
      const launchEvent = createLaunchEvent(instruction, tx, block);
      events.push(launchEvent);
      // console.log("Launch event created:", launchEvent);
    }

    // Handle launch and swap instruction
    else if (instruction.d8 === autofun.instructions.launchAndSwap.d8) {
      const launchAndSwapEvents = createLaunchAndSwapEvents(
        instruction,
        tx,
        block
      );
      events.push(...launchAndSwapEvents);
      // console.log("Launch and Swap events created:", launchAndSwapEvents);
    }
  } catch (error) {
    console.error(
      `Error processing instruction in tx ${tx.signatures[0]}:`,
      error
    );
  }

  return events;
}

function convertEventDataToEntity(eventData: EventData, index: number = 0): Event {
  const now = new Date();
  const event = new Event({
    id: `${eventData.signature}-${eventData.event}-${index}`,
    eventType: eventData.event,
    signature: eventData.signature,
    blockHeight: eventData.blockHeight,
    timestamp: new Date(eventData.timestamp),
    from: eventData.from,
    createdAt: now,
  });

  if (eventData.event === "launch") {
    const data = eventData.data as LaunchData;
    event.name = data.name;
    event.symbol = data.symbol;
    event.uri = data.uri;
    event.decimals = data.decimals;
    event.mintAddress = data.mintAddress;
  } else if (eventData.event === "swap") {
    const data = eventData.data as SwapData;
    event.amount = BigInt(data.amount);
    event.direction = data.direction;
    event.minimumReceiveAmount = BigInt(data.minimumReceiveAmount);
    event.wantedAmount = BigInt(data.wantedAmount);
    event.receivedAmount = BigInt(data.receivedAmount);
    event.tokenMint = data.tokenMint;
  } else if (eventData.event === "curveComplete") {
    const data = eventData.data as CurveCompleteData;
    event.mintAddress = data.mint;
    event.bondingCurve = data.bondingCurve;
  }

  return event;
}

// Main process
run(dataSource, database, async (ctx) => {
  console.log(`Processing batch from block ${ctx.blocks[0].header.height}...`);
  const blocks = ctx.blocks.map(augmentBlock);
  const events: EventData[] = [];

  for (const block of blocks) {
    // Process instructions (existing code)
    for (const tx of block.transactions) {
      for (const instruction of tx.instructions) {
        if (instruction.programId === autofun.programId) {
          const instructionEvents = processInstruction(instruction, tx, block);
          events.push(...instructionEvents);
        }
      }

      console.log("ewa");
      
      for (const log of block.logs || []) {
        if (log.programId === autofun.programId && log.kind === 'log') {
          try {
            const completeEvent = createCurveCompleteEvent(log, tx, block);
            events.push(completeEvent);
          } catch (error) {
            console.log(
              `Error processing CompleteEvent log in tx ${tx.signatures[0]}:`,)
            // Skip logs that don't match the CompleteEvent format
          }
        }
      }
    }
  }

  console.log(`Processed ${events.length} events in this batch`);

  // For debugging
  const eventEntities = events.map((eventData, index) => 
    convertEventDataToEntity(eventData, index)
  );
  await ctx.store.save(eventEntities);
  console.log(`Saved ${eventEntities.length} events to database`);
});
