import type { Connection } from "@solana/web3.js";
import type { AnchorProvider } from "@coral-xyz/anchor";
import { MigrationManager } from "../migrations";
import type { ProtocolMigration, ProtocolState } from "../types";
import DB from "@autofun/database";
import logger from "@autofun/logger";
import { SolanaNetworkIds, type IMigration } from "@autofun/types";
import type { Model } from "mongoose";
import redis from "@autofun/redis";
import { Keypair } from "@solana/web3.js";

export class MigrationService {
	private isProcessing = false;
	private processingInterval: NodeJS.Timeout | null = null;
	private populationInterval: NodeJS.Timeout | null = null;
	private readonly POLL_INTERVAL = 5000;
	private readonly POPULATION_INTERVAL = 60000; // 1 minute
	private readonly MAX_CONCURRENT_MIGRATIONS = 5;
	private readonly LOCK_TTL = 30; // 30 seconds lock TTL
	private migrationManager: MigrationManager;
	private keyPair: Keypair;

	constructor(
		private readonly connection: Connection,
		private readonly provider: AnchorProvider,
		private readonly redisClient: typeof redis = redis,
		private readonly db: typeof DB = DB,
	) {
		const rawKey = process.env.EXECUTOR_PRIVATE_KEY;
		if (!rawKey) {
			throw new Error("EXECUTOR_PRIVATE_KEY is not set in environment");
		}
		const privateKey = Uint8Array.from(JSON.parse(rawKey));
		this.keyPair = Keypair.fromSecretKey(privateKey);
		this.migrationManager = new MigrationManager(this.db.Migration as Model<IMigration>, connection);
	}

	async initialize(): Promise<void> {
		try {
			await this.migrationManager.initializePrograms(this.provider, this.keyPair);
			this.startProcessing();
			logger.info("Migration service initialized");
		} catch (error) {
			logger.error("Failed to initialize migration service:", error);
			throw error;
		}
	}

	async shutdown(): Promise<void> {
		if (this.processingInterval) {
			clearInterval(this.processingInterval);
			this.processingInterval = null;
		}
		if (this.populationInterval) {
			clearInterval(this.populationInterval);
			this.populationInterval = null;
		}

		// wait for any in‐flight processing to finish
		while (this.isProcessing) {
			// sleep for a handful of ms and poll again
			await new Promise((r) => setTimeout(r, 100));
		}

		logger.info("Migration service shut down");
	}

	private async acquireLock(migrationId: string): Promise<boolean> {
		const lockKey = `migration:lock:${migrationId}`;
		const result = await this.redisClient.set(lockKey, "1", "EX", this.LOCK_TTL, "NX");
		return result === "OK";
	}

	private async releaseLock(migrationId: string): Promise<void> {
		const lockKey = `migration:lock:${migrationId}`;
		await this.redisClient.del(lockKey);
	}

	private startProcessing(): void {
		if (this.processingInterval || this.populationInterval) {
			return;
		}

		this.processingInterval = setInterval(() => this.processMigrations(), this.POLL_INTERVAL);
		this.populationInterval = setInterval(() => this.populateMigrations(), this.POPULATION_INTERVAL);

		// Initial population and processing
		this.populateMigrations();
		this.processMigrations();
		logger.info("Migration processing started");
	}

