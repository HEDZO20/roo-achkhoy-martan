-- V25.1 CLEAN PRODUCTION — исправленный SQL.
-- ВАЖНО: выполнять только в отдельном проекте Supabase для РОО, НЕ в проекте LAMAN / vai-market-dev.
begin;
create extension if not exists pgcrypto;

create table if not exists public.departments(
 id uuid primary key default gen_random_uuid(), name text not null unique, email text unique, created_at timestamptz not null default now()
);
insert into public.departments(name,email) values
 ('Воспитательная работа','ruo.ovdo@mail.ru'),('Общий отдел','ruo.npo@mail.ru'),('Методический отдел','infometod@bk.ru'),('Хозяйственный отдел','ruo.khg@mail.ru'),('Информационный отдел','roo.inform@mail.ru') on conflict do nothing;

create table if not exists public.schools(
 id uuid primary key default gen_random_uuid(), name text not null, short_name text, locality text, address text, phone text, email text,
 director_name text, students_total integer, classes_total integer, teachers_total integer, grade9_students integer, grade11_students integer,
 shifts_count integer, capacity integer, profile_status text not null default 'draft' check(profile_status in('draft','submitted','approved','returned')),
 approved_by uuid, approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade, email text, full_name text, phone text,
 role text not null default 'pending' check(role in('pending','roo_head','roo_deputy','department_head','department_staff','school_director','school_staff')),
 status text not null default 'pending' check(status in('pending','active','blocked')),
 department_id uuid references public.departments(id) on delete set null, school_id uuid references public.schools(id) on delete set null,
 requested_unit_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,email,full_name,phone,requested_unit_id)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.raw_user_meta_data->>'phone',''),nullif(new.raw_user_meta_data->>'requested_unit_id','')::uuid)
 on conflict(id) do nothing;
 return new;
