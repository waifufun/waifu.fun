import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { initializePrograms, ProgramContext } from "./programs";
import type {
  MigrationContext,
  ProtocolMigration,
  ProtocolState,
} from "./types";

export class MigrationManager {
  private programContext: ProgramContext | null = null;

  constructor(
    private readonly migrationModel: any,
    private readonly connection: Connection
  ) {}

  async initializePrograms(provider: AnchorProvider): Promise<void> {
    this.programContext = await initializePrograms(provider);
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
          wallet: this.programContext.provider.wallet as unknown as Keypair,
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
    if (protocol === "raydium") {
      return [
        {
          name: "withdraw",
          description: "Withdraw liquidity from autofun",
        },
        {
          name: "createPool",
          description: "Create a new Raydium pool",
        },
        {
          name: "createPrimaryPositionNft",
          description: "Create primary position NFT",
        },
        {
          name: "createSecondaryPositionNft",
          description: "Create secondary position NFT",
        },
        {
          name: "lockPrimaryPosition",
          description: "Lock primary position",
        },
        {
          name: "lockSecondaryPosition",
          description: "Lock secondary position",
        },
        {
          name: "finalizeLockPosition",
          description: "Finalize position lock",
        },
        {
          name: "sendNft",
          description: "Send NFT to manager multisig",
        },
        {
          name: "depositNft",
          description: "Deposit NFT to Raydium vault",
        },
        {
          name: "collectFees",
          description: "Collect protocol fees",
        },
        {
          name: "finalizeMigration",
          description: "Finalize Raydium migration",
        },
      ];
    } else {
      return [
        {
          name: "withdraw",
          description: "Withdraw liquidity from autofun",
        },
        {
          name: "createPrimaryPositionNft",
          description: "Create primary position NFT",
        },
        {
          name: "createSecondaryPositionNft",
          description: "Create secondary position NFT",
        },
        {
          name: "finalizePositionNft",
          description: "Finalize position NFT",
        },
        {
          name: "createPool",
          description: "Create a new Meteora pool",
        },

        {
          name: "createPosition",
          description: "Create a new position",
        },
        {
          name: "addLiquidity",
          description: "Add liquidity to Meteora pool",
        },
        {
          name: "sendNft",
          description: "Send NFT to manager multisig",
        },
        {
          name: "depositNft",
          description: "Deposit NFT to Meteora vault",
        },
        {
          name: "collectFees",
          description: "Collect protocol fees",
        },
        {
          name: "finalizeMigration",
          description: "Finalize Meteora migration",
        },
      ];
    }
  }
}
