-- V27 FULL RESTORE
-- Безопасное расширение текущей базы V26. SQL не удаляет существующие данные.
-- Выполнять только в отдельном проекте Supabase сайта РОО.

begin;
create extension if not exists pgcrypto;

-- -------------------- РАСШИРЕНИЕ СУЩЕСТВУЮЩИХ ТАБЛИЦ --------------------
alter table if exists public.tasks add column if not exists priority text not null default 'normal';
alter table if exists public.tasks add column if not exists category text;
alter table if exists public.tasks add column if not exists instructions text;
alter table if exists public.tasks add column if not exists requires_director_approval boolean not null default true;
alter table if exists public.tasks add column if not exists assigned_to_all_schools boolean not null default false;
alter table if exists public.tasks add column if not exists completed_at timestamptz;
alter table if exists public.tasks add column if not exists accepted_at timestamptz;
alter table if exists public.tasks add column if not exists updated_by uuid references public.profiles(id) on delete set null;

alter table if exists public.task_responses add column if not exists version_no integer not null default 1;
alter table if exists public.task_responses add column if not exists response_text text;
alter table if exists public.task_responses add column if not exists director_comment text;
alter table if exists public.task_responses add column if not exists roo_comment text;
alter table if exists public.task_responses add column if not exists updated_at timestamptz not null default now();

alter table if exists public.schools add column if not exists website text;
alter table if exists public.schools add column if not exists deputy_names text;
alter table if exists public.schools add column if not exists responsible_name text;
alter table if exists public.schools add column if not exists responsible_phone text;
alter table if exists public.schools add column if not exists grade1_students integer;
alter table if exists public.schools add column if not exists grade2_students integer;
alter table if exists public.schools add column if not exists grade3_students integer;
alter table if exists public.schools add column if not exists grade4_students integer;
alter table if exists public.schools add column if not exists grade5_students integer;
alter table if exists public.schools add column if not exists grade6_students integer;
alter table if exists public.schools add column if not exists grade7_students integer;
alter table if exists public.schools add column if not exists grade8_students integer;
alter table if exists public.schools add column if not exists grade10_students integer;
alter table if exists public.schools add column if not exists shifts_text text;
alter table if exists public.schools add column if not exists has_meals boolean;
alter table if exists public.schools add column if not exists has_transport boolean;
alter table if exists public.schools add column if not exists internet_quality text;
alter table if exists public.schools add column if not exists building_condition text;
alter table if exists public.schools add column if not exists notes text;

-- -------------------- ПОЛНЫЙ ЦИКЛ ПОРУЧЕНИЙ --------------------
create table if not exists public.task_recipients(
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  status text not null default 'new' check(status in('new','in_progress','director_review','roo_review','accepted','returned','cancelled')),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  submitted_at timestamptz,
  director_reviewed_by uuid references public.profiles(id) on delete set null,
  director_reviewed_at timestamptz,
  roo_reviewed_by uuid references public.profiles(id) on delete set null,
  roo_reviewed_at timestamptz,
  completed_at timestamptz,
  last_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((school_id is not null and department_id is null) or (school_id is null and department_id is not null))
);
create unique index if not exists task_recipients_school_unique on public.task_recipients(task_id,school_id) where school_id is not null;
create unique index if not exists task_recipients_department_unique on public.task_recipients(task_id,department_id) where department_id is not null;
create index if not exists task_recipients_status_idx on public.task_recipients(status,updated_at desc);

