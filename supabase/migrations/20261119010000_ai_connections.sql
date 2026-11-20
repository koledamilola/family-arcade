-- =====================================================================
--  Phase 2: each family's AI connection, a usage log, and spending limits.
--  Safe to run more than once. (Also included in schema.sql for new installs.)
-- =====================================================================

-- One AI connection per family. The key is encrypted by the website (AI_KEY_SECRET)
-- before it is stored, and nobody can read this table except the website's server.
create table if not exists public.ai_connections (
  family_id        uuid primary key references public.families (id) on delete cascade,
  provider         text not null check (provider in ('openrouter', 'anthropic', 'openai', 'google')),
  key_ciphertext   text not null,
  key_hint         text not null,                 -- last few characters, to recognise the key
  model            text not null,                 -- the model games are built with
  price_in         numeric(10, 4) not null default 0,  -- USD per 1M input tokens
  price_out        numeric(10, 4) not null default 0,  -- USD per 1M output tokens
  connected_by     uuid references public.profiles (id) on delete set null,
  connected_at     timestamptz not null default now(),
  last_checked_at  timestamptz,
  last_error       text
);
alter table public.ai_connections enable row level security;
revoke all on public.ai_connections from anon, authenticated;

-- Every AI request, so parents can see spending and limits can be enforced.
create table if not exists public.ai_usage (
  id             bigint generated always as identity primary key,
  family_id      uuid not null references public.families (id) on delete cascade,
  user_id        uuid references public.profiles (id) on delete set null,
  provider       text not null,
  model          text not null,
  purpose        text not null default 'build',
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(12, 6) not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_family_idx on public.ai_usage (family_id, created_at);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;

drop policy if exists "parents see family usage, people see their own" on public.ai_usage;
create policy "parents see family usage, people see their own" on public.ai_usage
  for select using (
    user_id = auth.uid()
    or (public.is_parent() and family_id = public.my_family_id())
  );

-- Spending limits (US dollars per calendar month).
--  kids:       their own limit if set, otherwise the family's kid default
--  grown-ups:  their own limit if set, otherwise no limit
alter table public.families
  add column if not exists kid_monthly_limit_usd numeric(8, 2) not null default 5;
alter table public.profiles
  add column if not exists ai_monthly_limit_usd numeric(8, 2),
  add column if not exists ai_enabled boolean not null default true;
