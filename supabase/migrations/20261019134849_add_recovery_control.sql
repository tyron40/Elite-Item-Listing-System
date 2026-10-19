-- Recovery control is an Edge Function API. Pairing and device credentials
-- are never accessible through the browser Data API, including to their owner.
create table public.recovery_pairings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index recovery_pairings_owner_created on public.recovery_pairings(owner_id, created_at desc);
create table public.recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  report jsonb not null default '{}'::jsonb,
  target_os text not null default 'unknown' check (target_os in ('unknown','windows','macos','chromeos','linux')),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index recovery_sessions_owner_created on public.recovery_sessions(owner_id, created_at desc);
create table public.recovery_commands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.recovery_sessions(id) on delete cascade,
  kind text not null check (kind in ('scan','download_toolkit','reboot_firmware')),
  status text not null default 'queued' check (status in ('queued','dispatched','completed','failed','declined','expired')),
  payload jsonb not null default '{}'::jsonb,
  result text,
  progress jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index recovery_commands_session_created on public.recovery_commands(session_id, created_at desc);
create unique index recovery_commands_one_active on public.recovery_commands(session_id) where status in ('queued','dispatched');

alter table public.recovery_pairings enable row level security;
alter table public.recovery_sessions enable row level security;
alter table public.recovery_commands enable row level security;
revoke all on public.recovery_pairings, public.recovery_sessions, public.recovery_commands from public, anon, authenticated;
grant all on public.recovery_pairings, public.recovery_sessions, public.recovery_commands to service_role;
-- No browser-role policies: only the authenticated Edge handler has access.
