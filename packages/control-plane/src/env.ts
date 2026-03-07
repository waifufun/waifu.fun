export const SUPABASE_URL_ENV_KEY = "SUPABASE_URL";
export const SUPABASE_SERVICE_ROLE_KEY_ENV_KEY = "SUPABASE_SERVICE_ROLE_KEY";

export interface ControlPlaneSupabaseEnv {
	supabaseUrl: string;
	supabaseServiceRoleKey: string;
}

function requireEnv(value: string | undefined, key: string): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new Error(`Missing required Supabase environment variable: ${key}`);
	}

	return trimmed;
}

export function getControlPlaneSupabaseEnv(env: NodeJS.ProcessEnv = process.env): ControlPlaneSupabaseEnv {
	return {
		supabaseUrl: requireEnv(env[SUPABASE_URL_ENV_KEY], SUPABASE_URL_ENV_KEY),
		supabaseServiceRoleKey: requireEnv(env[SUPABASE_SERVICE_ROLE_KEY_ENV_KEY], SUPABASE_SERVICE_ROLE_KEY_ENV_KEY),
	};
}
