export function buildControlPlaneDdl(schemaName: string): string {
	const schema = quoteIdentifier(schemaName);

	return `
create schema if not exists ${schema};

create table if not exists ${schema}.users (
	wallet_address text primary key,
	source_mongo_id text unique,
	display_name text,
	avatar_url text,
	verified boolean not null default false,
	suspended boolean not null default false,
	twitter text,
	points numeric,
	weekly_points numeric,
	admin_role text,
	admin_permissions jsonb,
	admin_created_by text,
	admin_created_at timestamptz,
	source_created_at timestamptz,
	source_updated_at timestamptz,
	backfilled_at timestamptz not null default timezone('utc', now())
);

create table if not exists ${schema}.token_control_plane (
	chain text not null,
	chain_id integer not null,
	contract_address text not null,
	source_mongo_id text unique,
	creator_wallet_address text,
	creator_user_id text,
	creator_user_wallet_address text,
	launch_type text,
	launch_platform text,
	owner_claim_status text,
	owner_wallets_solana text[] not null default '{}',
	owner_wallets_evm text[] not null default '{}',
	agent_character_config jsonb,
	source_created_at timestamptz,
	source_updated_at timestamptz,
	backfilled_at timestamptz not null default timezone('utc', now()),
	primary key (chain, chain_id, contract_address)
);

create table if not exists ${schema}.runtime_agents (
	chain text not null,
	chain_id integer not null,
	contract_address text not null,
	source_token_mongo_id text,
	source_agent_mongo_id text,
	cloud_agent_id text,
	runtime_provider text,
	agent_status text,
	agent_lifecycle_state text,
	billing_mode text,
	infra_reserve_usd numeric,
	web_ui_url text,
	bridge_url text,
	suspended_reason text,
	last_heartbeat_at timestamptz,
	last_claimed_at timestamptz,
	last_trade_at timestamptz,
	suspend_at timestamptz,
	revive_at timestamptz,
	source_created_at timestamptz,
	source_updated_at timestamptz,
	backfilled_at timestamptz not null default timezone('utc', now()),
	primary key (chain, chain_id, contract_address)
);

create unique index if not exists runtime_agents_cloud_agent_id_unique
	on ${schema}.runtime_agents (cloud_agent_id)
	where cloud_agent_id is not null;

create index if not exists runtime_agents_status_idx
	on ${schema}.runtime_agents (agent_status, agent_lifecycle_state);

create table if not exists ${schema}.launch_gate_allowlist (
	wallet_address text primary key,
	source_mongo_id text unique,
	added_by text,
	source_created_at timestamptz,
	source_updated_at timestamptz,
	backfilled_at timestamptz not null default timezone('utc', now())
);

create table if not exists ${schema}.invite_codes (
	code text primary key,
	source_mongo_id text unique,
	max_uses integer not null,
	used_count integer not null default 0,
	created_by text,
	expires_at timestamptz,
	active boolean not null default true,
	source_created_at timestamptz,
	source_updated_at timestamptz,
	backfilled_at timestamptz not null default timezone('utc', now())
);

create table if not exists ${schema}.invite_code_redemptions (
	invite_code text not null references ${schema}.invite_codes(code) on delete cascade,
	wallet_address text not null,
	redeemed_at timestamptz,
	source_invite_mongo_id text,
	source_position integer,
	backfilled_at timestamptz not null default timezone('utc', now()),
	primary key (invite_code, wallet_address)
);

create index if not exists invite_code_redemptions_wallet_idx
	on ${schema}.invite_code_redemptions (wallet_address);
`;
}

function quoteIdentifier(input: string): string {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) {
		throw new Error(`Invalid schema name: ${input}`);
	}

	return `"${input.replaceAll('"', '""')}"`;
}
