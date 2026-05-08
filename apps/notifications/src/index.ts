/**
 * Notifications service entrypoint.
 *
 * Run modes:
 *   - default: long-running poll loop, sleep `NOTIFICATIONS_POLL_INTERVAL_MS`
 *     between ticks. Optional HTTP webhook server on
 *     NOTIFICATIONS_HTTP_PORT for indexer-driven triggers.
 *   - NOTIFICATIONS_RUN_ONCE=1: one tick, then exit (cron-friendly).
 *   - NOTIFICATIONS_DRY_RUN=1: format + log payloads, do not POST anywhere.
 *
 * Env:
 *   DATABASE_URL                  (required)
 *   DISCORD_LAUNCHES_WEBHOOK_URL  (default discord fallback)
 *   TELEGRAM_BOT_TOKEN            (default telegram bot)
 *   TELEGRAM_LAUNCHES_CHAT_ID     (default telegram chat)
 *   PUBLIC_LAUNCH_URL_PREFIX      (e.g. https://waifu.fun)
 *   NOTIFICATIONS_POLL_INTERVAL_MS (default 30000)
 *   NOTIFICATIONS_SUMMARY_DELAY_MS (default 86400000)
 *   NOTIFICATIONS_RUN_ONCE        (default unset)
 *   NOTIFICATIONS_DRY_RUN         (default unset)
 *   NOTIFICATIONS_HTTP_PORT       (default unset; if set, start webhook listener)
 *   NOTIFICATIONS_WEBHOOK_TOKEN   (Bearer token for webhook auth)
 */

import { type IncomingMessage, type ServerResponse, createServer } from "node:http";

import { type NotifierRuntimeWithDb, createNotifierRuntime } from "./lib/runtime.js";
import { findLaunchById, findLaunchByVault } from "./lib/repo.js";
import { pollOnce } from "./triggers/poller.js";
import { type WebhookRequestBody, handleWebhook } from "./triggers/webhook.js";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonBody(req: IncomingMessage, maxBytes = 1024 * 64): Promise<unknown> {
	const chunks: Buffer[] = [];
	let length = 0;
	for await (const chunk of req) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		length += buf.length;
		if (length > maxBytes) {
			throw new Error("request body too large");
		}
		chunks.push(buf);
	}
	const raw = Buffer.concat(chunks).toString("utf8");
	if (raw.length === 0) return {};
	return JSON.parse(raw);
}

function startHttpServer(runtime: NotifierRuntimeWithDb, port: number): ReturnType<typeof createServer> {
	const expectedToken = process.env.NOTIFICATIONS_WEBHOOK_TOKEN ?? "";

	const lookup = async (body: WebhookRequestBody) => {
		if (body.launch_id) return findLaunchById(runtime.db, body.launch_id);
		if (body.vault_address) return findLaunchByVault(runtime.db, body.vault_address);
		return null;
	};

	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		void (async () => {
			if (req.method === "GET" && req.url === "/healthz") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
				return;
			}

			if (req.method !== "POST" || req.url !== "/webhook") {
				res.writeHead(404, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "not found" }));
				return;
			}

			const auth = req.headers.authorization ?? "";
			if (!expectedToken || auth !== `Bearer ${expectedToken}`) {
				res.writeHead(401, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
				return;
			}

			let body: WebhookRequestBody;
			try {
				body = (await readJsonBody(req)) as WebhookRequestBody;
			} catch (error) {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "bad json" }));
				return;
			}

			try {
				const result = await handleWebhook(runtime, body, lookup);
				const status = result.ok ? 200 : 404;
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify(result));
			} catch (error) {
				runtime.logger.error(
					{ err: error instanceof Error ? error.message : String(error) },
					"webhook handler threw",
				);
				res.writeHead(500, { "content-type": "application/json" });
				res.end(
					JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
				);
			}
		})();
	});

	server.listen(port, () => {
		runtime.logger.info({ port }, "notifications webhook server listening");
	});
	return server;
}

async function main(): Promise<void> {
	const runtime = createNotifierRuntime();
	const runOnce = process.env.NOTIFICATIONS_RUN_ONCE === "1";
	const httpPort = process.env.NOTIFICATIONS_HTTP_PORT ? Number(process.env.NOTIFICATIONS_HTTP_PORT) : null;

	runtime.logger.info(
		{
			pollIntervalMs: runtime.config.pollIntervalMs,
			summaryDelayMs: runtime.config.summaryDelayMs,
			dryRun: runtime.config.dryRun,
			runOnce,
			httpPort,
			defaultDiscord: !!runtime.config.defaultDiscordWebhookUrl,
			defaultTelegram: !!runtime.config.defaultTelegramBotToken && !!runtime.config.defaultTelegramChatId,
		},
		"notifications service booting",
	);

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		runtime.logger.info({ signal }, "shutting down notifications service");
		stopped = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => onSignal(signal));
	}

	const server = httpPort != null && !runOnce ? startHttpServer(runtime, httpPort) : null;

	do {
		try {
			const summary = await pollOnce(runtime);
			runtime.logger.info(
				{
					scanned: summary.scanned,
					dispatched: summary.dispatched,
					skipped: summary.skipped,
					failed: summary.failed,
					byEvent: summary.byEvent,
				},
				"poll tick complete",
			);
		} catch (error) {
			runtime.logger.error(
				{ err: error instanceof Error ? error.message : String(error) },
				"poll tick failed",
			);
		}

		if (runOnce || stopped) break;
		await delay(runtime.config.pollIntervalMs);
	} while (!stopped);

	if (server) {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}

	runtime.logger.info("notifications service exited cleanly");
}

void main().catch((error: unknown) => {
	console.error("notifications service boot failed", error);
	process.exit(1);
});
