/**
 * Thin HTTP client for the 48 Club Puissant private RPC.
 *
 * Endpoint: https://puissant-bsc.48.club
 * Method:   eth_sendPrivateTransaction
 *   params: [signedRawTransaction] (hex string with 0x prefix)
 *   result: transaction hash on success, JSON-RPC error on failure
 *
 * Reference: https://docs.48.club/puissant-builder/send-privatetransaction
 */

export interface PuissantClient {
	/** Returns the txHash that Puissant accepted for inclusion. Throws on RPC error. */
	sendPrivateRawTransaction(rawTx: string): Promise<string>;
}

export interface PuissantClientOptions {
	endpoint?: string;
	fetchImpl?: typeof fetch;
	requestTimeoutMs?: number;
}

const DEFAULT_ENDPOINT = "https://puissant-bsc.48.club";
const DEFAULT_TIMEOUT_MS = 5_000;
const PUISSANT_SEND_PRIVATE_TRANSACTION_METHOD = "eth_sendPrivateTransaction";

interface JsonRpcResponse<T> {
	jsonrpc: "2.0";
	id: number | string;
	result?: T;
	error?: { code: number; message: string };
}

export class PuissantRpcError extends Error {
	readonly code: number;
	constructor(code: number, message: string) {
		super(`puissant rpc error (${code}): ${message}`);
		this.name = "PuissantRpcError";
		this.code = code;
	}
}

export function createPuissantClient(options: PuissantClientOptions = {}): PuissantClient {
	const endpoint = options.endpoint ?? process.env.PUISSANT_ENDPOINT ?? DEFAULT_ENDPOINT;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

	if (!fetchImpl) {
		throw new Error("global fetch not available; pass options.fetchImpl");
	}

	return {
		async sendPrivateRawTransaction(rawTx: string): Promise<string> {
			if (!rawTx || !rawTx.startsWith("0x")) {
				throw new Error("rawTx must be a 0x-prefixed hex string");
			}

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

			let response: Response;
			try {
				response = await fetchImpl(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: PUISSANT_SEND_PRIVATE_TRANSACTION_METHOD,
						params: [rawTx],
					}),
					signal: controller.signal,
				});
			} finally {
				clearTimeout(timeout);
			}

			if (!response.ok) {
				const text = await response.text().catch(() => "<unreadable>");
				throw new Error(`puissant http ${response.status}: ${text}`);
			}

			const body = (await response.json()) as JsonRpcResponse<string>;
			if (body.error) {
				throw new PuissantRpcError(body.error.code, body.error.message);
			}
			if (typeof body.result !== "string" || body.result.length === 0 || body.result === "0x") {
				throw new PuissantRpcError(-1, `unexpected result: ${JSON.stringify(body.result)}`);
			}
			return body.result;
		},
	};
}
