import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { initializePrograms, ProgramContext } from "./programs";
import type {
  MigrationContext,
  ProtocolMigration,
  ProtocolState,
} from "./types";
import { meteoraMigrationSteps } from './protocols/meteora';
import { raydiumMigrationSteps } from './protocols/raydium';
import { Wallet } from "./utils/customWallet";

export class MigrationManager {
  private programContext: ProgramContext | null = null;

  constructor(
    private readonly migrationModel: any,
    private readonly connection: Connection
  ) {}

  async initializePrograms(provider: AnchorProvider, keypair: Keypair): Promise<void> {
    this.programContext = await initializePrograms(provider, keypair);
  }

  getProgramContext(): ProgramContext | null {
    return this.programContext;
  }

  async createMigration(migration: ProtocolMigration): Promise<void> {
    if (!this.programContext) {
      throw new Error("Programs not initialized");
    }
    await this.migrationModel.create(migration);
  }

  async executeMigration(
    migration: ProtocolMigration,
    steps: any[]
  ): Promise<{ success: boolean; error?: Error }> {
    if (!this.programContext) {
      throw new Error("Programs not initialized");
    }

    try {
      for (const step of steps) {
        const context: MigrationContext = {
          rpc: this.connection,
          wallet: this.programContext.wallet as Wallet,
          state: migration.protocolState,
          provider: this.programContext.provider,
          programContext: this.programContext,
        };

        await step.execute(context);
        migration.currentStep++;
        await this.updateMigrationState(migration);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  private async updateMigrationState(
    migration: ProtocolMigration
  ): Promise<void> {
    await this.migrationModel.updateOne(
      { name: migration.name },
      {
        $set: {
          protocolState: JSON.stringify(migration.protocolState),
          status: migration.status,
          currentStep: migration.currentStep,
          updatedAt: new Date(),
        },
      }
    );
  }

  async getMigrationSteps(protocol: "raydium" | "meteora"): Promise<any[]> {
    if (protocol === "meteora") {
      return meteoraMigrationSteps;
    } else if (protocol === "raydium") {
      return raydiumMigrationSteps;
    } else {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }
}
