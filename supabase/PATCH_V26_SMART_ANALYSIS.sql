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
