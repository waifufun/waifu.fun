import * as dotenv from "dotenv";
dotenv.config();
// Set environment variables before any imports
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://mock";
process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

// Prevent actual database connection
import logger from "@waifufun/logger";
import sinon from "sinon";

// Mock logger globally
sinon.stub(logger, "info").returns();
sinon.stub(logger, "error").returns();
