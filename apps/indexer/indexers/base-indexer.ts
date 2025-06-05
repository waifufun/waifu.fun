import logger from "@autofun/logger";
import type { ProcessingStats } from "../types";

export abstract class BaseIndexer {
	protected isShuttingDown = false;
	protected retryAttempts = 0;
	protected maxRetryAttempts = 10;
	protected reconnectAttempts = 0;
	protected maxReconnectAttempts = 50;
	protected healthCheckInterval?: NodeJS.Timeout;
	protected debugStatements = false;
	protected lastSuccessfulOperation = Date.now();

	constructor() {
		this.setupGlobalErrorHandlers();
	}

	protected setupGlobalErrorHandlers(): void {
		process.on("uncaughtException", (error) => {
			logger.error("Uncaught Exception:", error);
			this.handleCriticalError(error);
		});

		process.on("unhandledRejection", (reason, promise) => {
			logger.error("Unhandled Rejection at:", promise, "reason:", reason);
			this.handleCriticalError(new Error(`Unhandled rejection: ${reason}`));
		});

		process.on("SIGTERM", () => this.gracefulShutdown("SIGTERM"));
		process.on("SIGINT", () => this.gracefulShutdown("SIGINT"));
	}

	protected async handleCriticalError(error: Error): Promise<void> {
		try {
			logger.error("Critical error occurred, attempting recovery:", error);

			await this.resetConnections();
			await this.exponentialBackoff(this.retryAttempts);

			this.retryAttempts++;

			if (this.retryAttempts < this.maxRetryAttempts) {
				logger.info(`Attempting recovery (${this.retryAttempts}/${this.maxRetryAttempts})`);
			} else {
				logger.error("Max retry attempts reached, forcing restart...");
				process.exit(1);
			}
		} catch (recoveryError) {
			logger.error("Recovery failed:", recoveryError);
			process.exit(1);
		}
	}

	protected async exponentialBackoff(attempt: number): Promise<void> {
		const baseDelay = 1000;
		const maxDelay = 60000;
		const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);

		logger.info(`Waiting ${delay}ms before retry (attempt ${attempt + 1})`);
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	protected async gracefulShutdown(signal: string): Promise<void> {
		logger.info(`Received ${signal}, initiating graceful shutdown...`);
		this.isShuttingDown = true;

		try {
			if (this.healthCheckInterval) {
				clearInterval(this.healthCheckInterval);
			}

			await this.cleanup();

			await new Promise((resolve) => setTimeout(resolve, 2000));

			logger.info("Graceful shutdown completed");
			process.exit(0);
		} catch (error) {
			logger.error("Error during graceful shutdown:", error);
			process.exit(1);
		}
	}

	protected async safeAsyncOperation<T>(
		operation: () => Promise<T>,
		operationName: string,
		maxRetries = 3,
	): Promise<T | null> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				if (this.isShuttingDown) {
					logger.info(`Skipping ${operationName} - shutting down`);
					return null;
				}

				const result = await operation();
				this.lastSuccessfulOperation = Date.now();
				return result;
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			} catch (error: any) {
				lastError = error;
				logger.warn(`${operationName} failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);

				if (this.isNetworkError(error)) {
					logger.info("Network error detected, resetting connections...");
					await this.resetConnections();
				}

				if (attempt < maxRetries - 1) {
					await this.exponentialBackoff(attempt);
				}
			}
		}

		logger.error(`${operationName} failed after ${maxRetries} attempts:`, lastError);
		return null;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	protected isNetworkError(error: any): boolean {
		// can't think of any more, feel free to add more
		const networkErrorMessages = [
			"ECONNRESET",
			"ENOTFOUND",
			"ECONNREFUSED",
			"ETIMEDOUT",
			"socket hang up",
			"network timeout",
			"fetch failed",
			"WebSocket",
			"connection closed",
		];

		const errorMessage = error?.message?.toLowerCase() || "";
		return networkErrorMessages.some((msg) => errorMessage.includes(msg.toLowerCase()));
	}

	protected logFinalSummary(totalStats: ProcessingStats, showLogs = false): void {
		const totalDuration = Date.now() - totalStats.startTime;
		const finalSignaturesPerSecond = ((totalStats.processedSignatures / totalDuration) * 1000).toFixed(2);
		const averageTimePerSignature = (totalDuration / totalStats.processedSignatures).toFixed(2);
		const eventsPerSignature = (totalStats.events / totalStats.processedSignatures).toFixed(4);

		if (showLogs) {
			logger.info(`
        === INDEXING COMPLETE ===
        Total signatures processed: ${totalStats.processedSignatures}
        Total events found: ${totalStats.events}
        Total time: ${totalDuration}ms (${(totalDuration / 1000 / 60).toFixed(2)} minutes)
        Average signatures per second: ${finalSignaturesPerSecond}
        Average time per signature: ${Number.isFinite(Number(averageTimePerSignature)) ? averageTimePerSignature : "N/A"}
        Events per signature: ${Number.isNaN(Number(eventsPerSignature)) ? "N/A" : eventsPerSignature}
      `);
		}
	}

	protected abstract resetConnections(): Promise<void>;
	protected abstract cleanup(): Promise<void>;
	protected abstract performHealthCheck(): Promise<void>;

	public abstract runWithRealTimeSync(): Promise<void>;
}
