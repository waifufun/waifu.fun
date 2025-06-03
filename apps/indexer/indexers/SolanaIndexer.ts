import { SolanaRpcProvider } from "@autofun/rpc";
import type { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";
import DB from "@autofun/database";
import logger from "@autofun/logger";
import { PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
import type {
  SolanaIndexerConfig,
  DecodedInstruction
} from "../types";


dotenv.config();

export class SolanaIndexer {
  private rpc: SolanaRpcProvider;
  private config: SolanaIndexerConfig;
  private debugStatements = false;
  private readonly STOP_AT_SLOT: number;

  constructor(config: SolanaIndexerConfig) {
    this.config = {
      concurrencyLimit: 2,
      maxSignatures: 500,
      minBlock: 322725834, // Default minimum block
      ...config,
    };
    this.rpc = new SolanaRpcProvider(this.config.networkId);
    this.debugStatements = config.debugStatements || false;
    this.STOP_AT_SLOT = this.config.minBlock!;
  }

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
        tokenMint: accounts[5],
        user: accounts[8],
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
  
  private startListening = async () => {
    logger.info("Starting real-time listening for new transactions...");
    
    let isProcessing = false;
    let lastCheckTime = 0;
    const MIN_CHECK_INTERVAL = 2000;
    
    try {
      const subscriptionId = await this.rpc.subscribeSlot(async (slotInfo) => {
        if (this.debugStatements) {
          logger.info(`New slot: ${slotInfo.slot}, Parent: ${slotInfo.parent}, Root: ${slotInfo.root}`);
        }
        
        const now = Date.now();
        if (isProcessing || (now - lastCheckTime) < MIN_CHECK_INTERVAL) {
          return;
        }
        
        isProcessing = true;
        lastCheckTime = now;
        
        try {
          await this.runWithSignatures();
        } catch (error) {
          logger.error("Error processing new slot:", error);
        } finally {
          isProcessing = false;
        }
      });
  
      this.rpc.on('slot:change', (slotInfo) => {
        if (this.debugStatements) {
          logger.debug('Slot change event:', slotInfo);
        }
      });
  
      this.rpc.on('websocket:reconnected', () => {
        logger.info('WebSocket reconnected, resuming listening...');
      });
  
      this.rpc.on('websocket:error', (error) => {
        logger.error('WebSocket error:', error);
      });
  
      logger.info(`Real-time listening started with subscription ID: ${subscriptionId}`);
      logger.info(`Active subscriptions: ${this.rpc.getActiveSubscriptionCount()}`);
  
      process.on('SIGINT', () => {
        logger.info('Shutting down real-time listener...');
        this.rpc.destroy();
        process.exit(0);
      });
  
      process.on('SIGTERM', () => {
        logger.info('Shutting down real-time listener...');
        this.rpc.destroy();
        process.exit(0);
      });
  
    } catch (error) {
      logger.error("Error setting up real-time listener:", error);
      throw error;
    }
  }

  private decodeCompleteEvent(eventData: Buffer): any {
    try {
      const discriminator = Array.from(eventData.slice(0, 8));
      const expectedDiscriminator = [95, 114, 97, 156, 212, 46, 152, 8];
      
      if (!this.arraysEqual(discriminator, expectedDiscriminator)) {
        return null;
      }
  
      // After discriminator (first 8 bytes), we have:
      // user: 32 bytes (pubkey)
      // mint: 32 bytes (pubkey) 
      // bonding_curve: 32 bytes (pubkey)
      const userBytes = eventData.slice(8, 40);
      const mintBytes = eventData.slice(40, 72);
      const bondingCurveBytes = eventData.slice(72, 104);
  
      const user = new PublicKey(userBytes).toBase58();
      const mint = new PublicKey(mintBytes).toBase58();
      const bondingCurve = new PublicKey(bondingCurveBytes).toBase58();
  
      return {
        user,
        mint,
        bondingCurve,
      };
    } catch (error) {
      if (this.debugStatements) {
        logger.error("Error decoding complete event:", error);
      }
      return null;
    }
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

    // Complete event processing
    const logs = transaction.meta?.logMessages || [];
    for (const [logIndex, log] of logs.entries()) {
      if (log.startsWith('Program data: ')) {
        try {
          const dataString = log.replace('Program data: ', '');
          const eventData = Buffer.from(dataString, 'base64');
          
          const completeEvent = this.decodeCompleteEvent(eventData);
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
              programId: this.config.autoFunAddress,
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

  private extractAmountGotten(
    transaction: any, 
    tokenMint: string, 
    userAddress: string, 
    direction: number
  ): { amountGotten?: string } {
    try {
      const preTokenBalances = transaction.meta?.preTokenBalances || [];
      const postTokenBalances = transaction.meta?.postTokenBalances || [];
      const preBalances = transaction.meta?.preBalances || [];
      const postBalances = transaction.meta?.postBalances || [];
      const fee = transaction.meta?.fee || 0;
      const accountKeys = transaction.transaction?.message?.staticAccountKeys || 
                          transaction.message?.staticAccountKeys || [];

      if (direction === 0) {
        // Direction 0: User is buying tokens (NATIVE TOKEN -> Token)
        const preTokenBalance = preTokenBalances.find((balance: any) => {
          const isCorrectMint = balance.mint === tokenMint;
          const isCorrectOwner = balance.owner === userAddress;
          return isCorrectMint && isCorrectOwner;
        });
        
        const postTokenBalance = postTokenBalances.find((balance: any) => {
          const isCorrectMint = balance.mint === tokenMint;
          const isCorrectOwner = balance.owner === userAddress;
          return isCorrectMint && isCorrectOwner;
        });

        // Handle case where user didn't have the token before (new token account)
        const preAmount = BigInt(preTokenBalance?.uiTokenAmount?.amount || '0');
        const postAmount = BigInt(postTokenBalance?.uiTokenAmount?.amount || '0');
        const tokensReceived = postAmount - preAmount;
        
        if (tokensReceived > 0n) {
          return { amountGotten: tokensReceived.toString() };
        }

        // Look for any post-balance for user if no pre-balance exists
        if (!preTokenBalance && postTokenBalance) {
          const tokens = BigInt(postTokenBalance.uiTokenAmount?.amount || '0');
          if (tokens > 0n) {
            return { amountGotten: tokens.toString() };
          }
        }

      } else {
        // Direction 1: User is selling tokens (Token -> NATIVE TOKEN)
        const userIndex = accountKeys.findIndex((key: any) => 
          key.toBase58() === userAddress
        );

        if (userIndex !== -1 && preBalances[userIndex] !== undefined && postBalances[userIndex] !== undefined) {
          const preBalance = BigInt(preBalances[userIndex]);
          const postBalance = BigInt(postBalances[userIndex]);
          
          const solChange = postBalance - preBalance;
          
          let solReceived = solChange;
          
          // If the user paid the transaction fee, add it back to get the actual amount received
          if (userIndex === 0) {
            solReceived = solChange + BigInt(fee);
          }
          
          if (solReceived > 0n) {
            return { amountGotten: solReceived.toString() };
          }
        }
      }
      return {};
    } catch (error) {
      if (this.debugStatements) {
        logger.error("Error extracting amount gotten:", error);
      }
      return {};
    }
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

      case "swap": {
        const tokenMint = decodedInstruction.tokenMint!;
        const userAddress = decodedInstruction.user!;
        const direction = instructionData.direction;
        
        let amountGotten = {};
        if (transaction) {
          amountGotten = this.extractAmountGotten(
            transaction, 
            tokenMint, 
            userAddress, 
            direction
          );
        }

        return {
          ...baseEventData,
          swapAmount: instructionData.amount?.toString(),
          direction: direction,
          minimumReceiveAmount: instructionData.minimumReceiveAmount?.toString(),
          deadline: instructionData.deadline?.toString(),
          ...amountGotten,
        };
      }

      case "launchAndSwap": {
        const tokenMint = decodedInstruction.mintAddress!;
        const userAddress = decodedInstruction.creator!;
        
        let amountGotten = {};
        if (transaction) {
          amountGotten = this.extractAmountGotten(
            transaction, 
            tokenMint, 
            userAddress, 
            0
          );
        }

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
          ...amountGotten,
        };
      }

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
      const signatureExists = await DB.Event.exists({
        signature: signatureInfo.signature,
        programId: this.config.autoFunAddress,
      });
      if (signatureExists) {
        if (this.debugStatements) {
          logger.info(
            `Signature ${signatureInfo.signature} already processed, skipping`
          );
        }
        return [];
      }


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
      console.error(error);
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
  }, showLogs: boolean = false): void {
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

    if (showLogs) {
      logger.info(`
        === SIGNATURE-BASED INDEXING COMPLETE ===
        Total signatures processed: ${totalStats.processedSignatures}
        Total events found: ${totalStats.events}
        Total time: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(2)} minutes)
        Average signatures per second: ${finalSignaturesPerSecond}
        Average time per signature: ${isFinite(Number(averageTimePerSignature)) ? averageTimePerSignature : "N/A"}
        Events per signature: ${isNaN(Number(eventsPerSignature)) ? "N/A" : eventsPerSignature}
            `);
    }
	}

	private async updateSyncProgress(currentSlot: number, highestSlot?: number): Promise<void> {
		try {
			await DB.EventsMeta.updateSyncProgress(
				this.config.autoFunAddress,
				this.config.networkId.toString(),
				currentSlot,
				highestSlot,
			);
		} catch (error) {
			logger.error("Error updating sync progress:", error);
		}
	}

	private async getLastProcessedSignature(): Promise<string | undefined> {
		try {
			// Find the event with the lowest slot (oldest) that we've processed
			const lastProcessedEvent = await DB.Event.findOne(
				{ programId: this.config.autoFunAddress },
				{},
				{ sort: { slot: 1 } },
			);

			if (lastProcessedEvent) {
				logger.info(
					`Found last processed signature ${lastProcessedEvent.signature} at slot ${lastProcessedEvent.slot}`,
				);
				return lastProcessedEvent.signature;
			}

			return undefined;
		} catch (error) {
			logger.error("Error finding last processed signature:", error);
			return undefined;
		}
	}

  public async runWithRealTimeSync(): Promise<void> {
    try {
      logger.info("=== STEP 1: ENSURING FULL SYNC ===");
      await this.runWithSignatures(true); // This handles genesis sync and gap filling

      logger.info("=== STEP 2: FINAL GAP CHECK ===");
      await this.runWithSignatures(true); // Final check to ensure no gaps

      // Start real-time listening
      logger.info("=== STEP 3: STARTING REAL-TIME LISTENING ===");
      await this.startListening();
      
      // Keep the process alive
      logger.info("Real-time indexer is now running. Press Ctrl+C to stop.");
      
    } catch (error) {
      logger.error("Error in real-time sync:", error);
      throw error;
    }
  }

  private async runWithSignatures(showLogs: boolean = false): Promise<void> {
    try {
      const maxSignatures = this.config.maxSignatures || 500;
  
      const syncMeta = await DB.EventsMeta.getOrCreate(this.config.autoFunAddress, this.config.networkId.toString());
  
      let beforeSignature = this.config.beforeSignature;
      let stopAtSignature: string | undefined;
      let isGenesisSync = false;
      let targetMinSlot = this.STOP_AT_SLOT;
  
      if (!syncMeta.doneGenesisSync) {
        // Genesis sync: from current to minBlock
        if (showLogs) {
          logger.info(`Genesis sync from current block to minBlock: ${this.STOP_AT_SLOT}`);
        }
        isGenesisSync = true;
  
        if (syncMeta.currentBlock > 0) {
          beforeSignature = await this.getLastProcessedSignature();
        }
      } else {
        // Normal sync: from latest until newest DB event
        if (showLogs) {
          logger.info(`Normal sync from latest to newest DB event`);
        }
        beforeSignature = undefined;
        
        const newestEvent = await DB.Event.findOne(
          { programId: this.config.autoFunAddress },
          {},
          { sort: { slot: -1 } },
        );
        
        if (newestEvent) {
          stopAtSignature = newestEvent.signature;
          targetMinSlot = newestEvent.slot;
          if (showLogs) {
            logger.info(`Will stop when reaching DB signature: ${stopAtSignature}`);
          }
        } else {
          if (showLogs) {
            logger.info("No existing events in DB, will process recent signatures");
          }
        }
      }
  
      const totalStats = {
        processedSignatures: 0,
        events: 0,
        startTime: Date.now(),
      };
  
      let batchNumber = 1;
      let hasMoreSignatures = true;

      if (showLogs) {
        logger.info(`Starting indexer for address: ${this.config.autoFunAddress}`);
        logger.info(`Network: ${this.config.networkId}`);
        logger.info(`Genesis sync: ${isGenesisSync}`);
        logger.info(`Target min slot: ${targetMinSlot}`);
        logger.info(`Starting from signature: ${beforeSignature || "latest"}`);
        logger.info(`Stop at signature: ${stopAtSignature || "none"}`);  
      }
      while (hasMoreSignatures) {
        if (showLogs) {
          logger.info(`Fetching batch ${batchNumber} of signatures...`);
        }
  
        const signatures = await this.getSignatures(beforeSignature);
  
        if (signatures.length === 0) {
          if (showLogs) {
            logger.info("No more signatures found");
          }
          break;
        }
  
        // For genesis sync: Check if we should stop based on target slot
        if (isGenesisSync && targetMinSlot > 0 && this.shouldStopAtSlot(signatures)) {
          const stoppedAtSlot = signatures.find((sig) => sig.slot <= targetMinSlot)?.slot;
          if (showLogs) {
            logger.info(`Reached target slot ${stoppedAtSlot} (target: ${targetMinSlot}), stopping indexer`);
          }
          break;
        }
  
        // For normal sync: Check if we've reached our stop signature
        if (!isGenesisSync && stopAtSignature) {
          const stopIndex = signatures.findIndex(sig => sig.signature === stopAtSignature);
          if (stopIndex !== -1) {
            if (stopIndex === 0) {
              if (showLogs) {
                logger.info("Already up to date - newest signature found at start of batch");
              }
              break;
            }
            signatures.splice(stopIndex); // Remove signatures from stopIndex onwards
            hasMoreSignatures = false; // Last batch
            if (showLogs) {
              logger.info(`Found stop signature at index ${stopIndex}, processing ${signatures.length} new signatures`);
            }
          }
        }

        if (showLogs) {
          logger.info(
            `Processing batch ${batchNumber}: ${signatures.length} signatures ` +
              `(slots: ${signatures[0]?.slot} to ${signatures[signatures.length - 1]?.slot})`,
          );
        }
  
        const batchStartTime = Date.now();
  
        try {
          const allBatchEvents = await this.processSignaturesBatch(signatures);
  
          if (allBatchEvents.length > 0) {
            await this.saveBatchEvents(allBatchEvents);
          }
  
          const currentSlot = signatures[signatures.length - 1]?.slot;
          const highestSlot = signatures[0]?.slot;
  
          await this.updateSyncProgress(currentSlot, highestSlot);
  
          const batchDuration = Date.now() - batchStartTime;
          totalStats.processedSignatures += signatures.length;
          totalStats.events += allBatchEvents.length;
  
          this.logBatchProgress(batchNumber, signatures, batchDuration, allBatchEvents.length, totalStats);
  
          if (batchNumber % 10 === 0 && global.gc) {
            global.gc();
            logger.info(`Forced garbage collection after batch ${batchNumber}`);
          }
  
          // For genesis sync: continue if we got a full batch
          // For normal sync: hasMoreSignatures was already set above when we found stopSignature
          if (isGenesisSync) {
            hasMoreSignatures = signatures.length >= maxSignatures;
            if (hasMoreSignatures) {
              beforeSignature = signatures[signatures.length - 1].signature;
            }
          } else {
            if (hasMoreSignatures && signatures.length >= maxSignatures) {
              beforeSignature = signatures[signatures.length - 1].signature;
            } else if (!stopAtSignature) {
              hasMoreSignatures = false;
            }
          }
  
          batchNumber++;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error: any) {
          logger.error(`Error processing batch ${batchNumber}: ${error.message}`);
          break;
        }
      }
  
      if (isGenesisSync) {
        await DB.EventsMeta.markGenesisComplete(this.config.autoFunAddress, this.config.networkId.toString());
        logger.info("Genesis sync marked as complete");
      }
  
      this.logFinalSummary(totalStats, showLogs);
    } catch (error) {
      logger.error("Error running signature-based indexer:", error);
    }
  }
}
