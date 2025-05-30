import { SolanaRpcProvider } from "@autofun/rpc";
import { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";
import DB from "@autofun/database";
import logger from "@autofun/logger";

export interface SolanaIndexerConfig {
  networkId: SolanaNetworkIds;
  autoFunAddress: SolanaAddressLike;
  startSlot?: number;
  endSlot?: number;
  batchSize?: number;
  concurrencyLimit?: number;
}

export interface DecodedInstruction {
  type: "launch" | "swap" | "launchAndSwap" | "unknown";
  data?: any;
  mintAddress?: string;
  tokenMint?: string;
  creator?: string;
  user?: string;
  accounts: string[];
  discriminator?: number[];
}

export class SolanaIndexer {
  private rpc: SolanaRpcProvider;
  private config: SolanaIndexerConfig;

  constructor(config: SolanaIndexerConfig) {
    this.config = {
      batchSize: 30, // Smaller batches for large blocks
      concurrencyLimit: 30, // Reduced concurrency for memory management
      ...config,
    };
    this.rpc = new SolanaRpcProvider(this.config.networkId);
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }

  private replacer(key: string, value: any): any {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  }

  private decodeAutofunInstruction(
    instructionData: Buffer,
    accounts: string[]
  ): DecodedInstruction {
    const discriminator = Array.from(instructionData.slice(0, 8));

    if (this.arraysEqual(discriminator, IDLInstructions.launch.d8)) {
      const decoded = IDLInstructions.launch.decode(instructionData);
      const mintAddress = accounts[3];
      const creator = accounts[2];

      return {
        type: "launch",
        data: decoded,
        mintAddress,
        creator,
        accounts,
      };
    } else if (this.arraysEqual(discriminator, IDLInstructions.swap.d8)) {
      const decoded = IDLInstructions.swap.decode(instructionData);
      const tokenMint = accounts[4];
      const user = accounts[7];

      return {
        type: "swap",
        data: decoded,
        tokenMint,
        user,
        accounts,
      };
    } else if (
      this.arraysEqual(discriminator, IDLInstructions.launchAndSwap.d8)
    ) {
      const decoded = IDLInstructions.launchAndSwap.decode(instructionData);
      const mintAddress = accounts[3];
      const creator = accounts[2];

      return {
        type: "launchAndSwap",
        data: decoded,
        mintAddress,
        creator,
        accounts,
      };
    }

    return {
      type: "unknown",
      discriminator: discriminator,
      accounts,
    };
  }

  private processTransaction(
    transaction: any,
    blockTime: number,
    slot: number
  ): any[] {
    const events: any[] = [];

    // Quick pre-check without converting all accounts to strings
    const accounts = transaction.transaction.message.staticAccountKeys;
    let hasOurProgram = false;

    for (const account of accounts) {
      if (account.toBase58() === this.config.autoFunAddress) {
        hasOurProgram = true;
        break;
      }
    }

    if (!hasOurProgram) {
      return events;
    }

    // Convert to strings only if needed
    const accountStrings = accounts.map((key: any) => key.toBase58());

    for (const [
      instructionIndex,
      instruction,
    ] of transaction.transaction.message.compiledInstructions.entries()) {
      const programId = accountStrings[instruction.programIdIndex];

      if (programId === this.config.autoFunAddress) {
        const instructionAccounts = instruction.accountKeyIndexes.map(
          (index: number) => accountStrings[index]
        );

        const decodedInstruction = this.decodeAutofunInstruction(
          Buffer.from(instruction.data),
          instructionAccounts
        );

        if (decodedInstruction.type !== "unknown") {
          const eventData = this.createEventData(
            transaction.transaction.signatures[0],
            slot,
            blockTime,
            instructionIndex,
            decodedInstruction
          );
          events.push(eventData);
        }
      }
    }

    return events;
  }

  private createEventData(
    signature: string,
    slot: number,
    blockTime: number,
    instructionIndex: number,
    decodedInstruction: DecodedInstruction
  ): any {
    const eventData: any = {
      signature,
      slot,
      blockTime,
      eventType: decodedInstruction.type,
      contractAddress:
        decodedInstruction.mintAddress || decodedInstruction.tokenMint,
      creator: decodedInstruction.creator,
      user: decodedInstruction.user,
      instructionIndex,
      programId: this.config.autoFunAddress,
      accounts: decodedInstruction.accounts,
      processed: true,
    };

    if (decodedInstruction.type === "launch" && decodedInstruction.data?.data) {
      Object.assign(eventData, {
        tokenName: decodedInstruction.data.data.name,
        tokenSymbol: decodedInstruction.data.data.symbol,
        tokenUri: decodedInstruction.data.data.uri,
        decimals: decodedInstruction.data.data.decimals,
        tokenSupply: decodedInstruction.data.data.tokenSupply?.toString(),
        virtualLamportReserves:
          decodedInstruction.data.data.virtualLamportReserves?.toString(),
      });
    } else if (
      decodedInstruction.type === "swap" &&
      decodedInstruction.data?.data
    ) {
      Object.assign(eventData, {
        swapAmount: decodedInstruction.data.data.amount?.toString(),
        direction: decodedInstruction.data.data.direction,
        minimumReceiveAmount:
          decodedInstruction.data.data.minimumReceiveAmount?.toString(),
        deadline: decodedInstruction.data.data.deadline?.toString(),
      });
    } else if (
      decodedInstruction.type === "launchAndSwap" &&
      decodedInstruction.data?.data
    ) {
      Object.assign(eventData, {
        tokenName: decodedInstruction.data.data.name,
        tokenSymbol: decodedInstruction.data.data.symbol,
        tokenUri: decodedInstruction.data.data.uri,
        decimals: decodedInstruction.data.data.decimals,
        tokenSupply: decodedInstruction.data.data.tokenSupply?.toString(),
        virtualLamportReserves:
          decodedInstruction.data.data.virtualLamportReserves?.toString(),
        swapAmount: decodedInstruction.data.data.swapAmount?.toString(),
        minimumReceiveAmount:
          decodedInstruction.data.data.minimumReceiveAmount?.toString(),
        deadline: decodedInstruction.data.data.deadline?.toString(),
      });
    }

    return eventData;
  }

  private async saveBatchEvents(events: any[]): Promise<void> {
    if (events.length === 0) return;

    try {
      // For large event batches, process in chunks to avoid memory issues
      const chunkSize = 50;
      let totalSaved = 0;

      for (let i = 0; i < events.length; i += chunkSize) {
        const chunk = events.slice(i, i + chunkSize);
        await DB.Event.insertManyOrUpdate(chunk);
        totalSaved += chunk.length;
      }

      logger.info(`Batch saved ${totalSaved} events to database`);
    } catch (error: any) {
      throw new Error(
        `Error saving batch events to database: ${error.message}`
      );
    }
  }

  private async getSignatures(slot: number): Promise<string[]> {
    try {
      const signatures = await this.rpc.getSignaturesForAddress(
        this.config.autoFunAddress,
        {
          limit: 1000,
        }
      );

      return signatures;
    } catch (error) {
      logger.error(`Error fetching signatures for slot ${slot}:`, error);
      return [];
    }
  }

  public async processFromBlock(slot: number): Promise<any[]> {
    const startTime = Date.now();

    try {
      const block = await this.rpc.getBlock(slot);

      if (!block) {
        return [];
      }

      const downloadTime = Date.now() - startTime;
      const blockSizeMB = (JSON.stringify(block).length / 1024 / 1024).toFixed(
        2
      );

      const processStart = Date.now();
      const blockEvents: any[] = [];
      let relevantTransactions = 0;

      // Process transactions efficiently
      for (const transaction of block.transactions) {
        const events = this.processTransaction(
          transaction,
          block.blockTime || 0,
          slot
        );

        if (events.length > 0) {
          blockEvents.push(...events);
          relevantTransactions++;
        }
      }

      const processTime = Date.now() - processStart;
      const totalTime = Date.now() - startTime;

      if (blockEvents.length > 0) {
        logger.info(
          `Block ${slot}: ${blockEvents.length} events from ${relevantTransactions}/${block.transactions.length} txs (${blockSizeMB}MB, ${downloadTime}ms download, ${processTime}ms process)`
        );
      }

      return blockEvents;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error(`Error processing block ${slot} (${totalTime}ms):`, error);
      return [];
    }
  }

  private async processBlocksBatch(slots: number[]): Promise<any[]> {
    const concurrencyLimit = this.config.concurrencyLimit!;
    const allEvents: any[] = [];

    // Process in smaller concurrent chunks to manage memory and RPC load
    for (let i = 0; i < slots.length; i += concurrencyLimit) {
      const chunk = slots.slice(i, i + concurrencyLimit);

      const chunkPromises = chunk.map(async (slot) => {
        try {
          return await this.processBlock(slot);
        } catch (error) {
          logger.error(`Failed to process slot ${slot}:`, error);
          return [];
        }
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const result of chunkResults) {
        if (result.status === "fulfilled") {
          allEvents.push(...result.value);
        }
      }

      // Delay between chunks to avoid overwhelming RPC for large blocks
      if (i + concurrencyLimit < slots.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return allEvents;
  }

  public async run(): Promise<void> {
    try {
      if (this.config.startSlot !== undefined) {
        const endSlot = this.config.endSlot || this.config.startSlot;
        const slots: number[] = [];

        for (let slot = this.config.startSlot; slot <= endSlot; slot++) {
          slots.push(slot);
        }

        const batchSize = this.config.batchSize!;
        const totalBatches = Math.ceil(slots.length / batchSize);

        const overallStartTime = Date.now();
        let totalProcessedSlots = 0;
        let totalEvents = 0;

        logger.info(
          `Starting indexer: ${slots.length} slots in ${totalBatches} batches of ${batchSize} (concurrency: ${this.config.concurrencyLimit})`
        );

        for (let i = 0; i < slots.length; i += batchSize) {
          const batch = slots.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;

          logger.info(
            `Processing batch ${batchNumber}/${totalBatches}: slots ${
              batch[0]
            } - ${batch[batch.length - 1]}`
          );

          const batchStartTime = Date.now();

          try {
            // Use optimized batch processing for large blocks
            const allBatchEvents = await this.processBlocksBatch(batch);

            // Save all events from the batch at once
            if (allBatchEvents.length > 0) {
              await this.saveBatchEvents(allBatchEvents);
            }

            const batchDuration = Date.now() - batchStartTime;
            const batchBlocksPerSecond = (
              (batch.length / batchDuration) *
              1000
            ).toFixed(2);

            totalProcessedSlots += batch.length;
            totalEvents += allBatchEvents.length;

            const overallDuration = Date.now() - overallStartTime;
            const overallBlocksPerSecond = (
              (totalProcessedSlots / overallDuration) *
              1000
            ).toFixed(2);

            logger.info(
              `Completed batch ${batchNumber}/${totalBatches} in ${batchDuration}ms with ${allBatchEvents.length} events`
            );
            logger.info(
              `Batch: ${batchBlocksPerSecond} blocks/sec | Overall: ${overallBlocksPerSecond} blocks/sec | Total events: ${totalEvents}`
            );
          } catch (error: any) {
            logger.error(
              `Error processing batch ${batchNumber}: ${error.message}`
            );
          }
        }

        // Final performance summary
        const totalDuration = Date.now() - overallStartTime;
        const finalBlocksPerSecond = (
          (totalProcessedSlots / totalDuration) *
          1000
        ).toFixed(2);
        const averageTimePerBlock = (
          totalDuration / totalProcessedSlots
        ).toFixed(2);

        logger.info(`
=== INDEXING COMPLETE ===
Total slots processed: ${totalProcessedSlots}
Total events found: ${totalEvents}
Total time: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(
          2
        )} minutes)
Average blocks per second: ${finalBlocksPerSecond}
Average time per block: ${averageTimePerBlock}ms
Events per slot: ${(totalEvents / totalProcessedSlots).toFixed(4)}
        `);
      } else {
        logger.error(
          "No startSlot provided. Please specify a startSlot to begin indexing."
        );
      }
    } catch (error) {
      logger.error("Error running indexer:", error);
    }
  }
}
