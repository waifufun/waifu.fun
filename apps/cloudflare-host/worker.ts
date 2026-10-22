import { DurableObject } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";

interface Env {
	SERVICE: DurableObjectNamespace<WaifuService | WaifuBackgroundService>;
	SERVICE_ENABLED: string;
	SERVICE_NAME: string;
	RUNTIME_CONFIG?: string;
}

const SERVICES = new Set([
	"api",
	"worker",
	"evm-indexer",
	"launch-indexer",
	"bundle-bot",
	"nav-snapshotter",
	"tier-cron",
]);

function runtimeSettings(env: Env): Record<string, string> {
	if (!SERVICES.has(env.SERVICE_NAME)) throw new TypeError("Unknown service");
	const config: unknown = JSON.parse(env.RUNTIME_CONFIG ?? "null");
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		throw new TypeError("RUNTIME_CONFIG must contain the existing service settings");
	}
	const settings: Record<string, string> = {};
	for (const [key, value] of Object.entries(config)) {
		if (typeof value !== "string") throw new TypeError("Service settings must be strings");
		if (!key.startsWith("RAILWAY_")) settings[key] = value;
	}
	if (settings.SERVICE_NAME !== env.SERVICE_NAME) {
		throw new TypeError("Runtime settings belong to a different service");
	}
	if (!settings.DATABASE_URL) throw new TypeError("DATABASE_URL is required");
	for (const key of ["DATABASE_URL", "REDIS_URL"]) {
		if (settings[key] && new URL(settings[key]).hostname.endsWith(".railway.internal")) {
			throw new TypeError(`${key} is not reachable from Cloudflare`);
		}
	}
	return settings;
}

export class WaifuService extends Container<Env> {
	defaultPort = 3100;
	sleepAfter = "30m";

	constructor(ctx: ConstructorParameters<typeof Container<Env>>[0], env: Env) {
		super(ctx, env);
		const settings = runtimeSettings(env);
		if (env.SERVICE_NAME === "api") {
			const port = Number(settings.API_PORT ?? "3100");
			if (!Number.isInteger(port) || port < 1 || port > 65535) {
				throw new TypeError("API_PORT is invalid");
			}
			this.defaultPort = port;
			settings.API_HOST = "0.0.0.0";
		}
		this.envVars = settings;
	}

	async keepAlive(): Promise<void> {
		await this.startAndWaitForPorts();
		this.renewActivityTimeout();
	}
}

const INACTIVITY_MS = 30 * 60 * 1000;

export class WaifuBackgroundService extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		if (ctx.container?.running) {
			ctx.blockConcurrencyWhile(() => ctx.container!.setInactivityTimeout(INACTIVITY_MS));
		}
	}

	async keepAlive(): Promise<void> {
		const container = this.ctx.container;
		if (!container) throw new Error("Background container is not configured");
		const settings = runtimeSettings(this.env);
		if (this.env.SERVICE_NAME === "api") throw new TypeError("API requires the HTTP container host");
		if (!container.running) {
			container.start({ env: settings, enableInternet: true });
			this.ctx.waitUntil(
				container.monitor().catch((error: unknown) => {
					console.error("Background container failed", error);
				}),
			);
		}
		await container.setInactivityTimeout(INACTIVITY_MS);
	}

	async stop(): Promise<void> {
		if (this.ctx.container?.running) this.ctx.container.signal(15);
	}

	async getState(): Promise<{ status: string }> {
		return { status: this.ctx.container?.running ? "running" : "stopped" };
	}
}

async function stopInactive(env: Env): Promise<void> {
	if (env.RUNTIME_CONFIG) await env.SERVICE.get(env.SERVICE.idFromName("service")).stop();
}

export default {
	async scheduled(_event: ScheduledController, env: Env): Promise<void> {
		if (env.SERVICE_ENABLED !== "true") {
			await stopInactive(env);
			return;
		}
		await env.SERVICE.get(env.SERVICE.idFromName("service")).keepAlive();
	},
	async fetch(request: Request, env: Env): Promise<Response> {
		if (env.SERVICE_ENABLED !== "true") {
			await stopInactive(env);
			return new Response("Service deployment inactive", { status: 503 });
		}
		if (env.SERVICE_NAME !== "api") return new Response("Not found", { status: 404 });
		return env.SERVICE.get(env.SERVICE.idFromName("service")).fetch(request);
	},
};
