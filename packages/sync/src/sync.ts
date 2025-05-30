import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { tokens } from "./schema.js";
import { eq } from "drizzle-orm";
import DB from "@autofun/database";
import logger from "@autofun/logger";
import type { IToken, IMigration, AddressLike } from "@autofun/types";
import { SolanaNetworkIds } from "@autofun/types";
import Mongoose from "mongoose";
import migrationSchema from "./schemas/migration.js";

// Register the Migration schema
Mongoose.model<IMigration>("Migration", migrationSchema);

export class DataSync {
  private pgPool: Pool;
  private pgDb: ReturnType<typeof drizzle>;
  private mongoDb: typeof DB;
  private migrationId: string;
  private Migration: Mongoose.Model<IMigration>;

  constructor(pgConnectionString: string) {
    logger.info("Initializing DataSync...");
    this.pgPool = new Pool({ connectionString: pgConnectionString });
    this.pgDb = drizzle(this.pgPool);
    this.mongoDb = DB;
    this.migrationId = `pg_to_mongo_${Date.now()}`;
    this.Migration = Mongoose.model<IMigration>("Migration");
    logger.info("DataSync initialized");
  }

  private async transformToken(pgToken: any): Promise<IToken> {
    logger.info(`Transforming token ${pgToken.mint}...`);
    
    // Ensure required fields are present
    if (!pgToken.mint || !pgToken.name || !pgToken.ticker) {
      throw new Error(`Missing required fields for token ${pgToken.mint}`);
    }

    // Use default image if missing
    const defaultImage = "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

    return {
      contractAddress: pgToken.mint,
      chain: "solana",
      chainId: SolanaNetworkIds.Mainnet,
      name: pgToken.name,
      ticker: pgToken.ticker,
      image: pgToken.image || defaultImage,
      price: pgToken.tokenPriceUSD || 0,
      imported: Boolean(pgToken.imported),
      decimals: pgToken.tokenDecimals || 6,
      marketcap: pgToken.marketCapUSD || 0,
      volume24h: pgToken.volume24h || 0,
      curveCompleted: pgToken.status === "completed",
      curveProgress: pgToken.curveProgress || 0,
      bondingCurveAddress: pgToken.marketId || "",
      curveLimit: pgToken.curveLimit || 0,
      holders: pgToken.holderCount || 0,
      verified: Boolean(pgToken.verified),
      totalSupply: Number(pgToken.tokenSupply) || 0,
      reserveAmount: pgToken.reserveAmount || 0,
      reserveLamport: pgToken.reserveLamport || 0,
      virtualReserves: pgToken.virtualReserves || 0,
      socials: {
        twitter: pgToken.twitter || undefined,
        website: pgToken.website || undefined,
        discord: pgToken.discord || undefined,
        telegram: pgToken.telegram || undefined,
      },
      hidden: Boolean(pgToken.hidden),
      featured: Boolean(pgToken.featured),
      creator: pgToken.creator || "system",
      pool: pgToken.poolInfo || "",
      updatedAt: pgToken.updatedAt ? new Date(pgToken.updatedAt) : new Date(),
    };
  }

