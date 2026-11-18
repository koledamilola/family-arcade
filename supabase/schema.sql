-- =====================================================================
--  Family Arcade - database setup
--  Paste this whole file into Supabase > SQL Editor > New query > Run.
--  Safe to run more than once.
-- =====================================================================

-- ---------- People ----------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'Player',
  username      text unique,                 -- only for kid (username + PIN) accounts
  avatar_url    text,
  avatar_emoji  text not null default '🙂',
  role          text not null default 'pending'
                check (role in ('pending', 'player', 'admin')),
  is_kid        boolean not null default false,
  email         text,
  created_at    timestamptz not null default now()
);

-- Every new sign-up gets a profile that starts as "pending" (waiting for approval).
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

-- Helper checks used by the security rules below.
create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role in ('player', 'admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin');
$$;

-- ---------- Games -----------------------------------------------------
create table if not exists public.games (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
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
  published        boolean not null default true,
  play_count       integer not null default 0,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

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

-- Game list with like counts (follows the security rules of whoever asks).
create or replace view public.game_cards with (security_invoker = true) as
  select g.*,
         (select count(*) from public.likes l where l.game_id = g.id)::int as like_count
  from public.games g;

-- ---------- Security rules (Row Level Security) -----------------------
alter table public.profiles  enable row level security;
alter table public.games     enable row level security;
alter table public.likes     enable row level security;
alter table public.favorites enable row level security;
alter table public.scores    enable row level security;

drop policy if exists "see own or approved see all" on public.profiles;
create policy "see own or approved see all" on public.profiles
  for select using (id = auth.uid() or public.is_approved());
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "approved see published games" on public.games;
create policy "approved see published games" on public.games
  for select using (public.is_admin() or (published and public.is_approved()));
drop policy if exists "admins manage games" on public.games;
create policy "admins manage games" on public.games
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "approved see likes" on public.likes;
create policy "approved see likes" on public.likes
  for select using (public.is_approved());
drop policy if exists "like as yourself" on public.likes;
create policy "like as yourself" on public.likes
  for insert with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "unlike as yourself" on public.likes;
create policy "unlike as yourself" on public.likes
  for delete using (user_id = auth.uid());

drop policy if exists "see own favorites" on public.favorites;
create policy "see own favorites" on public.favorites
  for select using (user_id = auth.uid());
drop policy if exists "favorite as yourself" on public.favorites;
create policy "favorite as yourself" on public.favorites
  for insert with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "unfavorite as yourself" on public.favorites;
create policy "unfavorite as yourself" on public.favorites
  for delete using (user_id = auth.uid());

drop policy if exists "approved see scores" on public.scores;
create policy "approved see scores" on public.scores
  for select using (public.is_approved());
drop policy if exists "score as yourself" on public.scores;
create policy "score as yourself" on public.scores
  for insert with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "admins delete scores" on public.scores;
create policy "admins delete scores" on public.scores
  for delete using (public.is_admin());

-- ---------- Handy functions ------------------------------------------
create or replace function public.record_play(p_game_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved() then return; end if;
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
  if not public.is_approved() then return; end if;
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
--  AFTER you sign in to the site for the first time, make yourself admin
--  by running this (with your own email address):
--
--  update public.profiles set role = 'admin' where email = 'you@example.com';
-- =====================================================================
