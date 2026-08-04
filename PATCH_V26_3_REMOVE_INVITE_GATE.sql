-- V26.3: remove the old invitation-only registration gate.
-- Run only in the separate Supabase project for the ROO website.

begin;

-- This patch targets the V26/V26.1 profile structure.
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing. Run MIGRATE_TO_V26_1_SAFE.sql first.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='status'
  ) then
    raise exception 'Old profiles structure detected. Run MIGRATE_TO_V26_1_SAFE.sql first.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='requested_unit_id'
  ) then
    raise exception 'V26 profiles structure is incomplete. Run MIGRATE_TO_V26_1_SAFE.sql first.';
  end if;
end $$;

-- Remove both historical registration triggers.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_roo on auth.users;

drop function if exists public.handle_new_auth_user() cascade;
drop function if exists public.handle_new_user() cascade;

create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- Every new account is accepted as a pending request. No invitation is required.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(
    id, email, full_name, phone, role, status, requested_unit_id
  )
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'phone',''),
    'pending',
    'pending',
    public.try_uuid(new.raw_user_meta_data->>'requested_unit_id')
  )
  on conflict(id) do update set
    email = excluded.email,
    full_name = case
      when public.profiles.full_name is null or public.profiles.full_name = ''
      then excluded.full_name else public.profiles.full_name end,
    phone = case
      when public.profiles.phone is null or public.profiles.phone = ''
      then excluded.phone else public.profiles.phone end,
    updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Restore profiles for accounts that already exist in Supabase Authentication.
insert into public.profiles(
  id, email, full_name, phone, role, status, requested_unit_id
)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name',''),
  coalesce(u.raw_user_meta_data->>'phone',''),
  'pending',
  'pending',
  public.try_uuid(u.raw_user_meta_data->>'requested_unit_id')
from auth.users u
on conflict(id) do nothing;

grant execute on function public.try_uuid(text) to anon, authenticated;

commit;
