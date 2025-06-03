import { Connection } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { MigrationManager } from '../migrations';
import type { ProtocolMigration, ProtocolState } from '../types';
import DB from '@autofun/database';
import logger from '@autofun/logger';

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

  private async processMigration(migration: any): Promise<void> {
    try {
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
        logger.info(`Migration ${migration.id} finalized successfully`);
        return;
      }

      const result = await this.migrationManager.executeMigration(migration, [steps[currentStep]]);

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

      logger.info(`Migration ${migration.id} completed step ${currentStep}`);
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

      logger.error(`Migration ${migration.id} failed:`, error);
    }
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