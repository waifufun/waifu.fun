import { runWorker } from "./worker.js";

const intervalMs = Number(process.env.BRAIN_POLL_INTERVAL_MS ?? 5000);
const batchSize = Number(process.env.BRAIN_BATCH_SIZE ?? 10);
const rateLimitMs = Number(process.env.BRAIN_RATE_LIMIT_MS ?? 5 * 60 * 1000);

runWorker({ intervalMs, batchSize, rateLimitMs }).catch((err) => {
	console.error(err);
	process.exit(1);
});
