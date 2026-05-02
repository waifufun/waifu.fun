import { Writable } from "node:stream";

import pino, { type Logger } from "pino";

export type { Logger };

export interface CreateLoggerOptions {
	service: string;
	level?: string | undefined;
	lokiUrl?: string | undefined;
	lokiUser?: string | undefined;
	lokiToken?: string | undefined;
}

export interface LokiLogEntryOptions {
	lokiUrl?: string | undefined;
	lokiUser?: string | undefined;
	lokiToken?: string | undefined;
	service: string;
	agentId?: string | null | undefined;
	eventType?: string | null | undefined;
	line: Record<string, unknown>;
	timestamp?: Date | undefined;
}

type JsonLike = string | number | boolean | null | readonly JsonLike[] | { readonly [key: string]: JsonLike };

type ParsedJsonLine = { readonly [key: string]: JsonLike };

const isProduction = process.env.NODE_ENV === "production";

export function createLogger(opts: CreateLoggerOptions): Logger {
	const level = opts.level ?? "info";
	const stream = opts.lokiUrl
		? createStructuredLogStream({ ...opts, level })
		: isProduction
			? process.stdout
			: createPrettyStdoutStream(opts.service);

	return pino(
		{
			name: opts.service,
			level,
			base: { service: opts.service },
			timestamp: pino.stdTimeFunctions.isoTime,
		},
		stream,
	);
}

export function logAgentEventToLoki(opts: LokiLogEntryOptions): void {
	if (!opts.lokiUrl) return;

	const labels: Record<string, string> = { service: opts.service };
	if (opts.agentId) labels.agentId = opts.agentId;
	if (opts.eventType) labels.eventType = opts.eventType;

	void pushToLoki({
		labels,
		line: opts.line,
		...(opts.lokiUrl !== undefined ? { lokiUrl: opts.lokiUrl } : {}),
		...(opts.lokiUser !== undefined ? { lokiUser: opts.lokiUser } : {}),
		...(opts.lokiToken !== undefined ? { lokiToken: opts.lokiToken } : {}),
		...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
	}).catch(() => undefined);
}

function createStructuredLogStream(opts: CreateLoggerOptions & { level: string }): Writable {
	let buffer = "";

	return new Writable({
		write(chunk, _encoding, callback) {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (line.trim().length === 0) continue;
				process.stdout.write(`${line}\n`);

				void pushLogLineToLoki(opts, line).catch(() => undefined);
			}

			callback();
		},
	});
}

function createPrettyStdoutStream(service: string): Writable {
	return new Writable({
		write(chunk, _encoding, callback) {
			for (const line of chunk.toString().split("\n")) {
				if (line.trim().length === 0) continue;
				process.stdout.write(`${prettyLine(service, line)}\n`);
			}
			callback();
		},
	});
}

async function pushLogLineToLoki(opts: CreateLoggerOptions, line: string): Promise<void> {
	const parsed = parseJsonObject(line);
	const labels: Record<string, string> = { service: opts.service };
	if (parsed && typeof parsed.requestId === "string") labels.requestId = parsed.requestId;

	const linePayload: Record<string, unknown> = parsed ?? { message: line };

	await pushToLoki({
		labels,
		line: linePayload,
		...(opts.lokiUrl !== undefined ? { lokiUrl: opts.lokiUrl } : {}),
		...(opts.lokiUser !== undefined ? { lokiUser: opts.lokiUser } : {}),
		...(opts.lokiToken !== undefined ? { lokiToken: opts.lokiToken } : {}),
	});
}

async function pushToLoki(opts: {
	lokiUrl?: string;
	lokiUser?: string;
	lokiToken?: string;
	labels: Record<string, string>;
	line: Record<string, unknown>;
	timestamp?: Date | undefined;
}): Promise<void> {
	if (!opts.lokiUrl) return;

	const url = opts.lokiUrl.replace(/\/$/, "").endsWith("/loki/api/v1/push")
		? opts.lokiUrl
		: `${opts.lokiUrl.replace(/\/$/, "")}/loki/api/v1/push`;
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (opts.lokiUser || opts.lokiToken) {
		headers.authorization = `Basic ${Buffer.from(`${opts.lokiUser ?? ""}:${opts.lokiToken ?? ""}`).toString("base64")}`;
	}

	const ts = BigInt((opts.timestamp ?? new Date()).getTime()) * 1_000_000n;
	await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify({
			streams: [
				{
					stream: opts.labels,
					values: [[ts.toString(), JSON.stringify(opts.line)]],
				},
			],
		}),
	});
}

function prettyLine(service: string, line: string): string {
	const parsed = parseJsonObject(line);
	if (!parsed) return line;

	const time = typeof parsed.time === "string" ? parsed.time : new Date().toISOString();
	const level = levelName(parsed.level).padEnd(5);
	const message = typeof parsed.msg === "string" ? parsed.msg : "";
	const requestId = typeof parsed.requestId === "string" ? ` requestId=${parsed.requestId}` : "";
	return `${time} ${level} [${service}]${requestId} ${message}`.trimEnd();
}

function levelName(level: JsonLike | undefined): string {
	if (typeof level !== "number") return "info";
	if (level >= 60) return "fatal";
	if (level >= 50) return "error";
	if (level >= 40) return "warn";
	if (level >= 30) return "info";
	if (level >= 20) return "debug";
	return "trace";
}

function parseJsonObject(line: string): ParsedJsonLine | null {
	try {
		const parsed: unknown = JSON.parse(line);
		if (isParsedJsonLine(parsed)) return parsed;
	} catch {
		// not JSON
	}
	return null;
}

function isParsedJsonLine(value: unknown): value is ParsedJsonLine {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultService = process.env.WAIFUFUN_LOG_SERVICE ?? "waifufun";
const logger = createLogger({ service: defaultService });

export default logger;
