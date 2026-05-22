create extension if not exists pgcrypto;

create type public.control_plane_chain as enum ('solana', 'evm');
create type public.control_plane_wallet_link_source as enum ('manual', 'self_claim', 'admin', 'import', 'sync');
create type public.control_plane_ownership_status as enum ('unclaimed', 'claimed', 'verified', 'disputed');
create type public.control_plane_launch_type as enum ('native', 'imported');
create type public.control_plane_launch_platform as enum ('pump', 'flap', 'external', 'unknown');
create type public.control_plane_runtime_provider as enum ('eliza-cloud', 'unknown');
create type public.control_plane_agent_status as enum ('none', 'provisioning', 'running', 'suspended', 'failed', 'deleted');
create type public.control_plane_lifecycle_state as enum ('birth', 'live', 'dormant', 'reviving');
create type public.control_plane_billing_mode as enum ('owner_credits', 'waifu_treasury_subsidy', 'hybrid');

create or replace function public.control_plane_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.control_plane_users (
  id uuid primary key default gen_random_uuid(),
  external_auth_id text unique,
  display_name text,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.control_plane_wallet_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.control_plane_users (id) on delete set null,
  chain public.control_plane_chain not null,
  chain_id bigint not null check (chain_id > 0),
  address text not null check (length(trim(address)) > 0),
  normalized_address text not null check (length(trim(normalized_address)) > 0),
  label text,
  link_source public.control_plane_wallet_link_source not null default 'manual',
  verified_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (chain, chain_id, normalized_address)
);

create index control_plane_wallet_identities_user_id_idx
  on public.control_plane_wallet_identities (user_id);

create table public.control_plane_token_ownerships (
  id uuid primary key default gen_random_uuid(),
  token_chain public.control_plane_chain not null,
  token_chain_id bigint not null check (token_chain_id > 0),
  contract_address text not null check (length(trim(contract_address)) > 0),
  normalized_contract_address text not null check (length(trim(normalized_contract_address)) > 0),
  launch_type public.control_plane_launch_type,
  launch_platform public.control_plane_launch_platform not null default 'unknown',
  owner_claim_status public.control_plane_ownership_status not null default 'unclaimed',
  creator_wallet_identity_id uuid references public.control_plane_wallet_identities (id) on delete set null,
  creator_user_id uuid references public.control_plane_users (id) on delete set null,
  owner_wallet_identity_id uuid references public.control_plane_wallet_identities (id) on delete set null,
  owner_user_id uuid references public.control_plane_users (id) on delete set null,
  claimed_at timestamptz,
  verified_at timestamptz,
  ownership_source text not null default 'manual',
  ownership_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (token_chain, token_chain_id, normalized_contract_address)
);

create index control_plane_token_ownerships_creator_wallet_identity_id_idx
  on public.control_plane_token_ownerships (creator_wallet_identity_id);

create index control_plane_token_ownerships_owner_wallet_identity_id_idx
  on public.control_plane_token_ownerships (owner_wallet_identity_id);

create index control_plane_token_ownerships_owner_claim_status_idx
  on public.control_plane_token_ownerships (owner_claim_status);

create table public.control_plane_token_runtime_states (
  id uuid primary key default gen_random_uuid(),
  token_ownership_id uuid not null references public.control_plane_token_ownerships (id) on delete cascade,
  token_chain public.control_plane_chain not null,
  token_chain_id bigint not null check (token_chain_id > 0),
  contract_address text not null check (length(trim(contract_address)) > 0),
  normalized_contract_address text not null check (length(trim(normalized_contract_address)) > 0),
  cloud_agent_id text,
  runtime_provider public.control_plane_runtime_provider not null default 'eliza-cloud',
  agent_status public.control_plane_agent_status not null default 'none',
  lifecycle_state public.control_plane_lifecycle_state,
  billing_mode public.control_plane_billing_mode,
  infra_reserve_usd numeric(18, 2),
  reserve_url text,
  web_ui_url text,
  bridge_url text,
  status_reason text,
  last_heartbeat_at timestamptz,
  last_status_changed_at timestamptz,
  suspended_at timestamptz,
  resumed_at timestamptz,
  deleted_at timestamptz,
  runtime_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (token_ownership_id),
  unique (token_chain, token_chain_id, normalized_contract_address)
);

create index control_plane_token_runtime_states_cloud_agent_id_idx
  on public.control_plane_token_runtime_states (cloud_agent_id);

create index control_plane_token_runtime_states_agent_status_idx
  on public.control_plane_token_runtime_states (agent_status, lifecycle_state);

create table public.control_plane_launch_gate_allowlist (
  id uuid primary key default gen_random_uuid(),
  wallet_identity_id uuid references public.control_plane_wallet_identities (id) on delete set null,
  chain public.control_plane_chain not null,
  chain_id bigint not null check (chain_id > 0),
  address text not null check (length(trim(address)) > 0),
  normalized_address text not null check (length(trim(normalized_address)) > 0),
  added_by_user_id uuid references public.control_plane_users (id) on delete set null,
  added_by_wallet_identity_id uuid references public.control_plane_wallet_identities (id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (chain, chain_id, normalized_address)
);

create index control_plane_launch_gate_allowlist_wallet_identity_id_idx
  on public.control_plane_launch_gate_allowlist (wallet_identity_id);

create table public.control_plane_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(trim(code))),
  created_by_user_id uuid references public.control_plane_users (id) on delete set null,
  created_by_wallet_identity_id uuid references public.control_plane_wallet_identities (id) on delete set null,
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz,
  disabled_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index control_plane_invite_codes_active_idx
  on public.control_plane_invite_codes (disabled_at, expires_at, created_at desc);

