import { Connection } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { MigrationManager } from '../migrations';
import type { ProtocolMigration, ProtocolState } from '../types';
import DB from '@autofun/database';
import logger from '@autofun/logger';
import type { IMigration } from '@autofun/types';

export class MigrationService {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 5000;
  private readonly MAX_CONCURRENT_MIGRATIONS = 5;
  private migrationManager: MigrationManager;

  constructor(
    private readonly connection: Connection,
    private readonly provider: AnchorProvider
  ) {
    this.migrationManager = new MigrationManager(DB.Migration, connection);
  }

  async initialize(): Promise<void> {
    try {
      await this.migrationManager.initializePrograms(this.provider);
      this.startProcessing();
      logger.info('Migration service initialized');
    } catch (error) {
      logger.error('Failed to initialize migration service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info('Migration service shut down');
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
    logger.info('Migration processing started');
  }
  

  private async processMigrations(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    try {
      this.isProcessing = true;

      const activeMigrations = await DB.Migration.find({
        status: { $in: ['active', 'migrating', 'migrated'] }
      }).limit(this.MAX_CONCURRENT_MIGRATIONS);

      await Promise.all(
        activeMigrations.map(migration => this.processMigration(migration))
      );
    } catch (error) {
      logger.error('Error processing migrations:', error);
    } finally {
      this.isProcessing = false;
    }
  }
    private async getProtocolFromToken(tokenMint: string): Promise<'raydium' | 'meteora' | string | undefined> {
    const token = await DB.Token.findOne({ contractAddress: tokenMint });
    if (!token) {
      throw new Error(`Token ${tokenMint} not found in database`);
    }

    if (!token.pool) {
      throw new Error(`Token ${tokenMint} has no pool information`);
    }

    // Convert pool to protocol name
    const protocol = token.pool.toLowerCase();
    if (protocol !== 'raydium' && protocol !== 'meteora') {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }

    return protocol as 'raydium' | 'meteora';
  }

  private async processMigration(migration: IMigration): Promise<void> {
    try {
      // get token 
      // const token = await DB.Token.findOne({
      //   contractAddress: migration.contractAddress,
      //   chain: migration.chain,
      //   chainId: migration.chainId
      // });
      // if (!token) {
      //   logger.warn(`Token ${migration.contractAddress} not found for migration ${migration.id}`);
      //   return;
      // }
      // const protocol = await this.getProtocolFromToken(token.contractAddress);
      // if (!protocol) {
      //   logger.warn(`No protocol found for token ${token.contractAddress}`);
      //   return;
      // }
      const isProcessing = await DB.Migration.findOneAndUpdate(
        {
          _id: migration._id,
          status: { $in: ['active', 'migrating', 'migrated'] },
          processingAt: { $exists: false }
        },
        {
          $set: {
            processingAt: new Date(),
            lastProcessedAt: new Date()
          }
        }
      );

      if (!isProcessing) {
        return;
      }

      const currentStep = migration.currentStep || 0;
      const steps = await this.migrationManager.getMigrationSteps(migration.protocol);

      if (currentStep >= steps.length) {
        await DB.Migration.findOneAndUpdate(
          { _id: migration._id },
          {
            $set: {
              status: 'finalized',
              completedAt: new Date(),
              processingAt: null
            }
          }
        );
        logger.info(`Migration ${migration._id} finalized successfully`);
        return;
      }
      const protocolMigration = this.createProtocolMigration(`migration-${Date.now()}`,migration);

      const result = await this.migrationManager.executeMigration(protocolMigration, [steps[currentStep]]);

      if (!result.success) {
        throw result.error;
      }

      await DB.Migration.findOneAndUpdate(
        { _id: migration._id },
        {
          $set: {
            currentStep: currentStep + 1,
            lastSuccessfulStep: currentStep,
            processingAt: null,
            lastProcessedAt: new Date()
          }
        }
      );

      logger.info(`Migration ${migration._id} completed step ${currentStep}`);
    } catch (error) {
      await DB.Migration.findOneAndUpdate(
        { _id: migration._id },
        {
          $set: {
            status: 'active',
            errors: error instanceof Error ? error.message : 'Unknown error',
            processingAt: null,
            lastErrorAt: new Date()
          }
        }
      );

      logger.error(`Migration ${migration._id} failed:`, error);
    }
  }
  private createProtocolMigration(name: string, migration: IMigration): ProtocolMigration {
      const protocolState = JSON.parse(migration.protocolState || '{}') as ProtocolState;
      return {
        id: migration._id || '',
        name,
        version: 1,
        status: migration.status || 'migrating',
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
        updatedAt: new Date()
      };
    }

  async getMigrationStatus(migrationId: string): Promise<{
    status: string;
    currentStep: number;
    error?: string;
  }> {
    const migration = await DB.Migration.findOne({ id: migrationId });
    if (!migration) {
      throw new Error('Migration not found');
    }

    return {
      status: migration.status,
      currentStep: migration.currentStep || 0,
      error: migration.errors?.toString()
    };
  }
} 