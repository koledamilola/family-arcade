-- =====================================================================
--  Family Arcade - database setup (v2: many families)
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  Safe to run more than once.
--
--  Structure:  Platform admin  ->  Families  ->  Parents (family admins)
--                                             ->  Adults
--                                             ->  Kids (username + PIN)
--
--  All writes go through the website's server (secret key) after it checks
--  permissions. The rules below decide what each signed-in person can READ.
-- =====================================================================

-- ---------- Families --------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- People ----------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  family_id          uuid references public.families (id) on delete cascade,
  member_role        text check (member_role in ('parent', 'adult', 'kid')),
  is_platform_admin  boolean not null default false,
  display_name       text not null default 'Player',
  username           text unique,                 -- only for kid (username + PIN) accounts
  avatar_url         text,
  avatar_emoji       text not null default '🙂',
  email              text,
  created_at         timestamptz not null default now(),
  constraint profiles_family_role check ((family_id is null) = (member_role is null))
);
create index if not exists profiles_family_idx on public.profiles (family_id);

-- Every new sign-up gets a profile with no family yet. They then create a
-- family (becoming its parent) or join one with an invite code.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'Player'), '@', 1)
    ), 40),
    new.raw_user_meta_data ->> 'avatar_url',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Invites ---------------------------------------------------
create table if not exists public.family_invites (
  code        text primary key,
  family_id   uuid not null references public.families (id) on delete cascade,
  role        text not null check (role in ('parent', 'adult')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_by     uuid references public.profiles (id) on delete set null,
  used_at     timestamptz
);
create index if not exists family_invites_family_idx on public.family_invites (family_id);

-- ---------- Helper checks used by the security rules ------------------
-- The visitor's family, but only while that family is active.
create or replace function public.my_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.family_id from public.profiles p
  join public.families f on f.id = p.family_id
  where p.id = auth.uid() and f.status = 'active';
$$;

create or replace function public.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.families f on f.id = p.family_id
    where p.id = auth.uid() and p.member_role = 'parent' and f.status = 'active');
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_platform_admin);
$$;

-- ---------- Games -----------------------------------------------------
-- status: draft (being made) -> pending (a kid asked to publish; waits for a parent)
--         -> published (on the family arcade) | rejected (sent back with a note)
--         hidden = taken off the arcade by a parent.
create table if not exists public.games (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  slug             text not null,
  title            text not null,
  description      text not null default '',
  creator_name     text not null default '',
  category         text not null default 'Other',
  controls         text not null default '',
  thumbnail_url    text,
  cover_emoji      text not null default '🎮',
  cover_color      text not null default 'sky',
  kind             text not null check (kind in ('html', 'zip', 'url')),
  storage_prefix   text,          -- folder in the "games" bucket (html / zip games)
  entry_path       text,          -- e.g. index.html
  external_url     text,          -- for games hosted somewhere else
  has_scores       boolean not null default false,
  score_label      text not null default 'Score',
  lower_is_better  boolean not null default false,
  supports_touch   boolean not null default false,
  supports_gamepad boolean not null default false,
  status           text not null default 'published'
                   check (status in ('draft', 'pending', 'published', 'hidden', 'rejected')),
  review_note      text,
  share_token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  share_enabled    boolean not null default true,
  play_count       integer not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint games_family_slug unique (family_id, slug)
);
create index if not exists games_family_status_idx on public.games (family_id, status);

create table if not exists public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.games (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  score      double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists scores_game_idx on public.scores (game_id, score);

-- Is this game on the visitor's own family arcade?
create or replace function public.is_family_game(p_game_id uuid, p_published_only boolean default true)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.family_id = public.my_family_id()
      and (not p_published_only or g.status = 'published'));
$$;

-- Game list with like counts (follows the security rules of whoever asks).
drop view if exists public.game_cards;
create view public.game_cards with (security_invoker = true) as
  select g.*,
         (select count(*) from public.likes l where l.game_id = g.id)::int as like_count
  from public.games g;

-- ---------- Security rules (Row Level Security) -----------------------
alter table public.families       enable row level security;
alter table public.profiles       enable row level security;
alter table public.family_invites enable row level security;
alter table public.games          enable row level security;
alter table public.likes          enable row level security;
alter table public.favorites      enable row level security;
alter table public.scores         enable row level security;

drop policy if exists "members see their family" on public.families;
create policy "members see their family" on public.families
  for select using (id = public.my_family_id() or public.is_platform_admin());