	private async populateMigrations(): Promise<void> {
		try {
			const migrationEvents = await this.db.Event.find({
				eventType: "curveCompleted",
				processed: false,
			}).limit(100);
			if (migrationEvents.length === 0) {
				logger.info("No new migration events found");
				return;
			}
			logger.info(`Found ${migrationEvents.length} new migration events to process`);

			// Process migrations sequentially
			for (const event of migrationEvents) {
				try {
					const { contractAddress } = event;
					if (!contractAddress) {
						logger.warn(`Skipping event ${event._id} due to missing data`);
						continue;
					}
					// get protocol from the token mint
					const token = await this.db.Token.findOne({ contractAddress });
					if (!token) {
						logger.warn(`Token not found for contract address ${contractAddress}, skipping event ${event._id}`);
						continue;
					}
					// Check if migration already exists
					const existingMigration = await this.db.Migration.findOne({
						contractAddress,
						status: { $in: ["migrating", "migrated"] },
					});
					if (existingMigration) {
						logger.info(`Migration for ${contractAddress} already exists, skipping`);
						continue;
					}
					const protocol = token.pool?.toLowerCase();
					if (!protocol || (protocol !== "raydium" && protocol !== "meteora")) {
						logger.warn(
							`Unsupported protocol ${protocol} for contract address ${contractAddress}, skipping event ${event._id}`,
						);
						continue;
					}
					const address = token.contractAddress as IMigration["contractAddress"];
					const chainId = token.chainId;
					if (chainId !== SolanaNetworkIds.Devnet && chainId !== SolanaNetworkIds.Mainnet) {
						logger.warn(
							`Unsupported chain ID ${chainId} for contract address ${contractAddress}, skipping event ${event._id}`,
						);
						continue;
					}
					// Create new migration
					const newMigration = {
						_id: new this.db.Migration()._id,
						contractAddress: address,
						protocol,
						status: "migrating" as const,
						currentStep: 0,
						protocolState: JSON.stringify({
							tokenMint: contractAddress,
							amount: 0,
							withdrawnAmounts: [],
							txId: "",
							transactions: [],
						}),
						startedAt: new Date(),
						creator: token.creator || "unknown",
						chain: "solana" as const,
						chainId: chainId,
						version: 2,
					} as unknown as IMigration;

					await this.db.Migration.create(newMigration);
					await this.db.Event.updateOne({ _id: event._id }, { $set: { processed: true } });
					await this.db.Token.updateOne({ contractAddress }, { $set: { curveCompleted: true, status: "migrating" } });
					logger.info(`Created new migration for ${contractAddress}`);
				} catch (error) {
					logger.error(`Error processing migration event ${event._id}:`, error);
				}
			}
		} catch (error) {
			logger.error("Error populating migrations:", error);
		}
	}

	private async processMigrations(): Promise<void> {
		if (this.isProcessing) {
			return;
		}

		try {
			this.isProcessing = true;

			// Get all active migrations
			const activeMigrations = await this.db.Migration.find({
				status: { $in: ["migrating", "migrated"] },
			}).limit(this.MAX_CONCURRENT_MIGRATIONS);
			logger.info(`Found ${activeMigrations.length} active migrations to process`);

			// Process migrations that we can acquire locks for
			const processingPromises = activeMigrations.map(async (migration) => {
				const lockAcquired = await this.acquireLock(migration._id.toString());
				if (lockAcquired) {
					try {
						await this.processMigration(migration);
					} finally {
						await this.releaseLock(migration._id.toString());
					}
				}
			});

			await Promise.all(processingPromises);
		} catch (error) {
			logger.error("Error processing migrations:", error);
		} finally {
			this.isProcessing = false;
		}
	}

	private parseNestedJson(obj: any): any {
		if (typeof obj !== "object" || obj === null) {
			return obj;
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.parseNestedJson(item));
		}

