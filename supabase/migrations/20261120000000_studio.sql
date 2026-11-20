-- =====================================================================
--  Phase 3: the Game Studio (chat + live preview for making games with AI).
--  Safe to run more than once. (Also included in schema.sql for new installs.)
-- =====================================================================

-- One project per game someone is making.
--  stage: interview (coach asking questions) -> plan (plan written, waiting for OK)
--         -> built (has a playable version) ; submitted/published live on the linked game
create table if not exists public.studio_projects (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  title       text not null default 'New game',
  stage       text not null default 'interview' check (stage in ('interview', 'plan', 'built')),
  plan        jsonb,                         -- the agreed game plan
  game_id     uuid references public.games (id) on delete set null,  -- set once shared to the arcade
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists studio_projects_owner_idx on public.studio_projects (owner_id, updated_at desc);
create index if not exists studio_projects_family_idx on public.studio_projects (family_id, updated_at desc);

-- The conversation with the coach. `data` holds extras (suggestion chips, the plan, version number).
create table if not exists public.studio_messages (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.studio_projects (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'system')),
  kind        text not null default 'chat' check (kind in ('chat', 'plan', 'build', 'error', 'note')),
  content     text not null,
  data        jsonb,
  cost_usd    numeric(12, 6) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists studio_messages_project_idx on public.studio_messages (project_id, id);

-- Every playable version of the game, so you can go back.
create table if not exists public.studio_versions (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references public.studio_projects (id) on delete cascade,
  version     integer not null,
  html        text not null,
  summary     text not null default '',
  created_at  timestamptz not null default now(),
  unique (project_id, version)
);

-- Readable by the maker and by their family's parents. All writes go through the server.
alter table public.studio_projects enable row level security;
alter table public.studio_messages enable row level security;
alter table public.studio_versions enable row level security;

create or replace function public.can_see_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.studio_projects sp
    where sp.id = p_project_id
      and (sp.owner_id = auth.uid() or (public.is_parent() and sp.family_id = public.my_family_id())));
$$;

drop policy if exists "maker and parents see projects" on public.studio_projects;
create policy "maker and parents see projects" on public.studio_projects
  for select using (public.can_see_project(id));
drop policy if exists "maker and parents see messages" on public.studio_messages;
create policy "maker and parents see messages" on public.studio_messages
  for select using (public.can_see_project(project_id));
drop policy if exists "maker and parents see versions" on public.studio_versions;
create policy "maker and parents see versions" on public.studio_versions
  for select using (public.can_see_project(project_id));
