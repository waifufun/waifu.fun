import { SolanaRpcProvider } from "@autofun/rpc";
import { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";
import DB from "@autofun/database";
import logger from "@autofun/logger";

export interface SolanaIndexerConfig {
  networkId: SolanaNetworkIds;
  autoFunAddress: SolanaAddressLike;
  concurrencyLimit?: number;
  maxSignatures?: number;
  beforeSignature?: string;
  debugStatements?: boolean;
  minBlock?: number; // Minimum block to sync from (genesis point)
}

interface DecodedInstruction {
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
  private debugStatements = false;
  private readonly STOP_AT_SLOT: number;

  constructor(config: SolanaIndexerConfig) {
    this.config = {
      concurrencyLimit: 1,
      maxSignatures: 500,
      minBlock: 322725834, // Default minimum block
      ...config,
    };
    this.rpc = new SolanaRpcProvider(this.config.networkId);
    this.debugStatements = config.debugStatements || false;
    this.STOP_AT_SLOT = this.config.minBlock!;
  }

  // ... existing helper methods remain the same ...

  private arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }

  private decodeAutofunInstruction(
    instructionData: Buffer,
    accounts: string[]
  ): DecodedInstruction {
    const discriminator = Array.from(instructionData.slice(0, 8));

    if (this.arraysEqual(discriminator, IDLInstructions.launch.d8)) {
      return {
        type: "launch",
        data: IDLInstructions.launch.decode(instructionData),
        mintAddress: accounts[3],
        creator: accounts[2],
        accounts,
      };
    }

    if (this.arraysEqual(discriminator, IDLInstructions.swap.d8)) {
      return {
        type: "swap",
        data: IDLInstructions.swap.decode(instructionData),
        tokenMint: accounts[4],
        user: accounts[7],
        accounts,
      };
    }

    if (this.arraysEqual(discriminator, IDLInstructions.launchAndSwap.d8)) {
      return {
        type: "launchAndSwap",
        data: IDLInstructions.launchAndSwap.decode(instructionData),
        mintAddress: accounts[3],
        creator: accounts[2],
        accounts,
      };
    }

    return { type: "unknown", discriminator, accounts };
  }

  private hasAutoFunProgram(accounts: any[]): boolean {
    return accounts.some(
      (account) => account.toBase58() === this.config.autoFunAddress
    );
  }

  private processTransaction(
    transaction: any,
    blockTime: number,
    slot: number
  ): any[] {
    const events: any[] = [];
    const accounts = transaction.transaction.message.staticAccountKeys;

    if (!this.hasAutoFunProgram(accounts)) {
      return events;
    }

    const accountStrings = accounts.map((key: any) => key.toBase58());
    const compiledInstructions =
      transaction.transaction.message.compiledInstructions;

    for (const [
      instructionIndex,
      instruction,
    ] of compiledInstructions.entries()) {
      const programId = accountStrings[instruction.programIdIndex];

      if (programId !== this.config.autoFunAddress) continue;

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

    return events;
  }

  private createEventData(
    signature: string,
    slot: number,
    blockTime: number,
    instructionIndex: number,
    decodedInstruction: DecodedInstruction
  ): any {
    const baseEventData = {
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

    const instructionData = decodedInstruction.data?.data;
    if (!instructionData) return baseEventData;

    switch (decodedInstruction.type) {
      case "launch":
        return {
          ...baseEventData,
          tokenName: instructionData.name,
          tokenSymbol: instructionData.symbol,
          tokenUri: instructionData.uri,
          decimals: instructionData.decimals,
          tokenSupply: instructionData.tokenSupply?.toString(),
          virtualLamportReserves:
            instructionData.virtualLamportReserves?.toString(),
        };

      case "swap":
        return {
          ...baseEventData,
          swapAmount: instructionData.amount?.toString(),
          direction: instructionData.direction,
          minimumReceiveAmount:
            instructionData.minimumReceiveAmount?.toString(),
          deadline: instructionData.deadline?.toString(),
        };

      case "launchAndSwap":
        return {
          ...baseEventData,
          tokenName: instructionData.name,
          tokenSymbol: instructionData.symbol,
          tokenUri: instructionData.uri,
          decimals: instructionData.decimals,
          tokenSupply: instructionData.tokenSupply?.toString(),
          virtualLamportReserves:
            instructionData.virtualLamportReserves?.toString(),
          swapAmount: instructionData.swapAmount?.toString(),
          minimumReceiveAmount:
            instructionData.minimumReceiveAmount?.toString(),
          deadline: instructionData.deadline?.toString(),
        };

      default:
        return baseEventData;
    }
  }

  private async saveBatchEvents(events: any[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const chunkSize = 50;
      let totalSaved = 0;

      for (let i = 0; i < events.length; i += chunkSize) {
        const chunk = events.slice(i, i + chunkSize);
        await DB.Event.insertManyOrUpdate(chunk);
        totalSaved += chunk.length;
      }

      if (this.debugStatements) {
        logger.info(`Batch saved ${totalSaved} events to database`);
      }
    } catch (error: any) {
      throw new Error(`Error saving batch events: ${error.message}`);
    }
  }

  private async getSignatures(beforeSignature?: string): Promise<any[]> {
    try {
      return await this.rpc.getSignaturesForAddress(
        this.config.autoFunAddress,
        {
          limit: this.config.maxSignatures || 500,
          before: beforeSignature,
        }
      );
    } catch (error) {
      logger.error("Error fetching signatures:", error);
      return [];
    }
  }

  private async processSignature(signatureInfo: any): Promise<any[]> {
    const startTime = Date.now();

    try {
      const transaction = await this.rpc.getTransaction(
        signatureInfo.signature
      );

      if (!transaction?.meta || transaction.meta.err) {
        return [];
      }

      const downloadTime = Date.now() - startTime;
      const processStart = Date.now();

      const events = this.processTransaction(
        transaction,
        transaction.blockTime || 0,
        transaction.slot
      );

      const processTime = Date.now() - processStart;

      if (events.length > 0 && this.debugStatements) {
        logger.info(
          `Signature ${signatureInfo.signature}: ${events.length} events ` +
            `(slot: ${transaction.slot}, ${downloadTime}ms download, ${processTime}ms process)`
        );
      }

      return events;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error(
        `Error processing signature ${signatureInfo.signature} (${totalTime}ms):`,
        error
      );
      return [];
    }
  }

  private async processSignaturesBatch(signatures: any[]): Promise<any[]> {
    const { concurrencyLimit } = this.config;
    const allEvents: any[] = [];

    for (let i = 0; i < signatures.length; i += concurrencyLimit!) {
      const chunk = signatures.slice(i, i + concurrencyLimit!);

      const chunkPromises = chunk.map((signatureInfo) =>
        this.processSignature(signatureInfo).catch((error) => {
          logger.error(
            `Failed to process signature ${signatureInfo.signature}:`,
            error
          );
          return [];
        })
      );

      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const result of chunkResults) {
        if (result.status === "fulfilled") {
          allEvents.push(...result.value);
        }
      }

      if (i + concurrencyLimit! < signatures.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return allEvents;
  }

  private shouldStopAtSlot(signatures: any[]): boolean {
    return signatures.some((sig) => sig.slot && sig.slot <= this.STOP_AT_SLOT);
  }

  private logBatchProgress(
    batchNumber: number,
    signatures: any[],
    batchDuration: number,
    batchEventCount: number,
    totalStats: {
      processedSignatures: number;
      events: number;
      startTime: number;
    }
  ): void {
    if (this.debugStatements) {
      const batchSignaturesPerSecond = (
        (signatures.length / batchDuration) *
        1000
      ).toFixed(2);
      const overallDuration = Date.now() - totalStats.startTime;
      const overallSignaturesPerSecond = (
        (totalStats.processedSignatures / overallDuration) *
        1000
      ).toFixed(2);

      const memUsage = process.memoryUsage();
      const memInfo =
        `RSS ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, ` +
        `Heap ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`;

      logger.info(
        `Completed batch ${batchNumber} in ${batchDuration}ms with ${batchEventCount} events`
      );
      logger.info(
        `Batch: ${batchSignaturesPerSecond} sigs/sec | ` +
          `Overall: ${overallSignaturesPerSecond} sigs/sec | ` +
          `Total events: ${totalStats.events}`
      );
      logger.info(`Memory: ${memInfo}`);
    } else {
      const firstSlot = signatures[0]?.slot;
      const lastSlot = signatures[signatures.length - 1]?.slot;
      logger.info(`Batch ${batchNumber} (${firstSlot}-${lastSlot}) done`);
    }
  }

  private logFinalSummary(totalStats: {
    processedSignatures: number;
    events: number;
    startTime: number;
  }): void {
    const totalDuration = Date.now() - totalStats.startTime;
    const finalSignaturesPerSecond = (
      (totalStats.processedSignatures / totalDuration) *
      1000
    ).toFixed(2);
    const averageTimePerSignature = (
      totalDuration / totalStats.processedSignatures
    ).toFixed(2);
    const eventsPerSignature = (
      totalStats.events / totalStats.processedSignatures
    ).toFixed(4);

    logger.info(`
=== SIGNATURE-BASED INDEXING COMPLETE ===
Total signatures processed: ${totalStats.processedSignatures}
Total events found: ${totalStats.events}
Total time: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(
      2
    )} minutes)
Average signatures per second: ${finalSignaturesPerSecond}
Average time per signature: ${averageTimePerSignature}ms
Events per signature: ${eventsPerSignature}
    `);
  }

  private async updateSyncProgress(
    currentSlot: number,
    highestSlot?: number
  ): Promise<void> {
    try {
      await DB.EventsMeta.updateSyncProgress(
        this.config.autoFunAddress,
        this.config.networkId.toString(),
        currentSlot,
        highestSlot
      );
    } catch (error) {
      logger.error("Error updating sync progress:", error);
    }
  }

  public async runWithSignatures(): Promise<void> {
    try {
      const maxSignatures = this.config.maxSignatures || 500;

      const syncMeta = await DB.EventsMeta.getOrCreate(
        this.config.autoFunAddress,
        this.config.networkId.toString()
      );

      // Determine starting point and sync strategy
      let beforeSignature = this.config.beforeSignature;
      let isGenesisSync = false;
      let targetMinSlot = this.STOP_AT_SLOT;

      if (!syncMeta.doneGenesisSync) {
        // Genesis sync: from current to minBlock
        logger.info("Starting genesis sync (current → minBlock)");
        isGenesisSync = true;
      } else if (syncMeta.currentBlock < syncMeta.highestSyncedBlock) {
        // Fill gap: from currentBlock to highestSyncedBlock
        logger.info(
          `Filling gap sync (${syncMeta.currentBlock} → ${syncMeta.highestSyncedBlock})`
        );
        targetMinSlot = syncMeta.currentBlock;
      } else {
        // Normal sync: from highestSyncedBlock to latest
        logger.info(
          `Normal sync from block ${syncMeta.highestSyncedBlock} to latest`
        );
        targetMinSlot = 0;
      }

      const totalStats = {
        processedSignatures: 0,
        events: 0,
        startTime: Date.now(),
      };

      let batchNumber = 1;
      let hasMoreSignatures = true;

      logger.info(
        `Starting indexer for address: ${this.config.autoFunAddress}`
      );
      logger.info(`Network: ${this.config.networkId}`);
      logger.info(`Target min slot: ${targetMinSlot}`);

      while (hasMoreSignatures) {
        logger.info(`Fetching batch ${batchNumber} of signatures...`);

        const signatures = await this.getSignatures(beforeSignature);

        if (signatures.length === 0) {
          logger.info("No more signatures found");
          break;
        }

        // Check if we should stop based on target slot
        if (targetMinSlot > 0 && this.shouldStopAtSlot(signatures)) {
          const stoppedAtSlot = signatures.find(
            (sig) => sig.slot <= targetMinSlot
          )?.slot;
          logger.info(
            `Reached target slot ${stoppedAtSlot} (target: ${targetMinSlot}), stopping indexer`
          );
          break;
        }

        logger.info(
          `Processing batch ${batchNumber}: ${signatures.length} signatures ` +
            `(slots: ${signatures[0]?.slot} to ${
              signatures[signatures.length - 1]?.slot
            })`
        );

        const batchStartTime = Date.now();

        try {
          const allBatchEvents = await this.processSignaturesBatch(signatures);

          if (allBatchEvents.length > 0) {
            await this.saveBatchEvents(allBatchEvents);
          }

          // Update sync progress
          const currentSlot = signatures[signatures.length - 1]?.slot;
          const highestSlot = signatures[0]?.slot;

          await this.updateSyncProgress(currentSlot, highestSlot);

          const batchDuration = Date.now() - batchStartTime;
          totalStats.processedSignatures += signatures.length;
          totalStats.events += allBatchEvents.length;

          this.logBatchProgress(
            batchNumber,
            signatures,
            batchDuration,
            allBatchEvents.length,
            totalStats
          );

          if (batchNumber % 10 === 0 && global.gc) {
            global.gc();
            logger.info(`Forced garbage collection after batch ${batchNumber}`);
          }

          hasMoreSignatures = signatures.length >= maxSignatures;
          if (hasMoreSignatures) {
            beforeSignature = signatures[signatures.length - 1].signature;
          }

          batchNumber++;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error: any) {
          logger.error(
            `Error processing batch ${batchNumber}: ${error.message}`
          );
          break;
        }
      }

      // Mark genesis sync as complete if this was a genesis sync
      if (isGenesisSync) {
        await DB.EventsMeta.markGenesisComplete(
          this.config.autoFunAddress,
          this.config.networkId.toString()
        );
        logger.info("Genesis sync marked as complete");
      }

      this.logFinalSummary(totalStats);
    } catch (error) {
      logger.error("Error running signature-based indexer:", error);
    }
  }
}
