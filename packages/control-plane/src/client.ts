import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getControlPlaneSupabaseEnv } from "./env";
import type { ControlPlaneDatabase } from "./types";

export type ControlPlaneClient = SupabaseClient<ControlPlaneDatabase>;

let cachedClient: ControlPlaneClient | undefined;

export interface CreateControlPlaneClientOptions {
	supabaseUrl?: string;
	supabaseServiceRoleKey?: string;
}

export function createControlPlaneServerClient(options: CreateControlPlaneClientOptions = {}): ControlPlaneClient {
	const env = getControlPlaneSupabaseEnv({
		...process.env,
		...(options.supabaseUrl ? { SUPABASE_URL: options.supabaseUrl } : {}),
		...(options.supabaseServiceRoleKey ? { SUPABASE_SERVICE_ROLE_KEY: options.supabaseServiceRoleKey } : {}),
	});

	return createClient<ControlPlaneDatabase>(env.supabaseUrl, env.supabaseServiceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
		global: {
			headers: {
				"x-waifufun-client": "control-plane",
			},
		},
	});
}

export function getControlPlaneServerClient(): ControlPlaneClient {
	cachedClient ??= createControlPlaneServerClient();
	return cachedClient;
}