		const result: any = {};
		for (const [key, value] of Object.entries(obj)) {
			if (typeof value === "string") {
				try {
					result[key] = JSON.parse(value);
				} catch {
					result[key] = value;
				}
			} else {
				result[key] = this.parseNestedJson(value);
			}
		}
		return result;
	}

	private async processMigration(migration: IMigration): Promise<void> {
		try {
			const currentStep = migration.currentStep || 0;
			const steps = await this.migrationManager.getMigrationSteps(migration.protocol);

			if (currentStep >= steps.length) {
				await this.db.Migration.findOneAndUpdate(
					{ _id: migration._id },
					{
						$set: {
							status: "finalized",
							completedAt: new Date(),
						},
					},
				);
				logger.info(`Migration ${migration._id} finalized successfully`);
				return;
			}

			const protocolMigration = this.createProtocolMigration(`migration-${Date.now()}`, migration);

			// Store current state in Redis for recovery
			const stateKey = `migration:state:${migration._id}`;
			await this.redisClient.set(
				stateKey,
				JSON.stringify({
					currentStep,
					protocolState: protocolMigration.protocolState,
					startedAt: new Date(),
				}),
				"EX",
				this.LOCK_TTL,
			);

			const result = await this.migrationManager.executeMigration(protocolMigration, [steps[currentStep]]);

			if (!result.success) {
				throw new Error(`Migration step failed: ${result.error?.message}`);
			}

			await this.db.Migration.findOneAndUpdate(
				{ _id: migration._id },
				{
					$set: {
						currentStep: currentStep + 1,
						lastSuccessfulStep: currentStep,
						lastProcessedAt: new Date(),
					},
				},
			);

			// Clear state from Redis after successful step
			await this.redisClient.del(stateKey);

			logger.info(`Migration ${migration._id} completed step ${currentStep}`);
		} catch (error) {
			await this.db.Migration.findOneAndUpdate(
				{ _id: migration._id },
				{
					$set: {
						status: "migrating",
						errors: error instanceof Error ? error.message : "Unknown error",
						lastErrorAt: new Date(),
					},
				},
			);

			logger.error({
				msg: `Migration ${migration._id} failed`,
				error: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : undefined,
				currentStep: migration.currentStep,
				protocol: migration.protocol,
				status: migration.status,
			});
		}
	}

	private createProtocolMigration(name: string, migration: IMigration): ProtocolMigration {
		let protocolState: ProtocolState;
		try {
			protocolState = this.parseNestedJson(JSON.parse(migration.protocolState || "{}")) as ProtocolState;
		} catch (error) {
			logger.error("Failed to parse protocol state:", error);
			protocolState = {
				tokenMint: migration.contractAddress,
				amount: 0,
				transactions: [],
			};
		}

		// Parse positionNftsSecrets if they exist
		let positionNftsSecrets: any[] = [];
		if (migration.positionNftsSecrets?.length) {
			try {
				positionNftsSecrets = migration.positionNftsSecrets.map((secret) =>
					typeof secret === "string" ? JSON.parse(secret) : secret,
				);
			} catch (error) {
				logger.error("Failed to parse positionNftsSecrets:", error);
			}
		}

		// Parse withdrawnAmounts if it exists
		let withdrawnAmounts: any;
		if (migration.withdrawnAmounts) {
			try {
				withdrawnAmounts =
					typeof migration.withdrawnAmounts === "string"
						? JSON.parse(migration.withdrawnAmounts)
						: migration.withdrawnAmounts;
			} catch (error) {
				logger.error("Failed to parse withdrawnAmounts:", error);
			}
		}

		// Get amounts from finalizePositionNft transaction
		const finalizeTx = protocolState.transactions?.find((tx) => tx.step === "finalizePositionNft");
		const finalizeData = finalizeTx?.data || {};

		return {
			id: migration._id || "",
			name,
			version: 1,
			status: migration.status || "migrating",
			currentStep: migration.currentStep || 0,
			protocolState: {
				...protocolState,
				tokenMint: protocolState.tokenMint ?? migration.contractAddress,
				amount: protocolState?.amount || 0,
				withdrawnAmounts: withdrawnAmounts || protocolState.withdrawnAmounts,
				txId: protocolState?.txId ?? undefined,
				transactions: protocolState.transactions || [],
				// Primary NFT info
				primaryPositionNftSecret: positionNftsSecrets[0],
				primaryNftMint: migration.primaryNftMint,
				primaryPositionNftTxId: protocolState.transactions?.find((tx) => tx.step === "createPrimaryPositionNft")?.txId,
				// Secondary NFT info
				secondaryPositionNftSecret: positionNftsSecrets[1],
				secondaryNftMint: migration.secondaryNftMint,
				secondaryPositionNftTxId: protocolState.transactions?.find((tx) => tx.step === "createSecondaryPositionNft")
					?.txId,
				// Pool info
				poolId: protocolState.poolId || migration.marketId,
				poolCreationTxId: protocolState.transactions?.find((tx) => tx.step === "createPool")?.txId,
				// Position info
				primaryPosition: protocolState.primaryPosition,
				secondaryPosition: protocolState.secondaryPosition,
				// NFT deposit info
				nftDeposited: protocolState.nftDeposited,
				nftDepositedAt: protocolState.nftDepositedAt,
				primaryNftDepositTxId: protocolState.primaryNftDepositTxId,
				// Finalization info
				positionNftFinalized: protocolState.positionNftFinalized,
				positionNftFinalizedTxId: protocolState.positionNftFinalizedTxId,
				primaryAmount: finalizeData.primaryAmount,
				secondaryAmount: finalizeData.secondaryAmount,
				primaryAmountSol: finalizeData.primaryAmountSol,
				secondaryAmountSol: finalizeData.secondaryAmountSol,
				poolInfo: migration.poolInfo ? JSON.parse(migration.poolInfo) : undefined,
				poolKeys: migration.poolKeys ? JSON.parse(migration.poolKeys) : undefined,
			},
			startedAt: new Date(migration.startedAt || Date.now()),
			createdAt: new Date(migration.createdAt || Date.now()),
			updatedAt: new Date(migration.updatedAt || Date.now()),
		};
	}

	async getMigrationStatus(migrationId: string): Promise<{
		status: string;
		currentStep: number;
		error?: string;
	}> {
		const migration = await this.db.Migration.findOne({ id: migrationId });
		if (!migration) {
			throw new Error("Migration not found");
		}

		return {
			status: migration.status,
			currentStep: migration.currentStep || 0,
			error: migration.errors?.toString(),
		};
	}
}
