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
