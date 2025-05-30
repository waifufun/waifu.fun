import { SolanaRpcProvider } from "@autofun/rpc";
import { SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";
import DB from "@autofun/database";
import logger from "@autofun/logger";

export interface SolanaIndexerConfig {
  networkId: SolanaNetworkIds;
  autoFunAddress: string;
  startSlot?: number;
  endSlot?: number;
  batchSize?: number;
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
      batchSize: 10,
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
      logger.info("Matched launch instruction");
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
      logger.info("Matched swap instruction");
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
      logger.info("Matched launchAndSwap instruction");
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

  private async processTransaction(
    transaction: any,
    blockTime: number,
    slot: number
  ): Promise<any[]> {
    const events: any[] = [];
    const accounts = transaction.transaction.message.staticAccountKeys.map(
      (key: any) => key.toBase58()
    );

    if (accounts.includes(this.config.autoFunAddress)) {
      logger.info(
        `\n=== Transaction ${transaction.transaction.signatures[0]} ===`
      );
      logger.info("Fee payer:", accounts[0]);

      for (const [
        instructionIndex,
        instruction,
      ] of transaction.transaction.message.compiledInstructions.entries()) {
        const programId =
          transaction.transaction.message.staticAccountKeys[
            instruction.programIdIndex
          ].toBase58();

        if (programId === this.config.autoFunAddress) {
          logger.info("\n--- AutoFun Instruction ---");

          const instructionAccounts = instruction.accountKeyIndexes.map(
            (index: number) => accounts[index]
          );

          const decodedInstruction = this.decodeAutofunInstruction(
            Buffer.from(instruction.data),
            instructionAccounts
          );

          logger.info("Decoded instruction type:", decodedInstruction.type);

          if (decodedInstruction.type !== "unknown") {
            const eventData = this.createEventData(
              transaction.transaction.signatures[0],
              slot,
              blockTime,
              instructionIndex,
              decodedInstruction
            );
            events.push(eventData);

            this.logInstructionDetails(decodedInstruction);
          }
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
      /* 
        Here we save the events to the database in a single batch operation.
        This is important for performance, especially when processing large numbers of events.
        Another reason is to have data integrity, as we want to ensure that all events in a batch are saved together.
        If it fails, we can handle the error and retry the batch, preventing partial saves.
      */
      const savedEvents = await DB.Event.insertMany(events, { ordered: false });
      logger.info(`Batch saved ${savedEvents.length} events to database`);
    } catch (error) {
      throw new Error(
        `Error saving batch events to database: ${error.message}`
      );
    }
  }

  private logInstructionDetails(decodedInstruction: DecodedInstruction): void {
    if (decodedInstruction.type === "launch") {
      logger.info("=== TOKEN LAUNCH ===");
      console.log("decoded data: ", decodedInstruction.data?.data);
    } else if (decodedInstruction.type === "swap") {
      logger.info("=== TOKEN SWAP ===");
      console.info("decoded data: ", decodedInstruction.data?.data);
    } else if (decodedInstruction.type === "launchAndSwap") {
      logger.info("=== LAUNCH AND SWAP ===");
      console.info("decoded data: ", decodedInstruction.data?.data);
    }
  }

  public async processBlock(slot: number): Promise<any[]> {
    const blockEvents: any[] = [];

    try {
      const block = await this.rpc.getBlock(slot);
      if (!block) {
        logger.error(`No block found for slot ${slot}`);
        return blockEvents;
      }

      logger.info(
        `Processing block ${slot} with ${block.transactions.length} transactions`
      );

      for (const transaction of block.transactions) {
        const transactionEvents = await this.processTransaction(
          transaction,
          block.blockTime || 0,
          slot
        );
        blockEvents.push(...transactionEvents);
      }
    } catch (error) {
      logger.error(`Error processing block ${slot}:`, error);
    }

    return blockEvents;
  }

  public async run(): Promise<void> {
    try {
      // If specific slots are provided, process them
      if (this.config.startSlot !== undefined) {
        const endSlot = this.config.endSlot || this.config.startSlot;
        const slots: number[] = [];

        for (let slot = this.config.startSlot; slot <= endSlot; slot++) {
          slots.push(slot);
        }

        // Process slots in batches
        for (let i = 0; i < slots.length; i += this.config.batchSize!) {
          const batch = slots.slice(i, i + this.config.batchSize!);

          logger.info(
            `Processing batch of ${batch.length} slots: ${batch[0]} - ${
              batch[batch.length - 1]
            }`
          );

          const blockPromises = batch.map((slot) => this.processBlock(slot));
          const batchResults = await Promise.all(blockPromises);

          const allBatchEvents = batchResults.flat();

          // Save all events from the batch at once
          try {
            await this.saveBatchEvents(allBatchEvents);
          } catch (error) {
            logger.error(
              `Error saving batch events, retrying batch: ${error.message}`
            );
            i -= this.config.batchSize!; // rewind the iterator
          }

          logger.info(
            `Completed batch of ${batch.length} slots with ${allBatchEvents.length} events`
          );
        }
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