  async syncTokens(batchSize = 100): Promise<void> {
    try {
      logger.info(`Starting token sync with batch size ${batchSize}...`);

      // Clean up invalid tokens from MongoDB
      const cleanupResult = await this.mongoDb.Token.deleteMany({
        $or: [
          { contractAddress: { $exists: false } },
          { contractAddress: null },
          { contractAddress: "" }
        ]
      });
      logger.info(`Removed ${cleanupResult.deletedCount} invalid tokens from MongoDB`);

      let offset = 0;
      let hasMore = true;
      let successCount = 0;
      let failureCount = 0;
      let deletedCount = 0;
      let skippedCount = 0;

      while (hasMore) {
        const pgTokens = await this.pgDb.select().from(tokens).limit(batchSize).offset(offset);
        
        if (pgTokens.length === 0) {
          hasMore = false;
          continue;
        }

        for (const pgToken of pgTokens) {
          try {
            const existingMigration = await this.Migration.findOne({
              contractAddress: pgToken.mint,
              chain: "solana",
              chainId: SolanaNetworkIds.Mainnet,
              status: 'active'
            });

            if (existingMigration) {
              skippedCount++;
              continue;
            }

            const transformedToken = await this.transformToken(pgToken);
            
            const session = await Mongoose.startSession();
            try {
              await session.withTransaction(async () => {
                await this.mongoDb.Token.updateOne(
                  { 
                    contractAddress: transformedToken.contractAddress,
                    chain: transformedToken.chain,
                    chainId: transformedToken.chainId 
                  },
                  { $set: transformedToken },
                  { upsert: true, session }
                );

                if (pgToken.marketId) {
                  const migrationRecord: IMigration = {
                    status: 'active',
                    contractAddress: pgToken.mint as AddressLike,
                    chain: "solana",
                    chainId: SolanaNetworkIds.Mainnet as number,
                    creator: pgToken.creator || 'system',
                    marketId: pgToken.marketId,
                    positionIds: [],
                    nftMinted: Array.isArray(pgToken.nftMinted)
                      ? pgToken.nftMinted
                      : typeof pgToken.nftMinted === "string"
                        ? [pgToken.nftMinted]
                        : [],
                    positionNftsSecrets: [],
                    baseVault: pgToken.baseVault ?? "",
                    quoteVault: pgToken.quoteVault ?? "",
                    withdrawnAmount: pgToken.withdrawnAmount ?? 0,
                    migration: pgToken.migration ?? "",
                    withdrawnAmounts: pgToken.withdrawnAmounts ?? "",
                    poolInfo: pgToken.poolInfo ?? "",
                    lockLpTxId: pgToken.lockLpTxId ?? "",
                    withdrawnAt: pgToken.withdrawnAt ? new Date(pgToken.withdrawnAt) : new Date(0),
                    migratedAt: new Date()
                  };
                  await this.Migration.create([migrationRecord], { session });
                }
              });
              successCount++;
            } finally {
              await session.endSession();
            }
          } catch (error) {
            failureCount++;

            try {
              await this.mongoDb.Token.deleteOne({
                contractAddress: pgToken.mint,
                chain: "solana",
                chainId: SolanaNetworkIds.Mainnet
              });
              deletedCount++;
            } catch (deleteError) {
              logger.error({
                err: deleteError,
                msg: `Failed to delete problematic token ${pgToken.mint}`
              });
            }

            if (pgToken.marketId) {
              const failedMigration: IMigration = {
                status: 'failed',
                contractAddress: pgToken.mint as AddressLike,
                chain: "solana",
                chainId: SolanaNetworkIds.Mainnet as number,
                creator: pgToken.creator || 'system',
                marketId: pgToken.marketId,
                positionIds: [],
                nftMinted: Array.isArray(pgToken.nftMinted)
                  ? pgToken.nftMinted
                  : typeof pgToken.nftMinted === "string"
                    ? [pgToken.nftMinted]
                    : [],
                positionNftsSecrets: [],
                baseVault: pgToken.baseVault ?? "",
                quoteVault: pgToken.quoteVault ?? "",
                withdrawnAmount: pgToken.withdrawnAmount ?? 0,
                migration: pgToken.migration ?? "",
                withdrawnAmounts: pgToken.withdrawnAmounts ?? "",
                poolInfo: pgToken.poolInfo ?? "",
                lockLpTxId: pgToken.lockLpTxId ?? "",
                withdrawnAt: pgToken.withdrawnAt ? new Date(pgToken.withdrawnAt) : new Date(0),
                migratedAt: new Date()
              };
              await this.Migration.create(failedMigration);
            }
          }
        }
        
        offset += batchSize;
      }

      logger.info(`Token sync completed. Total: ${offset}, Success: ${successCount}, Failed: ${failureCount}, Deleted: ${deletedCount}, Skipped: ${skippedCount}`);
    } catch (error) {
      logger.error("Error syncing tokens:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    logger.info("Closing PostgreSQL connection...");
    await this.pgPool.end();
    logger.info("PostgreSQL connection closed");
  }
} 