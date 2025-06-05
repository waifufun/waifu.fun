import logger from "@autofun/logger";
import type { DecodedInstruction } from "../../types";
import { SolanaInstructionDecoder } from "./instruction-decoder";
import { SolanaEventDecoder } from "./event-decoder";
import { SolanaAmountExtractor } from "./extract-amount";
import { SolanaLogDecoder } from "./log-decoder";

export class SolanaTransactionProcessor {
  constructor(
    private autoFunAddress: string,
    private debugStatements: boolean = false
  ) {}

  hasAutoFunProgram(accounts: any[]): boolean {
    return accounts.some(
      (account) => account.toBase58() === this.autoFunAddress
    );
  }

  processTransaction(
    transaction: any,
    blockTime: number,
    slot: number
  ): any[] {
    const events: any[] = [];
    
    const transactionData = transaction.transaction || transaction;
    const accounts = transactionData?.message?.staticAccountKeys;
    const signatures = transactionData?.signatures || transaction.signatures;

    if (!accounts || !signatures) {
      if (this.debugStatements) {
        logger.warn("Transaction missing required data structure");
      }
      return events;
    }

    if (!this.hasAutoFunProgram(accounts)) {
      return events;
    }

    const accountStrings = accounts.map((key: any) => key.toBase58());
    const compiledInstructions = transactionData?.message?.compiledInstructions;

    if (!compiledInstructions) {
      if (this.debugStatements) {
        logger.warn("Transaction missing compiled instructions");
      }
      return events;
    }

    // Process instructions
    for (const [instructionIndex, instruction] of compiledInstructions.entries()) {
      const programId = accountStrings[instruction.programIdIndex];

      if (programId !== this.autoFunAddress) continue;

      const instructionAccounts = instruction.accountKeyIndexes.map(
        (index: number) => accountStrings[index]
      );

      const decodedInstruction = SolanaInstructionDecoder.decodeAutofunInstruction(
        Buffer.from(instruction.data),
        instructionAccounts
      );

      if (decodedInstruction.type !== "unknown") {
        const eventData = this.createEventData(
          signatures[0],
          slot,
          blockTime,
          instructionIndex,
          decodedInstruction,
          transaction
        );
        events.push(eventData);
      }
    }

    // Process complete events from logs
    const logs = transaction.meta?.logMessages || [];
    for (const [logIndex, log] of logs.entries()) {
      if (log.startsWith('Program data: ')) {
        try {
          const dataString = log.replace('Program data: ', '');
          const eventData = Buffer.from(dataString, 'base64');
          
          const completeEvent = SolanaEventDecoder.decodeCompleteEvent(eventData, this.debugStatements);
          if (completeEvent) {
            const eventObj = {
              signature: signatures[0],
              slot,
              blockTime,
              eventType: "curveCompleted",
              contractAddress: completeEvent.mint,
              user: completeEvent.user,
              bondingCurve: completeEvent.bondingCurve,
              logIndex,
              programId: this.autoFunAddress,
              processed: true,
            };
            events.push(eventObj);
            
            if (this.debugStatements) {
              logger.info(`Found curve completion event for mint: ${completeEvent.mint}`);
            }
          }
        } catch (error) {
          // Ignore because not all program data logs are events
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
    decodedInstruction: DecodedInstruction,
    transaction?: any
  ): any {
    const baseEventData = {
      signature,
      slot,
      blockTime,
      eventType: decodedInstruction.type,
      contractAddress: decodedInstruction.mintAddress || decodedInstruction.tokenMint,
      creator: decodedInstruction.creator,
      user: decodedInstruction.user,
      instructionIndex,
      programId: this.autoFunAddress,
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
          virtualLamportReserves: instructionData.virtualLamportReserves?.toString(),
        };

      case "swap": {
        const tokenMint = decodedInstruction.tokenMint!;
        const userAddress = decodedInstruction.user!;
        const direction = instructionData.direction;

        const logs = transaction?.meta?.logMessages || [];

        if (logs.length === 0) {
          if (this.debugStatements) {
            logger.warn(`No logs found for swap instruction in transaction ${signature}`);
          }
          return baseEventData;
        }

        const swapData = SolanaLogDecoder.decodeSwapLog(logs, this.debugStatements);
        if (!swapData) {
          if (this.debugStatements) {
            logger.warn(`No swap data found in logs for transaction ${signature}`);
          }
          return baseEventData;
        }
        
        let amountGotten = {};
        if (transaction) {
          amountGotten = SolanaAmountExtractor.extractAmountGotten(
            transaction, tokenMint, userAddress, direction, this.debugStatements
          );
        }

        return {
          ...baseEventData,
          swapAmount: swapData.buyWith,
          direction: direction,
          minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
          deadline: instructionData.deadline?.toString(),
          amountGotten: swapData.sellWith,
        };
      }

      case "launchAndSwap": {
        const tokenMint = decodedInstruction.mintAddress!;
        const userAddress = decodedInstruction.creator!;

        const swapData = SolanaLogDecoder.decodeSwapLog(
          transaction?.meta?.logMessages || [],
          this.debugStatements
        );
        
        let amountGotten = {};
        if (transaction) {
          amountGotten = SolanaAmountExtractor.extractAmountGotten(
            transaction, tokenMint, userAddress, 0, this.debugStatements
          );
        }

        return {
          ...baseEventData,
          tokenName: instructionData.name,
          tokenSymbol: instructionData.symbol,
          tokenUri: instructionData.uri,
          decimals: instructionData.decimals,
          tokenSupply: instructionData.tokenSupply?.toString(),
          virtualLamportReserves: instructionData.virtualLamportReserves?.toString(),
          swapAmount: swapData ? swapData.buyWith : "0",
          minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
          deadline: instructionData.deadline?.toString(),
          amountGotten: swapData ? swapData.sellWith : "0",
        };
      }

      default:
        return baseEventData;
    }
  }
}