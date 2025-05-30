import { SolanaRpcProvider } from "@autofun/rpc";
import { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";
import DB from "@autofun/database";
import logger from "@autofun/logger";

export interface SolanaIndexerConfig {
  networkId: SolanaNetworkIds;
  autoFunAddress: SolanaAddressLike;
  batchSize?: number;
  concurrencyLimit?: number;
  maxSignatures?: number;
  beforeSignature?: string;
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
      concurrencyLimit: 30,
      beforeSignature: "336725834",
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
        // await DB.Event.insertManyOrUpdate(chunk);
        totalSaved += chunk.length;
      }

      logger.info(`Batch saved ${totalSaved} events to database`);
    } catch (error: any) {
      throw new Error(
        `Error saving batch events to database: ${error.message}`
      );
    }
  }

  private async getSignatures(beforeSignature?: string): Promise<any[]> {
    try {
      const signatures = await this.rpc.getSignaturesForAddress(
        this.config.autoFunAddress,
        {
          limit: this.config.maxSignatures || 1000,
          before: beforeSignature,
        }
      );

      return signatures;
    } catch (error) {
      logger.error(`Error fetching signatures:`, error);
      return [];
    }
  }

  private async processSignature(signatureInfo: any): Promise<any[]> {
    const startTime = Date.now();

    try {
      const transaction = await this.rpc.getTransaction(
        signatureInfo.signature
      );

      if (!transaction || !transaction.meta || transaction.meta.err) {
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

      if (events.length > 0) {
        logger.info(
          `Signature ${signatureInfo.signature}: ${events.length} events (slot: ${transaction.slot}, ${downloadTime}ms download, ${processTime}ms process)`
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
    const concurrencyLimit = this.config.concurrencyLimit!;
    const allEvents: any[] = [];

    // Process in smaller concurrent chunks
    for (let i = 0; i < signatures.length; i += concurrencyLimit) {
      const chunk = signatures.slice(i, i + concurrencyLimit);

      const chunkPromises = chunk.map(async (signatureInfo) => {
        try {
          return await this.processSignature(signatureInfo);
        } catch (error) {
          logger.error(
            `Failed to process signature ${signatureInfo.signature}:`,
            error
          );
          return [];
        }
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const result of chunkResults) {
        if (result.status === "fulfilled") {
          allEvents.push(...result.value);
        }
      }

      // Delay between chunks to avoid overwhelming RPC
      if (i + concurrencyLimit < signatures.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return allEvents;
  }

  public async runWithSignatures(): Promise<void> {
    try {
      const maxSignatures = this.config.maxSignatures || 1000;
      const batchSize = this.config.concurrencyLimit!;

      const overallStartTime = Date.now();
      let totalProcessedSignatures = 0;
      let totalEvents = 0;
      let beforeSignature = this.config.beforeSignature;

      logger.info(
        `Starting signature-based indexer for address: ${this.config.autoFunAddress}`
      );

      let batchNumber = 1;
      let hasMoreSignatures = true;

      while (hasMoreSignatures) {
        logger.info(`Fetching batch ${batchNumber} of signatures...`);

        const signatures = await this.getSignatures(beforeSignature);

        if (signatures.length === 0) {
          logger.info("No more signatures found");
          break;
        }

        logger.info(
          `Processing batch ${batchNumber}: ${signatures.length} signatures`
        );

        const batchStartTime = Date.now();

        try {
          const allBatchEvents = await this.processSignaturesBatch(signatures);

          // Save all events from the batch at once
          if (allBatchEvents.length > 0) {
            await this.saveBatchEvents(allBatchEvents);
          }

          const batchDuration = Date.now() - batchStartTime;
          const batchSignaturesPerSecond = (
            (signatures.length / batchDuration) *
            1000
          ).toFixed(2);

          totalProcessedSignatures += signatures.length;
          totalEvents += allBatchEvents.length;

          const overallDuration = Date.now() - overallStartTime;
          const overallSignaturesPerSecond = (
            (totalProcessedSignatures / overallDuration) *
            1000
          ).toFixed(2);

          logger.info(
            `Completed batch ${batchNumber} in ${batchDuration}ms with ${allBatchEvents.length} events`
          );
          logger.info(
            `Batch: ${batchSignaturesPerSecond} sigs/sec | Overall: ${overallSignaturesPerSecond} sigs/sec | Total events: ${totalEvents}`
          );

          // Set up for next batch
          if (signatures.length < maxSignatures) {
            hasMoreSignatures = false;
          } else {
            beforeSignature = signatures[signatures.length - 1].signature;
          }

          batchNumber++;
        } catch (error: any) {
          logger.error(
            `Error processing batch ${batchNumber}: ${error.message}`
          );
          break;
        }
      }

      // Final performance summary
      const totalDuration = Date.now() - overallStartTime;
      const finalSignaturesPerSecond = (
        (totalProcessedSignatures / totalDuration) *
        1000
      ).toFixed(2);
      const averageTimePerSignature = (
        totalDuration / totalProcessedSignatures
      ).toFixed(2);

      logger.info(`
=== SIGNATURE-BASED INDEXING COMPLETE ===
Total signatures processed: ${totalProcessedSignatures}
Total events found: ${totalEvents}
Total time: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(
        2
      )} minutes)
Average signatures per second: ${finalSignaturesPerSecond}
Average time per signature: ${averageTimePerSignature}ms
Events per signature: ${(totalEvents / totalProcessedSignatures).toFixed(4)}
      `);
    } catch (error) {
      logger.error("Error running signature-based indexer:", error);
    }
  }
}
