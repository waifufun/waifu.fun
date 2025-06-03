import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { MigrationManager } from '../migrations';
import type { MigrationContext, ProtocolMigration, TransactionRecord } from '../types';
import DB from '@autofun/database';
import { AnchorProvider } from '@coral-xyz/anchor';

export class MigrationTrigger {
  private migrationManager: MigrationManager;
  private connection: Connection;
  private provider: AnchorProvider;

  constructor(connection: Connection, provider: AnchorProvider) {
    this.connection = connection;
    this.provider = provider;
    this.migrationManager = new MigrationManager(DB.Migration, connection);
    this.initializePrograms();
  }

  private async initializePrograms() {
    await this.migrationManager.initializePrograms(this.provider);
  }

  private async getProtocolFromToken(tokenMint: string): Promise<'raydium' | 'meteora'> {
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

  private createProtocolMigration(name: string, tokenMint: string): ProtocolMigration {
    return {
      id: '',
      name,
      version: 1,
      status: 'active',
      currentStep: 0,
      protocolState: {
        tokenMint,
        amount: 0,
        withdrawnAmounts: undefined,
        txId: undefined,
        transactions: []
      },
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async updateMigrationState(migration: ProtocolMigration): Promise<void> {
    await DB.Migration.updateOne(
      { name: migration.name },
      { 
        $set: { 
          protocolState: JSON.stringify(migration.protocolState),
          status: migration.status,
          currentStep: migration.currentStep,
          updatedAt: new Date()
        }
      }
    );
  }

  private async recordTransaction(
    migration: ProtocolMigration,
    step: string,
    txId: string,
    data?: any
  ): Promise<void> {
    const transaction: TransactionRecord = {
      step,
      txId,
      data,
      timestamp: new Date()
    };

    if (!migration.protocolState.transactions) {
      migration.protocolState.transactions = [];
    }
    migration.protocolState.transactions.push(transaction);
    await this.updateMigrationState(migration);
  }

  async handleProgramEvent(
    programId: PublicKey,
    event: any,
    wallet: Keypair,
    provider: AnchorProvider
  ): Promise<void> {
    try {
      // Get protocol from token's pool
      const protocol = await this.getProtocolFromToken(event.tokenMint);

      // Get migration steps for the protocol
      const steps = await this.migrationManager.getMigrationSteps(protocol);

      // Get program context
      const programContext = this.migrationManager.getProgramContext();
      if (!programContext) {
        throw new Error('Program context not initialized');
      }

      // Create migration context
      const context: MigrationContext = {
        rpc: this.connection,
        state: {
          tokenMint: event.tokenMint,
          amount: 0
        },
        wallet,
        provider: programContext.provider,
        raydiumVaultProgram: programContext.raydiumVaultProgram,
        meteoraVaultProgram: programContext.meteoraVaultProgram
      };

      // Create migration
      const migration = this.createProtocolMigration(`migration-${Date.now()}`, event.tokenMint);
      await this.migrationManager.createMigration(migration);

      // Execute migration
      const result = await this.migrationManager.executeMigration(migration, steps);
      
      if (!result.success) {
        console.error('Migration failed:', result.error);
        throw result.error;
      }

      // Update migration state with final state
      await this.updateMigrationState(migration);

      console.info('Migration completed successfully');
    } catch (error) {
      console.error('Error handling program event:', error);
      throw error;
    }
  }

  async manualTrigger(
    tokenMint: string,
    wallet: Keypair,
    provider: AnchorProvider
  ): Promise<void> {
    try {
      // Get protocol from token's pool
      const protocol = await this.getProtocolFromToken(tokenMint);

      // Get migration steps for the protocol
      const steps = await this.migrationManager.getMigrationSteps(protocol);

      // Get program context
      const programContext = this.migrationManager.getProgramContext();
      if (!programContext) {
        throw new Error('Program context not initialized');
      }

      // Create migration context
      const context: MigrationContext = {
        rpc: this.connection,
        state: {
          tokenMint,
          amount: 0
        },
        wallet,
        provider: programContext.provider,
        raydiumVaultProgram: programContext.raydiumVaultProgram,
        meteoraVaultProgram: programContext.meteoraVaultProgram
      };

      // Create migration
      const migration = this.createProtocolMigration(`manual-migration-${Date.now()}`, tokenMint);
      await this.migrationManager.createMigration(migration);

      // Execute migration
      const result = await this.migrationManager.executeMigration(migration, steps);
      
      if (!result.success) {
        console.error('Manual migration failed:', result.error);
        throw result.error;
      }

      // Update migration state with final state
      await this.updateMigrationState(migration);

      console.info('Manual migration completed successfully');
    } catch (error) {
      console.error('Error in manual migration:', error);
      throw error;
    }
  }
} 