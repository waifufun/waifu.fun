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
  ): Promise<void> {
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
            await this.saveEvent(
              transaction.transaction.signatures[0],
              slot,
              blockTime,
              instructionIndex,
              decodedInstruction
            );

            this.logInstructionDetails(decodedInstruction);
          }
        }
      }
    }
  }

  private async saveEvent(
    signature: string,
    slot: number,
    blockTime: number,
    instructionIndex: number,
    decodedInstruction: DecodedInstruction
  ): Promise<void> {
    try {
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

      // Add type-specific data
      if (
        decodedInstruction.type === "launch" &&
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

      const event = await DB.Event.createOrUpdate(eventData);
      logger.info(`Event saved: ${event._id}`);
    } catch (error) {
      logger.error("Error saving event:", error);
    }
  }

  private logInstructionDetails(decodedInstruction: DecodedInstruction): void {
    if (decodedInstruction.type === "launch") {
      logger.info("=== TOKEN LAUNCH ===");
      logger.info("Mint Address:", decodedInstruction.mintAddress);
      logger.info("Creator:", decodedInstruction.creator);
      logger.info("Token Details:");
      logger.info("  Name:", decodedInstruction.data?.data?.name);
      logger.info("  Symbol:", decodedInstruction.data?.data?.symbol);
      logger.info("  URI:", decodedInstruction.data?.data?.uri);
      logger.info("  Decimals:", decodedInstruction.data?.data?.decimals);
      logger.info(
        "  Token Supply:",
        decodedInstruction.data?.data?.tokenSupply?.toString()
      );
      logger.info(
        "  Virtual Lamport Reserves:",
        decodedInstruction.data?.data?.virtualLamportReserves?.toString()
      );
    } else if (decodedInstruction.type === "swap") {
      logger.info("=== TOKEN SWAP ===");
      logger.info("Token Mint:", decodedInstruction.tokenMint);
      logger.info("User:", decodedInstruction.user);
      logger.info("Swap Details:");
      logger.info(
        "  Amount:",
        decodedInstruction.data?.data?.amount?.toString()
      );
      logger.info(
        "  Direction:",
        decodedInstruction.data?.data?.direction === 0 ? "Buy" : "Sell"
      );
      logger.info(
        "  Minimum Receive:",
        decodedInstruction.data?.data?.minimumReceiveAmount?.toString()
      );
      logger.info(
        "  Deadline:",
        decodedInstruction.data?.data?.deadline?.toString()
      );
    } else if (decodedInstruction.type === "launchAndSwap") {
      logger.info("=== LAUNCH AND SWAP ===");
      logger.info("Mint Address:", decodedInstruction.mintAddress);
      logger.info("Creator:", decodedInstruction.creator);
      logger.info("Token Details:");
      logger.info("  Name:", decodedInstruction.data?.data?.name);
      logger.info("  Symbol:", decodedInstruction.data?.data?.symbol);
      logger.info("  URI:", decodedInstruction.data?.data?.uri);
      logger.info("  Decimals:", decodedInstruction.data?.data?.decimals);
      logger.info(
        "  Token Supply:",
        decodedInstruction.data?.data?.tokenSupply?.toString()
      );
      logger.info(
        "  Virtual Lamport Reserves:",
        decodedInstruction.data?.data?.virtualLamportReserves?.toString()
      );
      logger.info("Swap Details:");
      logger.info(
        "  Swap Amount:",
        decodedInstruction.data?.data?.swapAmount?.toString()
      );
      logger.info(
        "  Minimum Receive:",
        decodedInstruction.data?.data?.minimumReceiveAmount?.toString()
      );
      logger.info(
        "  Deadline:",
        decodedInstruction.data?.data?.deadline?.toString()
      );
    }
  }

  public async processBlock(slot: number): Promise<void> {
    try {
      const block = await this.rpc.getBlock(slot);
      if (!block) {
        logger.error(`No block found for slot ${slot}`);
        return;
      }

      logger.info(
        `Processing block ${slot} with ${block.transactions.length} transactions`
      );

      for (const transaction of block.transactions) {
        await this.processTransaction(transaction, block.blockTime || 0, slot);
      }
    } catch (error) {
      logger.error(`Error processing block ${slot}:`, error);
    }
  }

  public async run(): Promise<void> {
    try {
      // If specific slots are provided, process them
      if (this.config.startSlot !== undefined) {
        const endSlot = this.config.endSlot || this.config.startSlot;

        for (let slot = this.config.startSlot; slot <= endSlot; slot++) {
          await this.processBlock(slot);
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
