import DB from "@waifufun/database";
import logger from "@waifufun/logger";
import { SolanaRpcProvider } from "@waifufun/rpc";
import type { SolanaIndexerConfig } from "../types";
import type { ProcessingStats } from "../types";
import { SolanaTransactionProcessor } from "../utils/solana/tx-processor";
import { BaseIndexer } from "./base-indexer";

export class SolanaIndexer extends BaseIndexer {
	private rpc: SolanaRpcProvider;
	private config: SolanaIndexerConfig;
	private readonly STOP_AT_SLOT: number;
	private processors: SolanaTransactionProcessor[];

	constructor(config: SolanaIndexerConfig) {
		super();

		this.config = {
			concurrencyLimit: 3,
			maxSignatures: 500,
			minBlock: process.env.NETWORK === "devnet" ? 388699253 : 322725834,
			...config,
		};

		this.rpc = new SolanaRpcProvider(this.config.networkId);
		this.debugStatements = config.debugStatements || false;
		this.STOP_AT_SLOT = this.config.minBlock!;
		this.processors = [
			new SolanaTransactionProcessor(
				this.config.autoFunAddress,
				this.debugStatements,
				this.config.version,
				this.config.maxBlock,
			),
		];
	}

	protected async resetConnections(): Promise<void> {
		try {
			logger.info("Resetting Solana connections...");

			if (this.rpc) {
				this.rpc.destroy();
			}

			await new Promise((resolve) => setTimeout(resolve, 2000));

			this.rpc = new SolanaRpcProvider(this.config.networkId);
			await this.resetDatabaseConnection();

			logger.info("Solana connections reset successfully");
		} catch (error) {
			logger.error({ err: error }, "Failed to reset Solana connections:");
			throw error;
		}
	}

	protected async cleanup(): Promise<void> {
		if (this.rpc) {
			this.rpc.destroy();
		}
	}

	protected async performHealthCheck(): Promise<void> {
		try {
			await this.rpc.getSlot();
			await DB.Event.findOne({}).limit(1);

			this.lastSuccessfulOperation = Date.now();
			this.retryAttempts = 0;

			logger.info("Solana health check passed");
		} catch (error) {
			logger.error({ err: error }, "Solana health check failed:");
			throw error;
		}
	}

	private async resetDatabaseConnection(): Promise<void> {
		try {
			await DB.Event.findOne({}).limit(1);
			logger.info("Database connection verified");
		} catch (error) {
			logger.error({ err: error }, "Database connection failed:");
			throw error;
		}
	}

	private startHealthCheck(): void {
		this.healthCheckInterval = setInterval(async () => {
			try {
				const now = Date.now();
				const timeSinceLastSuccess = now - this.lastSuccessfulOperation;

				if (timeSinceLastSuccess > 300000) {
					logger.warn("No successful operations in 5 minutes, checking health...");
					await this.performHealthCheck();
				}
			} catch (error) {
				logger.error({ err: error }, "Health check failed:");
				await this.handleCriticalError(new Error("Health check failed"));
			}
		}, 60000);
	}
	private async saveBatchEvents(events: any[]): Promise<void> {
		if (events.length === 0) return;

		await this.safeAsyncOperation(
			async () => {
				const chunkSize = 50;
				for (let i = 0; i < events.length; i += chunkSize) {
					const chunk = events.slice(i, i + chunkSize);
					await DB.Event.insertManyOrUpdate(chunk);
				}

				if (this.debugStatements) {
					logger.info(`Batch saved ${events.length} events to database`);
				}

				return true;
			},
			"saveBatchEvents",
			5,
		);
	}

	private async updateSyncProgress(currentSlot: number, highestSlot?: number): Promise<void> {
		await this.safeAsyncOperation(
			async () => {
				await DB.EventsMeta.updateSyncProgress(
					this.config.autoFunAddress,
					this.config.networkId.toString(),
					currentSlot,
					highestSlot,
				);
				return true;
			},
			"updateSyncProgress",
			3,
		);
	}

