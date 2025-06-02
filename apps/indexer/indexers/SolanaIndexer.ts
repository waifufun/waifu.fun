import { SolanaRpcProvider } from "@autofun/rpc";
import type { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { instructions as IDLInstructions } from "../abi/autofun";
import DB from "@autofun/database";
import logger from "@autofun/logger";
import { PublicKey } from "@solana/web3.js";


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
	// biome-ignore lint/suspicious/noExplicitAny: allow
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

  private decodeCompleteEvent(eventData: Buffer): any {
    try {
      const discriminator = Array.from(eventData.slice(0, 8));
      // the complete event discriminator
      const expectedDiscriminator = [95, 114, 97, 156, 212, 46, 152, 8];
      
      if (!this.arraysEqual(discriminator, expectedDiscriminator)) {
        return null;
      }
  
      // After discriminator (8 bytes), we have:
      // user: 32 bytes (pubkey)
      // mint: 32 bytes (pubkey) 
      // bonding_curve: 32 bytes (pubkey)
      const userBytes = eventData.slice(8, 40);
      const mintBytes = eventData.slice(40, 72);
      const bondingCurveBytes = eventData.slice(72, 104);
  
      // Convert to base58 (standard Solana address format)
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
Total time: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(2)} minutes)
Average signatures per second: ${finalSignaturesPerSecond}
Average time per signature: ${averageTimePerSignature}ms
Events per signature: ${eventsPerSignature}
    `);
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

	public async runWithSignatures(): Promise<void> {
		try {
			const maxSignatures = this.config.maxSignatures || 500;

			const syncMeta = await DB.EventsMeta.getOrCreate(this.config.autoFunAddress, this.config.networkId.toString());

			// Determine starting point and sync strategy
			let beforeSignature = this.config.beforeSignature;
			let isGenesisSync = false;
			let targetMinSlot = this.STOP_AT_SLOT;

			if (!syncMeta.doneGenesisSync) {
				// Genesis sync: from current to minBlock
				logger.info("Starting genesis sync (current -> minBlock)");
				logger.info(`Resuming from slot: ${syncMeta.currentBlock || "latest"}`);
				isGenesisSync = true;

				// If we have processed events, start from the oldest one we've processed
				if (syncMeta.currentBlock > 0) {
					beforeSignature = await this.getLastProcessedSignature();
				}
			} else if (syncMeta.currentBlock < syncMeta.highestSyncedBlock) {
				// Fill gap: from currentBlock to highestSyncedBlock
				logger.info(`Filling gap sync (${syncMeta.currentBlock} → ${syncMeta.highestSyncedBlock})`);
				targetMinSlot = syncMeta.currentBlock;
				beforeSignature = await this.getLastProcessedSignature();
			} else {
				// Normal sync: from highestSyncedBlock to latest
				logger.info(`Normal sync from block ${syncMeta.highestSyncedBlock} to latest`);
				targetMinSlot = 0;
				// For normal sync, we want the newest processed event
				const newestEvent = await DB.Event.findOne(
					{ programId: this.config.autoFunAddress },
					{},
					{ sort: { slot: -1 } }, // Sort descending to get highest/newest
				);
				if (newestEvent) {
					beforeSignature = newestEvent.signature;
				}
			}

			const totalStats = {
				processedSignatures: 0,
				events: 0,
				startTime: Date.now(),
			};

			let batchNumber = 1;
			let hasMoreSignatures = true;

			logger.info(`Starting indexer for address: ${this.config.autoFunAddress}`);
			logger.info(`Network: ${this.config.networkId}`);
			logger.info(`Target min slot: ${targetMinSlot}`);
			logger.info(`Starting from signature: ${beforeSignature || "latest"}`);

			while (hasMoreSignatures) {
				logger.info(`Fetching batch ${batchNumber} of signatures...`);

				const signatures = await this.getSignatures(beforeSignature);

				if (signatures.length === 0) {
					logger.info("No more signatures found");
					break;
				}

				// Check if we should stop based on target slot
				if (targetMinSlot > 0 && this.shouldStopAtSlot(signatures)) {
					const stoppedAtSlot = signatures.find((sig) => sig.slot <= targetMinSlot)?.slot;
					logger.info(`Reached target slot ${stoppedAtSlot} (target: ${targetMinSlot}), stopping indexer`);
					break;
				}

				logger.info(
					`Processing batch ${batchNumber}: ${signatures.length} signatures ` +
						`(slots: ${signatures[0]?.slot} to ${signatures[signatures.length - 1]?.slot})`,
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

					this.logBatchProgress(batchNumber, signatures, batchDuration, allBatchEvents.length, totalStats);

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
					// biome-ignore lint/suspicious/noExplicitAny: allow
				} catch (error: any) {
					logger.error(`Error processing batch ${batchNumber}: ${error.message}`);
					break;
				}
			}

			// Mark genesis sync as complete if this was a genesis sync
			if (isGenesisSync) {
				await DB.EventsMeta.markGenesisComplete(this.config.autoFunAddress, this.config.networkId.toString());
				logger.info("Genesis sync marked as complete");
			}

			this.logFinalSummary(totalStats);
		} catch (error) {
			logger.error("Error running signature-based indexer:", error);
		}
	}
}
