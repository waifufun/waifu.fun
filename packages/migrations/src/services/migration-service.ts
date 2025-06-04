import { Connection } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { MigrationManager } from "../migrations";
import type { ProtocolMigration, ProtocolState } from "../types";
import DB from "@autofun/database";
import logger from "@autofun/logger";
import type { IMigration } from "@autofun/types";
import type { Model } from "mongoose";
import redis from "@autofun/redis";


export class MigrationService {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 5000;
  private readonly MAX_CONCURRENT_MIGRATIONS = 5;
  private readonly LOCK_TTL = 30; // 30 seconds lock TTL
  private migrationManager: MigrationManager;

  constructor(
    private readonly connection: Connection,
    private readonly provider: AnchorProvider,
    private readonly redisClient: typeof redis = redis,
    private readonly db: typeof DB = DB
  ) {
    this.migrationManager = new MigrationManager(
      this.db.Migration as Model<IMigration>,
      connection
    );
  }

  async initialize(): Promise<void> {
    try {
      await this.migrationManager.initializePrograms(this.provider);
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
    logger.info("Migration service shut down");
  }

  private async acquireLock(migrationId: string): Promise<boolean> {
    const lockKey = `migration:lock:${migrationId}`;
    const result = await this.redisClient.set(lockKey, '1', 'EX', this.LOCK_TTL, 'NX');
    return result === 'OK';
  }

  private async releaseLock(migrationId: string): Promise<void> {
    const lockKey = `migration:lock:${migrationId}`;
    await this.redisClient.del(lockKey);
  }

  private startProcessing(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(
      () => this.processMigrations(),
      this.POLL_INTERVAL
    );

    this.processMigrations();
    logger.info("Migration processing started");
  }

  private async processMigrations(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;

      // Get all active migrations
      const activeMigrations = await this.db.Migration.find({
        status: { $in: ['active', 'migrating', 'migrated'] }
      }).limit(this.MAX_CONCURRENT_MIGRATIONS);

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
      logger.error('Error processing migrations:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // private async getProtocolFromToken(
  //   tokenMint: string
  // ): Promise<"raydium" | "meteora" | string | undefined> {
  //   const token = await DB.Token.findOne({ contractAddress: tokenMint });
  //   if (!token) {
  //     throw new Error(`Token ${tokenMint} not found in database`);
  //   }

  //   if (!token.pool) {
  //     throw new Error(`Token ${tokenMint} has no pool information`);
  //   }

  //   // Convert pool to protocol name
  //   const protocol = token.pool.toLowerCase();
  //   if (protocol !== "raydium" && protocol !== "meteora") {
  //     throw new Error(`Unsupported protocol: ${protocol}`);
  //   }

  //   return protocol as "raydium" | "meteora";
  // }

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
              completedAt: new Date()
            }
          }
        );
        logger.info(`Migration ${migration._id} finalized successfully`);
        return;
      }

      const protocolMigration = this.createProtocolMigration(
        `migration-${Date.now()}`,
        migration
      );

      // Store current state in Redis for recovery
      const stateKey = `migration:state:${migration._id}`;
      await this.redisClient.set(
        stateKey,
        JSON.stringify({
          currentStep,
          protocolState: protocolMigration.protocolState,
          startedAt: new Date()
        }),
        'EX',
        this.LOCK_TTL
      );

      const result = await this.migrationManager.executeMigration(
        protocolMigration,
        [steps[currentStep]]
      );

      if (!result.success) {
        throw new Error(`Migration step failed: ${result.error?.message}`);
      }

      await this.db.Migration.findOneAndUpdate(
        { _id: migration._id },
        {
          $set: {
            currentStep: currentStep + 1,
            lastSuccessfulStep: currentStep,
            lastProcessedAt: new Date()
          }
        }
      );

      // Clear state from Redis after successful step
      await this.redisClient.del(stateKey);

      logger.info(`Migration ${migration._id} completed step ${currentStep}`);
    } catch (error) {
      await this.db.Migration.findOneAndUpdate(
        { _id: migration._id },
        {
          $set: {
            status: "active",
            errors: error instanceof Error ? error.message : "Unknown error",
            lastErrorAt: new Date()
          }
        }
      );

      logger.error(`Migration ${migration._id} failed:`, error);
    }
  }

  private createProtocolMigration(
    name: string,
    migration: IMigration
  ): ProtocolMigration {
    let protocolState: ProtocolState;
    try {
      protocolState = JSON.parse(
        migration.protocolState || "{}"
      ) as ProtocolState;
    } catch (error) {
      logger.error("Failed to parse protocol state:", error);
      protocolState = {
        tokenMint: migration.contractAddress,
        amount: 0,
        transactions: [],
      };
    }
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
        withdrawnAmounts: undefined,
        txId: protocolState?.txId ?? undefined,
        transactions: [],
      },
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
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