	private async getLastProcessedSignature(): Promise<string | undefined> {
		return (
			(await this.safeAsyncOperation(
				async () => {
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
				},
				"getLastProcessedSignature",
				3,
			)) || undefined
		);
	}
	private async getSignatures(beforeSignature?: string): Promise<any[]> {
		return (
			(await this.safeAsyncOperation(
				async () => {
					return await this.rpc.getSignaturesForAddress(this.config.autoFunAddress, {
						limit: this.config.maxSignatures || 500,
						before: beforeSignature,
					});
				},
				"getSignatures",
				5,
			)) || []
		);
	}
	private async processSignature(signatureInfo: any): Promise<any[]> {
		return (
			(await this.safeAsyncOperation(
				async () => {
					const signatureExists = await DB.Event.exists({
						signature: signatureInfo.signature,
						programId: this.config.autoFunAddress,
					});

					if (signatureExists) {
						if (this.debugStatements) {
							logger.info(`Signature ${signatureInfo.signature} already processed, skipping`);
						}
						return [];
					}

					const transaction = await this.rpc.getTransaction(signatureInfo.signature);

					if (!transaction?.meta || transaction.meta.err) {
						return [];
					}

					const events = this.processors.flatMap((processor) =>
						processor.processTransaction(transaction, transaction.blockTime || 0, transaction.slot),
					);

					if (events.length > 0 && this.debugStatements) {
						logger.info(`Signature ${signatureInfo.signature}: ${events.length} events (slot: ${transaction.slot})`);
					}

					return events;
				},
				`processSignature-${signatureInfo.signature}`,
				3,
			)) || []
		);
	}
	private async processSignaturesBatch(signatures: any[]): Promise<any[]> {
		const { concurrencyLimit } = this.config;
		const allEvents: any[] = [];

		for (let i = 0; i < signatures.length; i += concurrencyLimit!) {
			if (this.isShuttingDown) break;

			const chunk = signatures.slice(i, i + concurrencyLimit!);

			const chunkPromises = chunk.map((signatureInfo) =>
				this.processSignature(signatureInfo).catch((error) => {
					logger.error({ err: error }, `Failed to process signature ${signatureInfo.signature}:`);
					return [];
				}),
			);

			const chunkResults = await Promise.allSettled(chunkPromises);

			for (const result of chunkResults) {
				if (result.status === "fulfilled" && result.value) {
					allEvents.push(...result.value);
				}
			}
			if (i + concurrencyLimit! < signatures.length) {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		}

		return allEvents;
	}

	private async startListening(): Promise<void> {
		logger.info("Starting efficient real-time listening...");

		let lastSyncTime = 0;
		const SYNC_INTERVAL = 5000;

		try {
			const subscriptionId = await this.safeAsyncOperation(
				async () => {
					return await this.rpc.subscribeSlot(async (slotInfo) => {
						if (this.isShuttingDown) return;

						const now = Date.now();

						if (now - lastSyncTime < SYNC_INTERVAL) {
							if (this.debugStatements) {
								logger.info(`Skipping slot ${slotInfo.slot} - synced recently`);
							}
							return;
						}

						lastSyncTime = now;

						if (this.debugStatements) {
							logger.info(`Triggering sync at slot ${slotInfo.slot}`);
						}

						try {
							await this.runWithSignatures(false);

							if (this.debugStatements) {
								logger.info(`Sync completed for slot ${slotInfo.slot}`);
							}
						} catch (error) {
							logger.error({ err: error }, `Error during sync at slot ${slotInfo.slot}:`);
						}
					});
				},
				"subscribeSlot",
				10,
			);

			if (!subscriptionId) {
				throw new Error("Failed to subscribe to slots");
			}

			this.rpc.on("websocket:reconnected", () => {
				logger.info("WebSocket reconnected, resuming listening...");
				this.reconnectAttempts = 0;
				this.retryAttempts = 0;
			});

			this.rpc.on("websocket:error", async (error) => {
				logger.error("WebSocket error:", error);
				this.reconnectAttempts++;

				if (this.reconnectAttempts >= this.maxReconnectAttempts) {
					logger.error("Max WebSocket reconnection attempts reached");
					throw new Error("WebSocket connection failed permanently");
				}
			});

			logger.info(`Efficient listening started with subscription ID: ${subscriptionId}`);
			logger.info(`Will sync every ${SYNC_INTERVAL}ms when new slots arrive`);
			this.startHealthCheck();
		} catch (error) {
			logger.error("Error setting up efficient listener:", error);
			throw error;
		}
	}

	private async runWithSignatures(showLogs = false): Promise<void> {
		try {
			const maxSignatures = this.config.maxSignatures || 500;

			const syncMeta = await this.safeAsyncOperation(
				() => DB.EventsMeta.getOrCreate(this.config.autoFunAddress, this.config.networkId.toString()),
				"getOrCreateSyncMeta",
				5,
			);

			if (!syncMeta) {
				throw new Error("Failed to get sync metadata");
			}

			let beforeSignature = this.config.beforeSignature;
			let stopAtSignature: string | undefined;
			let isGenesisSync = false;
			let targetMinSlot = this.STOP_AT_SLOT;

			// Determine sync strategy
			if (!syncMeta.doneGenesisSync) {
				// Genesis sync: from current to minBlock
				if (showLogs) {
					logger.info(`Genesis sync from current block to minBlock: ${this.STOP_AT_SLOT}`);
					logger.info(`Resuming from slot: ${syncMeta.currentBlock || "latest"}`);
				}
				isGenesisSync = true;

				if (syncMeta.currentBlock > 0) {
					beforeSignature = await this.getLastProcessedSignature();
				}
			} else {
				// Normal sync: from latest until newest DB event
				if (showLogs) {
					logger.info("Normal sync from latest to newest DB event");
				}
				targetMinSlot = 0;
				beforeSignature = undefined;

				const newestEvent = await this.safeAsyncOperation(
					() => DB.Event.findOne({ programId: this.config.autoFunAddress }, {}, { sort: { slot: -1 } }),
					"findNewestEvent",
					3,
				);

				if (newestEvent) {
					stopAtSignature = newestEvent.signature;
					if (showLogs) {
						logger.info(`Will stop when reaching DB signature: ${stopAtSignature}`);
					}
				} else {
					if (showLogs) {
						logger.info("No existing events in DB, will process recent signatures");
					}
				}
			}

			const totalStats: ProcessingStats = {
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

			while (hasMoreSignatures && !this.isShuttingDown) {
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
					const stopIndex = signatures.findIndex((sig) => sig.signature === stopAtSignature);
					if (stopIndex !== -1) {
						if (stopIndex === 0) {
							if (showLogs) {
								logger.info("Already up to date - newest signature found at start of batch");
							}
							break;
						}
						signatures.splice(stopIndex);
						hasMoreSignatures = false;
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

					this.logBatchProgress(batchNumber, signatures, batchDuration, allBatchEvents.length, totalStats, showLogs);

					if (batchNumber % 10 === 0 && global.gc) {
						global.gc();
						if (showLogs) {
							logger.info(`Forced garbage collection after batch ${batchNumber}`);
						}
					}

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
				await this.safeAsyncOperation(
					() => DB.EventsMeta.markGenesisComplete(this.config.autoFunAddress, this.config.networkId.toString()),
					"markGenesisComplete",
					3,
				);
				if (showLogs) {
					logger.info("Genesis sync marked as complete");
				}
			}

			this.logFinalSummary(totalStats, showLogs);
		} catch (error) {
			logger.error("Error running signature-based indexer:", error);
			if (!this.isShuttingDown) {
				throw error; // Re-throw for higher level handling
			}
		}
	}

	private shouldStopAtSlot(signatures: any[]): boolean {
		return signatures.some((sig) => sig.slot && sig.slot <= this.STOP_AT_SLOT);
	}

	private logBatchProgress(
		batchNumber: number,
		signatures: any[],
		batchDuration: number,
		batchEventCount: number,
		totalStats: ProcessingStats,
		showLogs = false,
	): void {
		if (showLogs && this.debugStatements) {
			const batchSignaturesPerSecond = ((signatures.length / batchDuration) * 1000).toFixed(2);
			const overallDuration = Date.now() - totalStats.startTime;
			const overallSignaturesPerSecond = ((totalStats.processedSignatures / overallDuration) * 1000).toFixed(2);

			const memUsage = process.memoryUsage();
			const memInfo =
				`RSS ${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, ` + `Heap ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`;

			logger.info(`Completed batch ${batchNumber} in ${batchDuration}ms with ${batchEventCount} events`);
			logger.info(
				`Batch: ${batchSignaturesPerSecond} sigs/sec | ` +
					`Overall: ${overallSignaturesPerSecond} sigs/sec | ` +
					`Total events: ${totalStats.events}`,
			);
			logger.info(`Memory: ${memInfo}`);
		} else if (showLogs) {
			const firstSlot = signatures[0]?.slot;
			const lastSlot = signatures[signatures.length - 1]?.slot;
			logger.info(`Batch ${batchNumber} (${firstSlot}-${lastSlot}) processed: ${batchEventCount} events`);
		}
	}

	public async runWithRealTimeSync(): Promise<void> {
		try {
			logger.info("=== STARTING AUTOFUN SOLANA INDEXER ===");

			while (!this.isShuttingDown) {
				try {
					logger.info("=== STEP 1: ENSURING FULL SYNC ===");
					await this.runWithSignatures(true);

					logger.info("=== STEP 2: FINAL GAP CHECK ===");
					await this.runWithSignatures(true);

					logger.info("=== STEP 3: STARTING REAL-TIME LISTENING ===");
					await this.startListening();

					logger.info("Solana indexer is now running. Press Ctrl+C to stop.");

					// Keep the process alive and monitor health
					while (!this.isShuttingDown) {
						await new Promise((resolve) => setTimeout(resolve, 60000)); // Check every minute

						try {
							await this.performHealthCheck();
						} catch (error) {
							logger.warn("Periodic health check failed, will restart listening...");
							break; // Break inner loop to restart listening
						}
					}
				} catch (error) {
					logger.error("Error in main sync loop:", error);

					if (this.isShuttingDown) break;

					// Check if this is a connection error
					if (this.isNetworkError(error)) {
						logger.info("Network error detected, resetting connections...");
						await this.resetConnections();
					}

					await this.exponentialBackoff(this.retryAttempts);
					this.retryAttempts++;

					if (this.retryAttempts >= this.maxRetryAttempts) {
						logger.error("Max retry attempts reached in main loop, forcing restart...");
						process.exit(1);
					}

					logger.info(`Retrying main sync loop (attempt ${this.retryAttempts}/${this.maxRetryAttempts})`);
				}
			}
		} catch (error) {
			logger.error("Critical error in runWithRealTimeSync:", error);
			await this.handleCriticalError(error as Error);
		}
	}
}
