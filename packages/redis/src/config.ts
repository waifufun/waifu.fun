export const defaultRedisUrl = "redis://127.0.0.1:6379";

export interface RedisEnv {
	NODE_ENV?: string | undefined;
	REDIS_URL?: string | undefined;
	REDIS_USERNAME?: string | undefined;
	REDIS_PASSWORD?: string | undefined;
	REDIS_DB?: string | undefined;
	REDIS_TLS?: string | undefined;
}

export function getRedisUrl(env: RedisEnv = process.env): string {
	const url = env.REDIS_URL?.trim();
	if (url) {
		assertRedisUrlAllowed(url, env);
		return url;
	}

	if (env.NODE_ENV === "production") {
		throw new Error("REDIS_URL is required in production");
	}

	return defaultRedisUrl;
}

type RedisEnvOptions = {
	username?: string;
	password?: string;
	db?: number;
	tls?: Record<string, never>;
};

export function redisOptionsFromEnv(env?: RedisEnv): RedisEnvOptions;
export function redisOptionsFromEnv<TOptions extends object>(
	env: RedisEnv,
	options: TOptions,
): TOptions & RedisEnvOptions;
export function redisOptionsFromEnv(
	env: RedisEnv = process.env,
	options: { tls?: Record<string, never> } & Record<string, unknown> = {},
): RedisEnvOptions & Record<string, unknown> {
	const redisUrl = env.REDIS_URL?.trim();
	const parsedUrl = redisUrl ? parseRedisUrl(redisUrl) : null;
	const tlsEnabled = env.REDIS_TLS === "1" || env.REDIS_TLS?.toLowerCase() === "true";

	return {
		...options,
		...(env.REDIS_USERNAME ? { username: env.REDIS_USERNAME } : {}),
		...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
		...(env.REDIS_DB ? { db: Number(env.REDIS_DB) } : {}),
		...(parsedUrl?.protocol === "rediss:" || tlsEnabled ? { tls: options.tls ?? {} } : {}),
	};
}

export function assertRedisUrlAllowed(rawUrl: string, env: RedisEnv = process.env): void {
	const parsedUrl = parseRedisUrl(rawUrl);
	if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
		throw new Error(`Unsupported Redis URL protocol: ${parsedUrl.protocol}`);
	}

	if (env.NODE_ENV !== "production") {
		return;
	}

	if (!hasRedisPassword(parsedUrl, env)) {
		throw new Error("REDIS_URL must include credentials or REDIS_PASSWORD must be set in production");
	}
}

export function hasRedisPassword(redisUrl: URL, env: RedisEnv = process.env): boolean {
	return redisUrl.password.length > 0 || Boolean(env.REDIS_PASSWORD);
}

function parseRedisUrl(rawUrl: string): URL {
	try {
		return new URL(rawUrl);
	} catch (error) {
		throw new Error("REDIS_URL must be a valid URL", { cause: error });
	}
}