drop policy if exists "see own, family, or everyone if platform admin" on public.profiles;
create policy "see own, family, or everyone if platform admin" on public.profiles
  for select using (id = auth.uid() or family_id = public.my_family_id() or public.is_platform_admin());

drop policy if exists "parents see their invites" on public.family_invites;
create policy "parents see their invites" on public.family_invites
  for select using (public.is_parent() and family_id = public.my_family_id());

drop policy if exists "family sees its games" on public.games;
create policy "family sees its games" on public.games
  for select using (
    public.is_platform_admin()
    or (family_id = public.my_family_id()
        and (status = 'published' or created_by = auth.uid() or public.is_parent()))
  );

drop policy if exists "family sees likes" on public.likes;
create policy "family sees likes" on public.likes
  for select using (public.is_family_game(game_id, false));
drop policy if exists "like as yourself" on public.likes;
create policy "like as yourself" on public.likes
  for insert with check (user_id = auth.uid() and public.is_family_game(game_id));
drop policy if exists "unlike as yourself" on public.likes;
create policy "unlike as yourself" on public.likes
  for delete using (user_id = auth.uid());

drop policy if exists "see own favorites" on public.favorites;
create policy "see own favorites" on public.favorites
  for select using (user_id = auth.uid());
drop policy if exists "favorite as yourself" on public.favorites;
create policy "favorite as yourself" on public.favorites
  for insert with check (user_id = auth.uid() and public.is_family_game(game_id));
drop policy if exists "unfavorite as yourself" on public.favorites;
create policy "unfavorite as yourself" on public.favorites
  for delete using (user_id = auth.uid());

drop policy if exists "family sees scores" on public.scores;
create policy "family sees scores" on public.scores
  for select using (public.is_family_game(game_id, false));
drop policy if exists "score as yourself" on public.scores;
create policy "score as yourself" on public.scores
  for insert with check (user_id = auth.uid() and public.is_family_game(game_id));

-- ---------- Handy functions ------------------------------------------
create or replace function public.record_play(p_game_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_family_game(p_game_id) then return; end if;
  update public.games set play_count = play_count + 1 where id = p_game_id;
end;
$$;

-- Best score per player for a game, top 10.
create or replace function public.game_leaderboard(p_game_id uuid)
returns table (user_id uuid, display_name text, avatar_emoji text, avatar_url text,
               best double precision, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare lower_better boolean;
begin
  if not public.is_family_game(p_game_id, false) then return; end if;
  select g.lower_is_better into lower_better from public.games g where g.id = p_game_id;
  lower_better := coalesce(lower_better, false);
  return query
    select p.id, p.display_name, p.avatar_emoji, p.avatar_url, b.best, b.achieved_at
    from (
      select distinct on (s.user_id) s.user_id, s.score as best, s.created_at as achieved_at
      from public.scores s
      where s.game_id = p_game_id
      order by s.user_id,
               case when lower_better then s.score end asc,
               case when not lower_better then s.score end desc,
               s.created_at asc
    ) b
    join public.profiles p on p.id = b.user_id
    order by case when lower_better then b.best end asc,
             case when not lower_better then b.best end desc,
             b.achieved_at asc
    limit 10;
end;
$$;

revoke execute on function public.record_play(uuid) from anon;
revoke execute on function public.game_leaderboard(uuid) from anon;

-- ---------- AI connection, usage and limits (Phase 2) ---------------
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

-- ---------- Game Studio (Phase 3) -----------------------------------
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

-- ---------- Kid login lockout -----------------------------------------
-- Counts wrong PINs per kid username so PINs can't be guessed one by one.
-- Only the website's server (secret key) uses this; nobody else can read it.
create table if not exists public.kid_login_failures (
  username     text primary key,
  failures     integer not null default 0,
  locked_until timestamptz
);
alter table public.kid_login_failures enable row level security;
revoke all on public.kid_login_failures from anon, authenticated;

-- ---------- File storage ----------------------------------------------
-- "games" holds uploaded game files; "thumbnails" holds cover pictures.
-- Uploads only happen through the website's server (with the secret key),
-- so no upload rules are needed here. Files live in random, unguessable folders.
insert into storage.buckets (id, name, public)
values ('games', 'games', true), ('thumbnails', 'thumbnails', true)
on conflict (id) do update set public = excluded.public;

-- =====================================================================
--  AFTER you sign up on the site and create your family, make yourself
--  the platform admin (can see and manage every family) with:
--
--  update public.profiles set is_platform_admin = true where email = 'you@example.com';
-- =====================================================================
