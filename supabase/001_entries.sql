-- Current Song: diary entries table.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  listened_on        date not null default current_date,

  -- the song (a label only; no audio is ever stored)
  deezer_id          bigint,
  artist             text not null,
  title              text not null,
  cover_url          text,

  -- my feeling
  words              text not null check (length(trim(words)) > 0),
  energy             real not null check (energy between 0 and 1),
  positivity         real not null check (positivity between 0 and 1),
  color              text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  first_listen       boolean not null default false,
  understands_lyrics boolean not null default false,

  -- the frozen card settings chosen by the AI
  card               jsonb
);

create index if not exists entries_user_listened on public.entries (user_id, listened_on desc);

-- Lock every row to its owner.
alter table public.entries enable row level security;

drop policy if exists "read own entries"   on public.entries;
drop policy if exists "add own entries"    on public.entries;
drop policy if exists "delete own entries" on public.entries;

create policy "read own entries"   on public.entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "add own entries"    on public.entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "delete own entries" on public.entries for delete to authenticated using ((select auth.uid()) = user_id);

-- Only signed-in users can reach the table at all. No update: saved cards are frozen.
revoke all on public.entries from anon, authenticated;
grant select, insert, delete on public.entries to authenticated;
