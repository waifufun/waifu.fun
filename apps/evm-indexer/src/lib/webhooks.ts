import type { Logger } from "@waifufun/logger";

export type WebhookEventName = "token.created" | "trade.happened" | "token.graduated";

export interface WebhookPayload<TData extends Record<string, unknown> = Record<string, unknown>> {
	event: WebhookEventName;
	timestamp: string;
	tokenAddress: string;
	chainId: number;
	data: TData;
}

export interface WebhookDispatcher {
	emit<TData extends Record<string, unknown>>(input: {
		event: WebhookEventName;
		tokenAddress: string;
		chainId: number;
		data: TData;
		timestamp?: Date;
	}): void;
}

export interface WebhookDispatcherConfig {
	logger: Logger;
	urls?: string[];
	maxAttempts?: number;
	baseDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWebhookUrls(value = process.env.WEBHOOK_URLS ?? ""): string[] {
	return value
		.split(",")
		.map((url) => url.trim())
		.filter((url) => url.length > 0);
}

function stringifyWebhookPayload(payload: WebhookPayload): string {
	return JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

export function createWebhookDispatcher(config: WebhookDispatcherConfig): WebhookDispatcher {
	const urls = config.urls ?? parseWebhookUrls();
	const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

	async function postWithRetry(url: string, payload: WebhookPayload): Promise<void> {
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const response = await fetch(url, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"X-Waifu-Event": payload.event,
					},
					body: stringifyWebhookPayload(payload),
				});

				if (response.ok) {
					config.logger.debug(
						{ url, event: payload.event, tokenAddress: payload.tokenAddress, attempt },
						"webhook delivered",
					);
					return;
				}

				lastError = new Error(`Webhook ${url} failed with ${response.status}: ${await response.text()}`);
			} catch (error) {
				lastError = error;
			}

			if (attempt < maxAttempts) {
				await sleep(baseDelayMs * 2 ** (attempt - 1));
			}
		}

		config.logger.error(
			{
				url,
				event: payload.event,
				tokenAddress: payload.tokenAddress,
				error: lastError instanceof Error ? lastError.message : String(lastError),
			},
			"webhook dead-lettered after retries",
		);
	}

	return {
		emit(input) {
			if (urls.length === 0) return;

			const payload: WebhookPayload = {
				event: input.event,
				timestamp: (input.timestamp ?? new Date()).toISOString(),
				tokenAddress: input.tokenAddress,
				chainId: input.chainId,
				data: input.data,
			};

			for (const url of urls) {
				void postWithRetry(url, payload);
			}
		},
	};
}