end$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.tasks(
 id uuid primary key default gen_random_uuid(), title text not null, description text, status text not null default 'new', due_at timestamptz,
 created_by uuid references public.profiles(id), assigned_department_id uuid references public.departments(id), assigned_school_id uuid references public.schools(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_responses(
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade, author_id uuid references public.profiles(id),
 school_id uuid references public.schools(id), department_id uuid references public.departments(id), text text, status text not null default 'draft',
 submitted_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table if not exists public.exam_imports(
 id uuid primary key default gen_random_uuid(), file_name text not null, data_type text not null check(data_type in('students','summary','note')),
 academic_year text, exam_type text, status text not null default 'processing', total_rows integer default 0, accepted_rows integer default 0,
 rejected_rows integer default 0, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), cancelled_at timestamptz
);
create table if not exists public.exam_results(
 id uuid primary key default gen_random_uuid(), import_id uuid references public.exam_imports(id) on delete cascade, student_name text not null,
 school_id uuid references public.schools(id), school_name_raw text, class_name text, subject text not null, exam_type text, academic_year text,
 score numeric, grade text, status text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.exam_summaries(
 id uuid primary key default gen_random_uuid(), import_id uuid references public.exam_imports(id) on delete cascade, school_id uuid references public.schools(id),
 school_name_raw text not null, participants integer default 0, avg_score numeric, count_5 integer default 0, count_4 integer default 0,
 count_3 integer default 0, count_2 integer default 0, exam_type text, academic_year text, created_by uuid references public.profiles(id), created_at timestamptz default now()
);
create table if not exists public.analysis_notes(
 id uuid primary key default gen_random_uuid(), title text not null, content text, academic_year text, exam_type text,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.audit_log(
 id bigserial primary key, user_id uuid references public.profiles(id), action text not null, entity_type text, entity_id text, details jsonb default '{}'::jsonb, created_at timestamptz default now()
);

create or replace function public.is_roo_manager() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and status='active' and role in('roo_head','roo_deputy'))
$$;
create or replace function public.my_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;
create or replace function public.my_school() returns uuid language sql stable security definer set search_path=public as $$select school_id from profiles where id=auth.uid()$$;
create or replace function public.my_department() returns uuid language sql stable security definer set search_path=public as $$select department_id from profiles where id=auth.uid()$$;

alter table public.profiles enable row level security; alter table public.departments enable row level security; alter table public.schools enable row level security;
alter table public.tasks enable row level security; alter table public.task_responses enable row level security; alter table public.exam_imports enable row level security;
alter table public.exam_results enable row level security; alter table public.exam_summaries enable row level security; alter table public.analysis_notes enable row level security; alter table public.audit_log enable row level security;

do $$declare r record; begin for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in('profiles','departments','schools','tasks','task_responses','exam_imports','exam_results','exam_summaries','analysis_notes','audit_log') loop execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop; end$$;

create policy profiles_self_read on profiles for select to authenticated using(id=auth.uid() or is_roo_manager());
create policy profiles_manager_update on profiles for update to authenticated using(is_roo_manager()) with check(is_roo_manager());
create policy departments_read on departments for select to authenticated using(true);
create policy schools_read on schools for select to authenticated using(is_roo_manager() or id=my_school() or my_role() in('department_head','department_staff'));
create policy schools_manager_all on schools for all to authenticated using(is_roo_manager()) with check(is_roo_manager());
create policy schools_director_update on schools for update to authenticated using(id=my_school() and my_role()='school_director') with check(id=my_school());
create policy tasks_read on tasks for select to authenticated using(is_roo_manager() or assigned_school_id=my_school() or assigned_department_id=my_department() or created_by=auth.uid());
create policy tasks_create on tasks for insert to authenticated with check(my_role() in('roo_head','roo_deputy','department_head') and created_by=auth.uid());
create policy tasks_manage on tasks for update to authenticated using(is_roo_manager() or created_by=auth.uid());
create policy responses_read on task_responses for select to authenticated using(is_roo_manager() or school_id=my_school() or department_id=my_department() or author_id=auth.uid());
create policy responses_write on task_responses for all to authenticated using(author_id=auth.uid() or is_roo_manager()) with check(author_id=auth.uid() or is_roo_manager());
create policy exam_imports_read on exam_imports for select to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff'));
create policy exam_imports_write on exam_imports for all to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff')) with check(is_roo_manager() or my_role() in('department_head','department_staff'));
create policy exam_results_read on exam_results for select to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff') or school_id=my_school());
create policy exam_results_write on exam_results for all to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff')) with check(is_roo_manager() or my_role() in('department_head','department_staff'));
create policy exam_summaries_read on exam_summaries for select to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff') or school_id=my_school());
create policy exam_summaries_write on exam_summaries for all to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff')) with check(is_roo_manager() or my_role() in('department_head','department_staff'));
create policy notes_read on analysis_notes for select to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff'));
create policy notes_write on analysis_notes for all to authenticated using(is_roo_manager() or my_role() in('department_head','department_staff')) with check(is_roo_manager() or my_role() in('department_head','department_staff'));
create policy audit_read on audit_log for select to authenticated using(is_roo_manager());
create policy audit_insert on audit_log for insert to authenticated with check(user_id=auth.uid());

insert into storage.buckets(id,name,public) values('roo-documents','roo-documents',false) on conflict(id) do update set public=false;
drop policy if exists roo_storage_read on storage.objects; drop policy if exists roo_storage_insert on storage.objects; drop policy if exists roo_storage_delete on storage.objects;
create policy roo_storage_read on storage.objects for select to authenticated using(bucket_id='roo-documents');
create policy roo_storage_insert on storage.objects for insert to authenticated with check(bucket_id='roo-documents');
create policy roo_storage_delete on storage.objects for delete to authenticated using(bucket_id='roo-documents' and (select is_roo_manager()));
commit;
-- V26 SMART ANALYSIS
-- Выполнять только в отдельном проекте Supabase сайта РОО.
-- Не выполнять в проекте LAMAN / vai-market-dev.

begin;

create table if not exists public.site_settings(
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_documents(
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  title text,
  academic_year text,
  exam_type text,
  storage_path text,
  analysis_json jsonb not null default '{}'::jsonb,
  tables_count integer not null default 0 check(tables_count >= 0),
  subjects_count integer not null default 0 check(subjects_count >= 0),
  warnings_count integer not null default 0 check(warnings_count >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists exam_documents_created_at_idx on public.exam_documents(created_at desc);
create index if not exists exam_documents_year_idx on public.exam_documents(academic_year, exam_type);

alter table public.site_settings enable row level security;
alter table public.exam_documents enable row level security;

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public' and tablename in ('site_settings','exam_documents')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Логотип и название должны читаться до входа на сайт.
create policy site_settings_public_read
on public.site_settings for select
to anon, authenticated
using (true);

create policy site_settings_roo_head_manage
on public.site_settings for all
to authenticated
using (public.my_role() = 'roo_head')
with check (public.my_role() = 'roo_head');

-- Полный районный анализ может содержать Ф.И.О. и доступен только РОО.
create policy exam_documents_authorized_read
on public.exam_documents for select
to authenticated
using (public.my_role() in ('roo_head','roo_deputy','department_head','department_staff'));

create policy exam_documents_authorized_insert
on public.exam_documents for insert
to authenticated
with check (
  public.my_role() in ('roo_head','roo_deputy','department_head','department_staff')
  and created_by = auth.uid()
);

create policy exam_documents_authorized_update
on public.exam_documents for update
to authenticated
using (public.my_role() in ('roo_head','roo_deputy','department_head','department_staff'))
with check (public.my_role() in ('roo_head','roo_deputy','department_head','department_staff'));

create policy exam_documents_manager_delete
on public.exam_documents for delete
to authenticated
using (public.is_roo_manager());

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
grant select, insert, update, delete on public.exam_documents to authenticated;

-- Публичное хранилище только для логотипа и фирменных изображений.
insert into storage.buckets(id,name,public)
values ('roo-public','roo-public',true)
on conflict(id) do update set public=true;

-- Отдельное закрытое хранилище аналитических документов с персональными данными.
insert into storage.buckets(id,name,public)
values ('roo-exam-analysis','roo-exam-analysis',false)
on conflict(id) do update set public=false;

-- Удаляем только политики V26, чтобы не задеть другие проекты и папки.
drop policy if exists roo_public_read_v26 on storage.objects;
drop policy if exists roo_public_insert_v26 on storage.objects;
drop policy if exists roo_public_update_v26 on storage.objects;
drop policy if exists roo_public_delete_v26 on storage.objects;
drop policy if exists roo_exam_read_v26 on storage.objects;
drop policy if exists roo_exam_insert_v26 on storage.objects;
drop policy if exists roo_exam_update_v26 on storage.objects;
drop policy if exists roo_exam_delete_v26 on storage.objects;

create policy roo_public_read_v26
on storage.objects for select
to anon, authenticated
using (bucket_id='roo-public');

create policy roo_public_insert_v26
on storage.objects for insert
to authenticated
with check (bucket_id='roo-public' and public.my_role()='roo_head');

create policy roo_public_update_v26
on storage.objects for update
to authenticated
using (bucket_id='roo-public' and public.my_role()='roo_head')
with check (bucket_id='roo-public' and public.my_role()='roo_head');

create policy roo_public_delete_v26
on storage.objects for delete
to authenticated
using (bucket_id='roo-public' and public.my_role()='roo_head');

create policy roo_exam_read_v26
on storage.objects for select
to authenticated
using (
  bucket_id='roo-exam-analysis'
  and public.my_role() in ('roo_head','roo_deputy','department_head','department_staff')
);

create policy roo_exam_insert_v26
on storage.objects for insert
to authenticated
with check (
  bucket_id='roo-exam-analysis'
  and public.my_role() in ('roo_head','roo_deputy','department_head','department_staff')
  and (storage.foldername(name))[1] = 'exam-analysis'
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy roo_exam_update_v26
on storage.objects for update
to authenticated
using (
  bucket_id='roo-exam-analysis'
  and public.my_role() in ('roo_head','roo_deputy','department_head','department_staff')
)
with check (
  bucket_id='roo-exam-analysis'
  and public.my_role() in ('roo_head','roo_deputy','department_head','department_staff')
);

create policy roo_exam_delete_v26
on storage.objects for delete
to authenticated
using (bucket_id='roo-exam-analysis' and public.is_roo_manager());

insert into public.site_settings(key,value)
values (
  'branding',
  jsonb_build_object(
    'logo_url','',
    'background','#ffffff',
    'padding',8,
    'short_name','Ачхой-Мартан',
    'subtitle','Отдел образования',
    'full_name','Отдел образования Ачхой-Мартановского района'
  )
)
on conflict(key) do nothing;

commit;
