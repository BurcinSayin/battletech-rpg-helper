-- Minimal auth-support schema for build step #2.
-- The full schema (campaigns, characters, RLS helpers, RPCs) lands in step #3.

-- profiles: 1:1 with auth.users, created automatically by a signup trigger.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is inserted. SECURITY
-- DEFINER so the insert bypasses RLS; empty search_path is a hardening best
-- practice (forces fully-qualified names below).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- RLS: a user may read and update only their own profile. Inserts are owned by
-- the SECURITY DEFINER trigger above, so no user-facing insert policy.
-- (Cross-campaign read access is added in step #3.)
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