create table if not exists public.task_comments(
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  recipient_id uuid references public.task_recipients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  message text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments(
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  bucket_id text not null default 'roo-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_entity_idx on public.attachments(entity_type,entity_id,created_at);

-- -------------------- УВЕДОМЛЕНИЯ --------------------
create table if not exists public.notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  role_target text,
  school_id uuid references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  title text not null,
  body text,
  link_page text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id,is_read,created_at desc);

-- -------------------- ДОКУМЕНТЫ И КАЛЕНДАРЬ --------------------
create table if not exists public.documents(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  document_number text,
  document_date date,
  description text,
  visibility text not null default 'all' check(visibility in('all','roo','departments','schools','private')),
  school_id uuid references public.schools(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  storage_path text,
  file_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'event',
  starts_at timestamptz not null,
  ends_at timestamptz,
  school_id uuid references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -------------------- ОБРАЩЕНИЯ --------------------
create table if not exists public.appeals(
  id uuid primary key default gen_random_uuid(),
  number text unique,
  applicant_name text,
  applicant_contacts text,
  subject text not null,
  message text,
  status text not null default 'new' check(status in('new','in_progress','answered','closed','returned')),
  due_at timestamptz,
  assigned_department_id uuid references public.departments(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  response_text text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------- СОВЕЩАНИЯ --------------------
create table if not exists public.meetings(
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_at timestamptz not null,
  location text,
  agenda text,
  minutes_text text,
  status text not null default 'planned' check(status in('planned','held','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_decisions(
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  decision_text text not null,
  responsible_name text,
  due_at timestamptz,
  task_id uuid references public.tasks(id) on delete set null,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

-- -------------------- ПРОВЕРКИ --------------------
create table if not exists public.inspections(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  inspection_type text,
  planned_at timestamptz,
  completed_at timestamptz,
  inspectors text,
  checklist jsonb not null default '[]'::jsonb,
  findings text,
  recommendations text,
  status text not null default 'planned' check(status in('planned','in_progress','completed','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------------------- ИСТОРИЯ ШКОЛ --------------------
create table if not exists public.school_history(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  action text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -------------------- ШАБЛОНЫ ОТЧЁТОВ --------------------
create table if not exists public.report_templates(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  report_type text not null,
  config jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.report_templates(name,report_type,config,is_system)
select * from (values
 ('Анализ экзаменов по району','exam_district','{"title":"Анализ результатов государственной итоговой аттестации"}'::jsonb,true),
 ('Карточка школы','school_card','{"title":"Информационно-аналитическая карточка школы"}'::jsonb,true),
 ('Исполнение поручений','tasks_summary','{"title":"Сводный отчёт об исполнении поручений"}'::jsonb,true),
 ('Работа отделов','departments_summary','{"title":"Отчёт о работе структурных подразделений"}'::jsonb,true)
) as v(name,report_type,config,is_system)
where not exists(select 1 from public.report_templates r where r.report_type=v.report_type and r.is_system=true);

-- -------------------- СЛУЖЕБНЫЕ ФУНКЦИИ --------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;

create or replace function public.can_manage_department(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select public.is_roo_manager() or exists(select 1 from public.profiles where id=auth.uid() and status='active' and role in('department_head','department_staff') and department_id=target) $$;

create or replace function public.can_manage_school(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select public.is_roo_manager() or exists(select 1 from public.profiles where id=auth.uid() and status='active' and role in('school_director','school_staff') and school_id=target) $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

drop trigger if exists tasks_touch_v27 on public.tasks;
create trigger tasks_touch_v27 before update on public.tasks for each row execute function public.touch_updated_at();
drop trigger if exists recipients_touch_v27 on public.task_recipients;
create trigger recipients_touch_v27 before update on public.task_recipients for each row execute function public.touch_updated_at();
drop trigger if exists responses_touch_v27 on public.task_responses;
create trigger responses_touch_v27 before update on public.task_responses for each row execute function public.touch_updated_at();
drop trigger if exists documents_touch_v27 on public.documents;
create trigger documents_touch_v27 before update on public.documents for each row execute function public.touch_updated_at();
drop trigger if exists appeals_touch_v27 on public.appeals;
create trigger appeals_touch_v27 before update on public.appeals for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch_v27 on public.meetings;
create trigger meetings_touch_v27 before update on public.meetings for each row execute function public.touch_updated_at();
drop trigger if exists inspections_touch_v27 on public.inspections;
create trigger inspections_touch_v27 before update on public.inspections for each row execute function public.touch_updated_at();

-- Автоматически создаём календарное событие для нового поручения.
create or replace function public.task_calendar_sync_v27()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.due_at is not null then
    insert into public.calendar_events(title,description,event_type,starts_at,school_id,department_id,task_id,created_by)
    values('Срок: '||new.title,new.description,'task_due',new.due_at,new.assigned_school_id,new.assigned_department_id,new.id,new.created_by)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists task_calendar_sync_v27 on public.tasks;
create trigger task_calendar_sync_v27 after insert on public.tasks for each row execute function public.task_calendar_sync_v27();

-- -------------------- РЕЙТИНГИ --------------------
drop view if exists public.school_performance_v27;
create view public.school_performance_v27 as
select
  s.id as school_id,
  s.name as school_name,
  count(tr.id) as assigned_count,
  count(tr.id) filter(where tr.status='accepted') as accepted_count,
  count(tr.id) filter(where tr.status='returned') as returned_count,
  count(tr.id) filter(where t.due_at is not null and t.due_at<now() and tr.status not in('accepted','cancelled')) as overdue_count,
  case when count(tr.id)=0 then null else round(
    greatest(0,least(100,
      (count(tr.id) filter(where tr.status='accepted')::numeric/count(tr.id))*100
      - count(tr.id) filter(where tr.status='returned')*4
      - count(tr.id) filter(where t.due_at is not null and t.due_at<now() and tr.status not in('accepted','cancelled'))*6
    )),1) end as rating
from public.schools s
left join public.task_recipients tr on tr.school_id=s.id
left join public.tasks t on t.id=tr.task_id
group by s.id,s.name;

drop view if exists public.department_performance_v27;
create view public.department_performance_v27 as
select
  d.id as department_id,
  d.name as department_name,
  count(tr.id) as assigned_count,
  count(tr.id) filter(where tr.status='accepted') as accepted_count,
  count(tr.id) filter(where tr.status='returned') as returned_count,
  count(tr.id) filter(where t.due_at is not null and t.due_at<now() and tr.status not in('accepted','cancelled')) as overdue_count,
  case when count(tr.id)=0 then null else round(
    greatest(0,least(100,
      (count(tr.id) filter(where tr.status='accepted')::numeric/count(tr.id))*100
      - count(tr.id) filter(where tr.status='returned')*4
      - count(tr.id) filter(where t.due_at is not null and t.due_at<now() and tr.status not in('accepted','cancelled'))*6
    )),1) end as rating
from public.departments d
left join public.task_recipients tr on tr.department_id=d.id
left join public.tasks t on t.id=tr.task_id
group by d.id,d.name;

-- Расширяем доступ к поручениям и профилям для новой структуры получателей.
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using(
  public.is_roo_manager()
  or assigned_school_id=public.my_school()
  or assigned_department_id=public.my_department()
  or created_by=auth.uid()
  or exists(select 1 from public.task_recipients tr where tr.task_id=tasks.id and (tr.school_id=public.my_school() or tr.department_id=public.my_department()))
);

drop policy if exists profiles_self_or_manager_read on public.profiles;
create policy profiles_self_or_manager_read on public.profiles for select to authenticated using(
  id=auth.uid() or public.is_roo_manager()
  or (school_id is not null and school_id=public.my_school() and public.my_role()='school_director')
  or (department_id is not null and department_id=public.my_department() and public.my_role()='department_head')
);

drop policy if exists profiles_manager_update on public.profiles;
create policy profiles_manager_update on public.profiles for update to authenticated using(
  public.is_roo_manager()
  or (school_id=public.my_school() and public.my_role()='school_director')
  or (department_id=public.my_department() and public.my_role()='department_head')
) with check(
  public.is_roo_manager()
  or (school_id=public.my_school() and public.my_role()='school_director')
  or (department_id=public.my_department() and public.my_role()='department_head')
);

-- -------------------- RLS --------------------
do $$
declare t text;
begin
  foreach t in array array['task_recipients','task_comments','attachments','notifications','documents','calendar_events','appeals','meetings','meeting_decisions','inspections','school_history','report_templates'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

-- Удаляем политики V27 перед повторным созданием.
do $$
declare p record;
begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and policyname like 'v27_%' loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

create policy v27_recipients_read on public.task_recipients for select to authenticated using(
  public.is_roo_manager() or public.can_manage_school(school_id) or public.can_manage_department(department_id)
);
create policy v27_recipients_insert on public.task_recipients for insert to authenticated with check(public.my_role() in('roo_head','roo_deputy','department_head'));
create policy v27_recipients_update on public.task_recipients for update to authenticated using(
  public.is_roo_manager() or public.can_manage_school(school_id) or public.can_manage_department(department_id)
) with check(
  public.is_roo_manager() or public.can_manage_school(school_id) or public.can_manage_department(department_id)
);
create policy v27_recipients_delete on public.task_recipients for delete to authenticated using(public.is_roo_manager());

create policy v27_comments_read on public.task_comments for select to authenticated using(
  public.is_roo_manager() or exists(select 1 from public.task_recipients tr where tr.id=recipient_id and (public.can_manage_school(tr.school_id) or public.can_manage_department(tr.department_id)))
);
create policy v27_comments_insert on public.task_comments for insert to authenticated with check(author_id=auth.uid() and public.is_active_user());
create policy v27_comments_delete on public.task_comments for delete to authenticated using(author_id=auth.uid() or public.is_roo_manager());

create policy v27_attachments_read on public.attachments for select to authenticated using(public.is_active_user());
create policy v27_attachments_insert on public.attachments for insert to authenticated with check(uploaded_by=auth.uid() and public.is_active_user());
create policy v27_attachments_delete on public.attachments for delete to authenticated using(uploaded_by=auth.uid() or public.is_roo_manager());

create policy v27_notifications_read on public.notifications for select to authenticated using(
  user_id=auth.uid() or role_target=public.my_role() or school_id=public.my_school() or department_id=public.my_department()
);
create policy v27_notifications_update on public.notifications for update to authenticated using(
  user_id=auth.uid() or role_target=public.my_role() or school_id=public.my_school() or department_id=public.my_department()
) with check(true);
create policy v27_notifications_insert on public.notifications for insert to authenticated with check(public.is_active_user());

create policy v27_documents_read on public.documents for select to authenticated using(
  visibility='all' or public.is_roo_manager() or (visibility='roo' and public.my_role() in('roo_head','roo_deputy','department_head','department_staff')) or school_id=public.my_school() or department_id=public.my_department()
);
create policy v27_documents_write on public.documents for all to authenticated using(
  public.is_roo_manager() or created_by=auth.uid()
) with check(public.is_roo_manager() or created_by=auth.uid());

create policy v27_calendar_read on public.calendar_events for select to authenticated using(
  public.is_roo_manager() or school_id is null and department_id is null or school_id=public.my_school() or department_id=public.my_department()
);
create policy v27_calendar_write on public.calendar_events for all to authenticated using(public.is_roo_manager() or created_by=auth.uid()) with check(public.is_roo_manager() or created_by=auth.uid());

create policy v27_appeals_read on public.appeals for select to authenticated using(
  public.is_roo_manager() or assigned_department_id=public.my_department() or assigned_to=auth.uid() or created_by=auth.uid()
);
create policy v27_appeals_write on public.appeals for all to authenticated using(public.is_roo_manager() or assigned_department_id=public.my_department() or created_by=auth.uid()) with check(public.is_roo_manager() or created_by=auth.uid() or assigned_department_id=public.my_department());

create policy v27_meetings_read on public.meetings for select to authenticated using(public.is_active_user());
create policy v27_meetings_write on public.meetings for all to authenticated using(public.is_roo_manager() or created_by=auth.uid()) with check(public.is_roo_manager() or created_by=auth.uid());
create policy v27_decisions_read on public.meeting_decisions for select to authenticated using(public.is_active_user());
create policy v27_decisions_write on public.meeting_decisions for all to authenticated using(public.is_roo_manager()) with check(public.is_roo_manager());

create policy v27_inspections_read on public.inspections for select to authenticated using(public.is_roo_manager() or school_id=public.my_school() or created_by=auth.uid());
create policy v27_inspections_write on public.inspections for all to authenticated using(public.is_roo_manager() or created_by=auth.uid()) with check(public.is_roo_manager() or created_by=auth.uid());

create policy v27_school_history_read on public.school_history for select to authenticated using(public.is_roo_manager() or school_id=public.my_school());
create policy v27_school_history_insert on public.school_history for insert to authenticated with check(changed_by=auth.uid());

create policy v27_templates_read on public.report_templates for select to authenticated using(public.is_active_user());
create policy v27_templates_write on public.report_templates for all to authenticated using(public.is_roo_manager() or created_by=auth.uid()) with check(public.is_roo_manager() or created_by=auth.uid());

-- Представления читаются только после входа.
grant select on public.school_performance_v27,public.department_performance_v27 to authenticated;
grant select,insert,update,delete on public.task_recipients,public.task_comments,public.attachments,public.notifications,public.documents,public.calendar_events,public.appeals,public.meetings,public.meeting_decisions,public.inspections,public.school_history,public.report_templates to authenticated;

-- Индексы
create index if not exists documents_date_idx on public.documents(document_date desc,created_at desc);
create index if not exists calendar_starts_idx on public.calendar_events(starts_at);
create index if not exists appeals_status_idx on public.appeals(status,due_at);
create index if not exists meetings_date_idx on public.meetings(meeting_at desc);
create index if not exists inspections_school_idx on public.inspections(school_id,planned_at desc);

-- Отметка версии базы.
insert into public.site_settings(key,value)
values('system_version','{"version":"27.0.0","name":"V27 FULL RESTORE"}'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

commit;

-- Проверка после запуска:
select 'V27_OK' as result,
  (select count(*) from public.report_templates) as report_templates,
  (select count(*) from public.departments) as departments;


-- ============================================================
-- Продолжение: финальный аудит V28.3
-- ============================================================

-- ============================================================
-- ROO V28.3 FINAL AUDIT
-- Безопасное идемпотентное обновление поверх V27/V26.
-- Данные не удаляются. Выполнять только в проекте Supabase РОО.
-- ============================================================

begin;
create extension if not exists pgcrypto;

-- ---------- НЕДОСТАЮЩИЕ ПОЛЯ ----------
alter table if exists public.schools add column if not exists code text;
alter table if exists public.schools add column if not exists shifts_count integer;
alter table if exists public.attachments add column if not exists recipient_id uuid references public.task_recipients(id) on delete cascade;
alter table if exists public.exam_documents add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table if exists public.calendar_events add column if not exists task_id uuid references public.tasks(id) on delete cascade;

create index if not exists attachments_recipient_idx on public.attachments(recipient_id,created_at desc);
create index if not exists exam_documents_school_idx on public.exam_documents(school_id,created_at desc);
create unique index if not exists calendar_task_unique on public.calendar_events(task_id) where task_id is not null;
create unique index if not exists schools_code_unique on public.schools(code) where nullif(trim(code),'') is not null;

-- Однозначная привязка старого файла к получателю, если получатель один.
update public.attachments a
set recipient_id=x.recipient_id
from (
  select a2.id attachment_id,(array_agg(tr.id order by tr.id::text))[1] recipient_id
  from public.attachments a2
  join public.task_recipients tr on tr.task_id=a2.entity_id
  where a2.entity_type='task' and a2.recipient_id is null
  group by a2.id
  having count(tr.id)=1
) x
where a.id=x.attachment_id;

-- ---------- БЕЗОПАСНЫЕ СЛУЖЕБНЫЕ ФУНКЦИИ ----------
create or replace function public.v28_my_role()
returns text language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and status='active' limit 1 $$;

create or replace function public.v28_my_school()
returns uuid language sql stable security definer set search_path=public
as $$ select school_id from public.profiles where id=auth.uid() and status='active' limit 1 $$;

create or replace function public.v28_my_department()
returns uuid language sql stable security definer set search_path=public
as $$ select department_id from public.profiles where id=auth.uid() and status='active' limit 1 $$;

create or replace function public.v28_is_active()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;

create or replace function public.v28_is_roo_manager()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.v28_my_role() in ('roo_head','roo_deputy'),false) $$;

create or replace function public.v28_is_roo_head()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.v28_my_role()='roo_head',false) $$;

create or replace function public.v28_can_see_recipient(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select public.v28_is_roo_manager() or exists(
    select 1 from public.task_recipients tr
    where tr.id=target and (
      (tr.school_id is not null and tr.school_id=public.v28_my_school()) or
      (tr.department_id is not null and tr.department_id=public.v28_my_department())
    )
  )
$$;

-- Список организаций для регистрации без публичного чтения таблиц.
create or replace function public.registration_units_v28(unit_type text)
returns table(id uuid,name text)
language plpgsql stable security definer set search_path=public
as $$
begin
  if unit_type='school' then
    return query select s.id,s.name from public.schools s order by s.name;
  else
    return query select d.id,d.name from public.departments d order by d.name;
  end if;
end $$;
revoke all on function public.registration_units_v28(text) from public;
grant execute on function public.registration_units_v28(text) to anon,authenticated;

-- Восстановление профиля для старого аккаунта Authentication.
create or replace function public.ensure_my_profile_v28()
returns public.profiles
language plpgsql security definer set search_path=public,auth
as $$
declare result public.profiles; u auth.users;
begin
  select * into u from auth.users where id=auth.uid();
  if u.id is null then raise exception 'Пользователь не авторизован'; end if;
  insert into public.profiles(id,email,full_name,phone,role,status)
  values(u.id,u.email,coalesce(u.raw_user_meta_data->>'full_name',''),coalesce(u.raw_user_meta_data->>'phone',''),'pending','pending')
  on conflict(id) do update set email=excluded.email,updated_at=now();
  select * into result from public.profiles where id=u.id;
  return result;
end $$;
revoke all on function public.ensure_my_profile_v28() from public;
grant execute on function public.ensure_my_profile_v28() to authenticated;

-- Только начальник РОО назначает роли. Главный аккаунт нельзя изменить сам себе.
create or replace function public.assign_user_access_v28(
  target_user uuid,new_role text,new_status text,new_school uuid default null,new_department uuid default null
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.v28_is_roo_head() then raise exception 'Назначать роли может только начальник РОО'; end if;
  if target_user=auth.uid() then raise exception 'Нельзя изменить собственную роль этим способом'; end if;
  if new_role not in ('pending','roo_head','roo_deputy','department_head','department_staff','school_director','school_staff') then raise exception 'Недопустимая роль'; end if;
  if new_status not in ('pending','active','blocked') then raise exception 'Недопустимый статус'; end if;
  if new_role like 'school_%' and new_school is null then raise exception 'Для школьной роли выберите школу'; end if;
  if new_role like 'department_%' and new_department is null then raise exception 'Для роли отдела выберите отдел'; end if;
  update public.profiles set
    role=new_role,status=new_status,
    school_id=case when new_role like 'school_%' then new_school else null end,
    department_id=case when new_role like 'department_%' then new_department else null end,
    updated_at=now()
  where id=target_user;
  if not found then raise exception 'Профиль пользователя не найден'; end if;
end $$;
revoke all on function public.assign_user_access_v28(uuid,text,text,uuid,uuid) from public;
grant execute on function public.assign_user_access_v28(uuid,text,text,uuid,uuid) to authenticated;

create or replace function public.mark_notifications_read_v28(notification_ids uuid[])
returns integer language plpgsql security definer set search_path=public
as $$
declare affected integer;
begin
  update public.notifications n set is_read=true,read_at=coalesce(read_at,now())
  where n.id=any(notification_ids) and (
    n.user_id=auth.uid() or n.role_target=public.v28_my_role() or
    n.school_id=public.v28_my_school() or n.department_id=public.v28_my_department()
  );
  get diagnostics affected=row_count; return affected;
end $$;
revoke all on function public.mark_notifications_read_v28(uuid[]) from public;
grant execute on function public.mark_notifications_read_v28(uuid[]) to authenticated;

-- ---------- АВТОМАТИЧЕСКИЙ СТАТУС ПОРУЧЕНИЯ ----------
create or replace function public.v28_sync_task_status()
returns trigger language plpgsql security definer set search_path=public
as $$
declare aggregate_status text; target_task uuid;
begin
  target_task=case when tg_op='DELETE' then old.task_id else new.task_id end;
  select case
    when count(*)=0 then 'new'
    when bool_and(status='accepted') then 'accepted'
    when bool_or(status='roo_review') then 'roo_review'
    when bool_or(status='director_review') then 'director_review'
    when bool_or(status='returned') then 'returned'
    when bool_or(status='in_progress') then 'in_progress'
    else 'new' end
  into aggregate_status from public.task_recipients where task_id=target_task;
  update public.tasks set status=aggregate_status,
    completed_at=case when aggregate_status='accepted' then coalesce(completed_at,now()) else completed_at end,
    updated_at=now()
  where id=target_task;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists task_recipient_status_v28 on public.task_recipients;
create trigger task_recipient_status_v28 after insert or update or delete on public.task_recipients
for each row execute function public.v28_sync_task_status();

-- Срок поручения автоматически отображается в календаре.
create or replace function public.v28_sync_task_calendar()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op='DELETE' then delete from public.calendar_events where task_id=old.id; return old; end if;
  if new.due_at is null or new.status='cancelled' then
    delete from public.calendar_events where task_id=new.id;
  else
    insert into public.calendar_events(title,description,event_type,starts_at,school_id,department_id,task_id,created_by)
    values('Срок: '||new.title,new.description,'task_deadline',new.due_at,new.assigned_school_id,new.assigned_department_id,new.id,new.created_by)
    on conflict(task_id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,
      school_id=excluded.school_id,department_id=excluded.department_id;
  end if;
  return new;
end $$;
drop trigger if exists task_calendar_v28 on public.tasks;
create trigger task_calendar_v28 after insert or update or delete on public.tasks
for each row execute function public.v28_sync_task_calendar();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.departments enable row level security;
alter table public.tasks enable row level security;
alter table public.task_recipients enable row level security;
alter table public.task_responses enable row level security;
alter table public.task_comments enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.documents enable row level security;
alter table public.calendar_events enable row level security;
alter table public.appeals enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_decisions enable row level security;
alter table public.inspections enable row level security;
alter table public.school_history enable row level security;
alter table public.report_templates enable row level security;
alter table public.exam_documents enable row level security;

-- Удаляем известные конфликтующие политики старых версий.
do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies
    where schemaname='public' and tablename in(
      'profiles','schools','departments','tasks','task_recipients','task_responses','task_comments','attachments','notifications',
      'documents','calendar_events','appeals','meetings','meeting_decisions','inspections','school_history','report_templates','exam_documents'
    )
  loop execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop;
end $$;

create policy v28_profiles_read on public.profiles for select to authenticated using(
  id=auth.uid() or public.v28_is_roo_manager() or
  (school_id=public.v28_my_school() and public.v28_my_role()='school_director') or
  (department_id=public.v28_my_department() and public.v28_my_role()='department_head')
);
create policy v28_profiles_insert_self on public.profiles for insert to authenticated with check(id=auth.uid());

create policy v28_schools_read on public.schools for select to authenticated using(
  public.v28_is_active() and (public.v28_is_roo_manager() or public.v28_my_role() in('department_head','department_staff') or id=public.v28_my_school())
);
create policy v28_schools_write on public.schools for all to authenticated using(
  public.v28_is_roo_manager() or (id=public.v28_my_school() and public.v28_my_role()='school_director')
) with check(public.v28_is_roo_manager() or (id=public.v28_my_school() and public.v28_my_role()='school_director'));
create policy v28_departments_read on public.departments for select to authenticated using(public.v28_is_active());
create policy v28_departments_write on public.departments for all to authenticated using(public.v28_is_roo_head()) with check(public.v28_is_roo_head());

create policy v28_tasks_read on public.tasks for select to authenticated using(
  public.v28_is_roo_manager() or created_by=auth.uid() or assigned_school_id=public.v28_my_school() or assigned_department_id=public.v28_my_department() or
  exists(select 1 from public.task_recipients tr where tr.task_id=tasks.id and (tr.school_id=public.v28_my_school() or tr.department_id=public.v28_my_department()))
);
create policy v28_tasks_insert on public.tasks for insert to authenticated with check(
  created_by=auth.uid() and public.v28_my_role() in('roo_head','roo_deputy','department_head')
);
create policy v28_tasks_update on public.tasks for update to authenticated using(public.v28_is_roo_manager() or created_by=auth.uid()) with check(public.v28_is_roo_manager() or created_by=auth.uid());
create policy v28_tasks_delete on public.tasks for delete to authenticated using(public.v28_is_roo_manager() or created_by=auth.uid());

create policy v28_recipients_read on public.task_recipients for select to authenticated using(public.v28_can_see_recipient(id));
create policy v28_recipients_insert on public.task_recipients for insert to authenticated with check(
  exists(select 1 from public.tasks t where t.id=task_id and (public.v28_is_roo_manager() or t.created_by=auth.uid()))
);
create policy v28_recipients_update on public.task_recipients for update to authenticated using(public.v28_can_see_recipient(id)) with check(public.v28_can_see_recipient(id));
create policy v28_recipients_delete on public.task_recipients for delete to authenticated using(public.v28_is_roo_manager());

create policy v28_responses_read on public.task_responses for select to authenticated using(
  public.v28_is_roo_manager() or school_id=public.v28_my_school() or department_id=public.v28_my_department()
);
create policy v28_responses_insert on public.task_responses for insert to authenticated with check(
  author_id=auth.uid() and (public.v28_is_roo_manager() or school_id=public.v28_my_school() or department_id=public.v28_my_department())
);
create policy v28_responses_update on public.task_responses for update to authenticated using(author_id=auth.uid() or public.v28_is_roo_manager()) with check(author_id=auth.uid() or public.v28_is_roo_manager());

create policy v28_comments_read on public.task_comments for select to authenticated using(public.v28_can_see_recipient(recipient_id));
create policy v28_comments_insert on public.task_comments for insert to authenticated with check(author_id=auth.uid() and public.v28_can_see_recipient(recipient_id));

create policy v28_attachments_read on public.attachments for select to authenticated using(
  public.v28_is_roo_manager() or uploaded_by=auth.uid() or
  (entity_type='task' and recipient_id is not null and public.v28_can_see_recipient(recipient_id)) or
  (entity_type<>'task' and public.v28_is_active())
);
create policy v28_attachments_insert on public.attachments for insert to authenticated with check(
  uploaded_by=auth.uid() and (entity_type<>'task' or (recipient_id is not null and public.v28_can_see_recipient(recipient_id)))
);
create policy v28_attachments_delete on public.attachments for delete to authenticated using(uploaded_by=auth.uid() or public.v28_is_roo_manager());

create policy v28_notifications_read on public.notifications for select to authenticated using(
  user_id=auth.uid() or role_target=public.v28_my_role() or school_id=public.v28_my_school() or department_id=public.v28_my_department()
);
create policy v28_notifications_insert on public.notifications for insert to authenticated with check(public.v28_is_active());

create policy v28_documents_read on public.documents for select to authenticated using(
  public.v28_is_active() and (visibility='all' or public.v28_is_roo_manager() or
    (visibility='roo' and public.v28_my_role() in('roo_head','roo_deputy','department_head','department_staff')) or
    (visibility='schools' and public.v28_my_role() in('school_director','school_staff')) or
    (visibility='departments' and public.v28_my_role() in('department_head','department_staff')) or
    (visibility='private' and school_id=public.v28_my_school()) or
    (visibility='private' and department_id=public.v28_my_department()))
);
create policy v28_documents_write on public.documents for insert to authenticated with check(created_by=auth.uid() and public.v28_is_active());
create policy v28_documents_update on public.documents for update to authenticated using(created_by=auth.uid() or public.v28_is_roo_manager()) with check(created_by=auth.uid() or public.v28_is_roo_manager());
create policy v28_documents_delete on public.documents for delete to authenticated using(created_by=auth.uid() or public.v28_is_roo_manager());

create policy v28_calendar_read on public.calendar_events for select to authenticated using(
  public.v28_is_roo_manager() or (school_id is null and department_id is null) or school_id=public.v28_my_school() or department_id=public.v28_my_department()
);
create policy v28_calendar_write on public.calendar_events for all to authenticated using(public.v28_is_roo_manager()) with check(public.v28_is_roo_manager());

create policy v28_appeals_read on public.appeals for select to authenticated using(public.v28_is_roo_manager() or assigned_department_id=public.v28_my_department() or created_by=auth.uid());
create policy v28_appeals_insert on public.appeals for insert to authenticated with check(public.v28_is_active() and created_by=auth.uid());
create policy v28_appeals_update on public.appeals for update to authenticated using(public.v28_is_roo_manager() or assigned_department_id=public.v28_my_department() or created_by=auth.uid()) with check(public.v28_is_roo_manager() or assigned_department_id=public.v28_my_department() or created_by=auth.uid());

create policy v28_meetings_read on public.meetings for select to authenticated using(public.v28_is_active());
create policy v28_meetings_write on public.meetings for all to authenticated using(public.v28_is_roo_manager()) with check(public.v28_is_roo_manager());
create policy v28_decisions_read on public.meeting_decisions for select to authenticated using(public.v28_is_active());
create policy v28_decisions_write on public.meeting_decisions for all to authenticated using(public.v28_is_roo_manager()) with check(public.v28_is_roo_manager());

create policy v28_inspections_read on public.inspections for select to authenticated using(public.v28_is_roo_manager() or school_id=public.v28_my_school() or public.v28_my_role() in('department_head','department_staff'));
create policy v28_inspections_write on public.inspections for all to authenticated using(public.v28_is_roo_manager()) with check(public.v28_is_roo_manager());

create policy v28_school_history_read on public.school_history for select to authenticated using(public.v28_is_roo_manager() or school_id=public.v28_my_school());
create policy v28_school_history_insert on public.school_history for insert to authenticated with check(changed_by=auth.uid() and (public.v28_is_roo_manager() or school_id=public.v28_my_school()));
create policy v28_templates_read on public.report_templates for select to authenticated using(public.v28_is_active());
create policy v28_templates_write on public.report_templates for all to authenticated using(public.v28_is_roo_head()) with check(public.v28_is_roo_head());

create policy v28_exam_read on public.exam_documents for select to authenticated using(
  public.v28_is_roo_manager() or public.v28_my_role() in('department_head','department_staff') or school_id=public.v28_my_school() or created_by=auth.uid()
);
create policy v28_exam_insert on public.exam_documents for insert to authenticated with check(created_by=auth.uid() and public.v28_is_active());
create policy v28_exam_delete on public.exam_documents for delete to authenticated using(created_by=auth.uid() or public.v28_is_roo_manager());

-- ---------- STORAGE ----------
insert into storage.buckets(id,name,public) values
 ('roo-public','roo-public',true),('roo-documents','roo-documents',false),('roo-exam-analysis','roo-exam-analysis',false)
on conflict(id) do update set public=excluded.public;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'v28_%'
  loop execute format('drop policy if exists %I on storage.objects',r.policyname); end loop;
end $$;

create policy v28_storage_public_read on storage.objects for select to public using(bucket_id='roo-public');
create policy v28_storage_private_read on storage.objects for select to authenticated using(
  (bucket_id='roo-exam-analysis' and (public.v28_is_roo_manager() or public.v28_my_role() in('department_head','department_staff') or exists(select 1 from public.exam_documents e where e.storage_path=objects.name and (e.school_id=public.v28_my_school() or e.created_by=auth.uid())))) or
  (bucket_id='roo-documents' and (public.v28_is_roo_manager() or exists(select 1 from public.attachments a where a.storage_path=objects.name and (a.uploaded_by=auth.uid() or (a.recipient_id is not null and public.v28_can_see_recipient(a.recipient_id)))) or exists(select 1 from public.documents d where d.storage_path=objects.name and (d.created_by=auth.uid() or d.visibility='all' or d.school_id=public.v28_my_school() or d.department_id=public.v28_my_department()))))
);
create policy v28_storage_insert on storage.objects for insert to authenticated with check(
  public.v28_is_active() and (storage.foldername(name))[1]=auth.uid()::text and
  (bucket_id='roo-documents' or bucket_id='roo-exam-analysis' or (bucket_id='roo-public' and public.v28_is_roo_head()))
);
create policy v28_storage_delete on storage.objects for delete to authenticated using(public.v28_is_roo_manager() or owner_id::text=auth.uid()::text);

-- ---------- ПРАВА ----------
revoke select on public.schools,public.departments from anon;
revoke update,delete on public.profiles from authenticated;
grant select,insert on public.profiles to authenticated;
grant select,insert,update,delete on public.tasks,public.task_recipients,public.task_responses,public.task_comments,public.attachments to authenticated;
grant select,insert on public.notifications to authenticated;
grant select,insert,update,delete on public.documents,public.calendar_events,public.appeals,public.meetings,public.meeting_decisions,public.inspections,public.school_history,public.exam_documents to authenticated;
grant select on public.schools,public.departments,public.report_templates to authenticated;
grant insert,update on public.schools to authenticated;

insert into public.site_settings(key,value)
values('system_version','{"version":"28.3.0","name":"V28.3 FINAL AUDIT"}'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

commit;

select 'V28_3_FINAL_OK' result,
 (select count(*) from public.attachments where entity_type='task' and recipient_id is null) legacy_task_files_without_recipient,
 (select count(*) from public.profiles where status='active' and role='pending') invalid_active_pending_profiles;