create table public.control_plane_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references public.control_plane_invite_codes (id) on delete cascade,
  redeemed_by_wallet_identity_id uuid not null references public.control_plane_wallet_identities (id) on delete cascade,
  redeemed_by_user_id uuid references public.control_plane_users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (invite_code_id, redeemed_by_wallet_identity_id)
);

create index control_plane_invite_redemptions_wallet_identity_id_idx
  on public.control_plane_invite_redemptions (redeemed_by_wallet_identity_id, created_at desc);

create trigger control_plane_users_set_updated_at
before update on public.control_plane_users
for each row
execute function public.control_plane_set_updated_at();

create trigger control_plane_wallet_identities_set_updated_at
before update on public.control_plane_wallet_identities
for each row
execute function public.control_plane_set_updated_at();

create trigger control_plane_token_ownerships_set_updated_at
before update on public.control_plane_token_ownerships
for each row
execute function public.control_plane_set_updated_at();

create trigger control_plane_token_runtime_states_set_updated_at
before update on public.control_plane_token_runtime_states
for each row
execute function public.control_plane_set_updated_at();

create trigger control_plane_launch_gate_allowlist_set_updated_at
before update on public.control_plane_launch_gate_allowlist
for each row
execute function public.control_plane_set_updated_at();

create trigger control_plane_invite_codes_set_updated_at
before update on public.control_plane_invite_codes
for each row
execute function public.control_plane_set_updated_at();

alter table public.control_plane_users enable row level security;
alter table public.control_plane_wallet_identities enable row level security;
alter table public.control_plane_token_ownerships enable row level security;
alter table public.control_plane_token_runtime_states enable row level security;
alter table public.control_plane_launch_gate_allowlist enable row level security;
alter table public.control_plane_invite_codes enable row level security;
alter table public.control_plane_invite_redemptions enable row level security;

revoke all on public.control_plane_users from anon, authenticated;
revoke all on public.control_plane_wallet_identities from anon, authenticated;
revoke all on public.control_plane_token_ownerships from anon, authenticated;
revoke all on public.control_plane_token_runtime_states from anon, authenticated;
revoke all on public.control_plane_launch_gate_allowlist from anon, authenticated;
revoke all on public.control_plane_invite_codes from anon, authenticated;
revoke all on public.control_plane_invite_redemptions from anon, authenticated;

grant all on public.control_plane_users to service_role;
grant all on public.control_plane_wallet_identities to service_role;
grant all on public.control_plane_token_ownerships to service_role;
grant all on public.control_plane_token_runtime_states to service_role;
grant all on public.control_plane_launch_gate_allowlist to service_role;
grant all on public.control_plane_invite_codes to service_role;
grant all on public.control_plane_invite_redemptions to service_role;

create or replace function public.control_plane_redeem_invite_code(
  p_code text,
  p_redeemed_by_wallet_identity_id uuid,
  p_redeemed_by_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  redemption_id uuid,
  invite_code_id uuid,
  code text,
  used_count integer,
  max_uses integer,
  remaining_uses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.control_plane_invite_codes%rowtype;
  v_redemption public.control_plane_invite_redemptions%rowtype;
begin
  if trim(coalesce(p_code, '')) = '' then
    raise exception 'Invite code is required';
  end if;

  select *
  into v_invite
  from public.control_plane_invite_codes
  where code = upper(trim(p_code))
    and disabled_at is null
    and (expires_at is null or expires_at > timezone('utc', now()))
  for update;

  if not found then
    raise exception 'Invite code is invalid or unavailable';
  end if;

  select *
  into v_redemption
  from public.control_plane_invite_redemptions
  where invite_code_id = v_invite.id
    and redeemed_by_wallet_identity_id = p_redeemed_by_wallet_identity_id;

  if found then
    return query
    select
      v_redemption.id,
      v_invite.id,
      v_invite.code,
      v_invite.used_count,
      v_invite.max_uses,
      greatest(v_invite.max_uses - v_invite.used_count, 0);
    return;
  end if;

  if v_invite.used_count >= v_invite.max_uses then
    raise exception 'Invite code has no remaining uses';
  end if;

  insert into public.control_plane_invite_redemptions (
    invite_code_id,
    redeemed_by_wallet_identity_id,
    redeemed_by_user_id,
    metadata
  )
  values (
    v_invite.id,
    p_redeemed_by_wallet_identity_id,
    p_redeemed_by_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_redemption;

  update public.control_plane_invite_codes
  set used_count = used_count + 1,
      updated_at = timezone('utc', now())
  where id = v_invite.id
  returning * into v_invite;

  return query
  select
    v_redemption.id,
    v_invite.id,
    v_invite.code,
    v_invite.used_count,
    v_invite.max_uses,
    greatest(v_invite.max_uses - v_invite.used_count, 0);
end;
$$;

grant execute on function public.control_plane_redeem_invite_code(text, uuid, uuid, jsonb) to service_role;
revoke all on function public.control_plane_redeem_invite_code(text, uuid, uuid, jsonb) from public, anon, authenticated;
