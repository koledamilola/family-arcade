-- =====================================================================
--  Upgrade from v1 (one family, pending/player/admin roles) to v2 (many families).
--  Run this ONCE on a v1 database, then run supabase/schema.sql.
--  New installs only need schema.sql.
--
--  What it does with existing data:
--   - creates one family owned by the first admin
--   - admins -> parents, kids -> kids, approved players -> adults
--   - people still "pending" are left without a family (they can be invited)
--   - the first admin becomes the platform admin
--   - every game moves into that family (shown = published, hidden = hidden)
-- =====================================================================

-- Old rules depend on the old columns and helpers.
drop policy if exists "see own or approved see all" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
drop policy if exists "approved see published games" on public.games;
drop policy if exists "admins manage games" on public.games;
drop policy if exists "approved see likes" on public.likes;
drop policy if exists "like as yourself" on public.likes;
drop policy if exists "favorite as yourself" on public.favorites;
drop policy if exists "approved see scores" on public.scores;
drop policy if exists "score as yourself" on public.scores;
drop policy if exists "admins delete scores" on public.scores;
drop view if exists public.game_cards;

create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.profiles
  add column if not exists family_id uuid references public.families (id) on delete cascade,
  add column if not exists member_role text check (member_role in ('parent', 'adult', 'kid')),
  add column if not exists is_platform_admin boolean not null default false;

alter table public.games
  add column if not exists family_id uuid references public.families (id) on delete cascade,
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'pending', 'published', 'hidden', 'rejected')),
  add column if not exists review_note text,
  add column if not exists share_token text unique default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists share_enabled boolean not null default true;

do $$
declare
  owner_id uuid;
  owner_name text;
  fam uuid;
begin
  select id, display_name into owner_id, owner_name
  from public.profiles where role = 'admin' order by created_at limit 1;

  if owner_id is not null then
    insert into public.families (name, created_by)
    values (left(split_part(owner_name, ' ', 1) || '''s Family', 60), owner_id)
    returning id into fam;

    update public.profiles set
      family_id = fam,
      member_role = case when role = 'admin' then 'parent' when is_kid then 'kid' else 'adult' end
    where role <> 'pending';

    update public.profiles set is_platform_admin = true where id = owner_id;

    update public.games set
      family_id = fam,
      status = case when published then 'published' else 'hidden' end;
  end if;
end $$;

-- Games that couldn't be placed in a family (no admin existed) are removed.
delete from public.games where family_id is null;

update public.games set share_token = replace(gen_random_uuid()::text, '-', '') where share_token is null;
alter table public.games alter column family_id set not null;
alter table public.games alter column share_token set not null;
alter table public.games drop column if exists published;
alter table public.games drop constraint if exists games_slug_key;
alter table public.games add constraint games_family_slug unique (family_id, slug);

alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists is_kid;
alter table public.profiles add constraint profiles_family_role check ((family_id is null) = (member_role is null));

drop function if exists public.is_approved();
drop function if exists public.is_admin();
