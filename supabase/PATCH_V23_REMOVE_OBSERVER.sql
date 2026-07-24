-- ============================================================
-- ONLINE V23 — единый безопасный патч
-- 1) исправляет пустые рейтинги V22.2;
-- 2) полностью удаляет роль «Наблюдатель руководства».
-- Можно запускать, даже если исправление V22.2 уже выполнялось.
-- ============================================================

-- ONLINE V22.2 — исправление ошибки 42P16 у department_performance
-- Выполнить один раз в Supabase -> SQL Editor -> New query -> Run.
-- Скрипт не удаляет пользователей, школы, поручения, результаты экзаменов или документы.

begin;

-- Новая школа не получает 100% автоматически.
alter table public.schools alter column rating drop not null;
alter table public.schools alter column rating drop default;

-- Убираем стартовые 100% только у школ, по которым ещё не было поручений.
update public.schools s
set rating = null
where not exists (
  select 1
  from public.task_recipients tr
  where tr.school_id = s.id
);

-- ВАЖНО: сохраняем прежний порядок колонок представления.
-- rating остаётся на прежнем 10-м месте, avg_review_hours добавляется в конец.
create or replace view public.department_performance
with (security_invoker = true) as
with task_stats as (
  select
    department_id,
    count(*) as tasks_given,
    count(*) filter (where status = 'done') as completed,
    count(*) filter (where status = 'overdue') as overdue
  from public.tasks
  where status <> 'draft'
  group by department_id
),
submission_stats as (
  select
    t.department_id,
    count(s.id) as responses,
    count(s.id) filter (where s.status = 'review') as waiting_review,
    count(s.id) filter (where s.status = 'returned') as returned_count,
    avg(extract(epoch from (s.updated_at - s.submitted_at)) / 3600.0)
      filter (
        where s.submitted_at is not null
          and s.status in ('accepted', 'returned')
      ) as avg_review_hours
  from public.tasks t
  join public.submissions s on s.task_id = t.id
  group by t.department_id
)
select
  d.id,
  d.name,
  d.email,
  d.head_name,
  coalesce(ts.tasks_given, 0) as tasks_given,
  coalesce(ts.completed, 0) as completed,
  coalesce(ts.overdue, 0) as overdue,
  coalesce(ss.waiting_review, 0) as waiting_review,
  coalesce(ss.responses, 0) as responses,
  case
    when coalesce(ts.completed, 0)
       + coalesce(ts.overdue, 0)
       + coalesce(ss.responses, 0) = 0
      then null
    else round(
      greatest(
        0,
        least(
          100,
          100
          - coalesce(ts.overdue, 0) * 8
          - coalesce(ss.waiting_review, 0) * 2
          - coalesce(ss.returned_count, 0) * 2
          - greatest(coalesce(ss.avg_review_hours, 0) - 24, 0) * 0.5
        )
      )::numeric,
      1
    )
  end as rating,
  case
    when ss.avg_review_hours is null then null
    else round(ss.avg_review_hours::numeric, 1)
  end as avg_review_hours
from public.departments d
left join task_stats ts on ts.department_id = d.id
left join submission_stats ss on ss.department_id = d.id;

grant select on public.department_performance to authenticated;

commit;

-- Проверка: у пустых отделов rating должен быть NULL, а не 100.
select
  id,
  name,
  tasks_given,
  completed,
  overdue,
  waiting_review,
  responses,
  rating,
  avg_review_hours
from public.department_performance
order by name;


-- ============================================================
-- ONLINE V23 — удаление роли «Наблюдатель руководства»
-- Выполнить один раз в Supabase SQL Editor.
-- Данные поручений, школ, экзаменов и документов не удаляются.
-- ============================================================

begin;

-- Старые приглашения этой роли больше не нужны.
delete from public.user_invitations where role = 'observer';

-- Если такой пользователь когда-либо был создан, блокируем его до назначения
-- одной из реальных рабочих ролей администратором.
update public.profiles
set role = 'pending', updated_at = now()
where role = 'observer';

-- Удаляем observer из допустимых значений ролей.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('chief','deputy','department_head','specialist','school_director','school_staff','pending'));

alter table public.user_invitations drop constraint if exists user_invitations_role_check;
alter table public.user_invitations
  add constraint user_invitations_role_check
  check (role in ('chief','deputy','department_head','specialist','school_director','school_staff'));

create or replace function public.is_readonly_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_role() in ('chief','deputy') $$;

create or replace function public.can_view_exam_data(target_school text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_role() in ('chief','deputy') then true
    when public.current_role() in ('department_head','specialist')
      then public.current_department_id() in ('methodical','information')
    when public.current_role() in ('school_director','school_staff')
      then public.current_school_id() = target_school
    else false
  end
$$;

-- Обновляем только политики, где раньше участвовал observer.
drop policy if exists roo_profiles_select on public.profiles;
create policy roo_profiles_select on public.profiles for select to authenticated using (
  id=auth.uid()
  or public.current_role() in ('chief','deputy')
  or (public.current_role()='department_head' and department_id=public.current_department_id())
  or (public.current_role()='school_director' and school_id=public.current_school_id())
);

drop policy if exists roo_tasks_select on public.tasks;
create policy roo_tasks_select on public.tasks for select to authenticated using (
  public.current_role() in ('chief','deputy')
  or (public.current_role() in ('department_head','specialist') and department_id=public.current_department_id())
  or exists(select 1 from public.task_recipients tr where tr.task_id=tasks.id and tr.school_id=public.current_school_id())
);

drop policy if exists roo_recipients_select on public.task_recipients;
create policy roo_recipients_select on public.task_recipients for select to authenticated using (
  public.current_role() in ('chief','deputy')
  or school_id=public.current_school_id()
  or exists(select 1 from public.tasks t where t.id=task_recipients.task_id and t.department_id=public.current_department_id() and public.current_role() in ('department_head','specialist'))
);

drop policy if exists roo_submissions_select on public.submissions;
create policy roo_submissions_select on public.submissions for select to authenticated using (
  public.current_role() in ('chief','deputy')
  or school_id=public.current_school_id()
  or exists(select 1 from public.tasks t where t.id=submissions.task_id and t.department_id=public.current_department_id() and public.current_role() in ('department_head','specialist'))
);

drop policy if exists roo_versions_select on public.submission_versions;
create policy roo_versions_select on public.submission_versions for select to authenticated using (
  exists(select 1 from public.submissions s where s.id=submission_versions.submission_id and (
    public.current_role() in ('chief','deputy')
    or s.school_id=public.current_school_id()
    or exists(select 1 from public.tasks t where t.id=s.task_id and t.department_id=public.current_department_id() and public.current_role() in ('department_head','specialist'))
  ))
);

drop policy if exists roo_comments_select on public.task_comments;
create policy roo_comments_select on public.task_comments for select to authenticated using (
  public.current_role() in ('chief','deputy')
  or author_id=auth.uid()
  or school_id=public.current_school_id()
  or exists(select 1 from public.tasks t where t.id=task_comments.task_id and t.department_id=public.current_department_id() and public.current_role() in ('department_head','specialist'))
);

drop policy if exists roo_files_select on public.files;
create policy roo_files_select on public.files for select to authenticated using (
  uploader_id=auth.uid()
  or public.current_role() in ('chief','deputy')
  or school_id=public.current_school_id()
  or department_id=public.current_department_id()
);

drop policy if exists roo_audit_select on public.audit_log;
create policy roo_audit_select on public.audit_log for select to authenticated using (
  public.current_role() in ('chief','deputy') or actor_id=auth.uid()
);

drop policy if exists roo_storage_select on storage.objects;
create policy roo_storage_select on storage.objects for select to authenticated
using (
  bucket_id='roo-documents'
  and (
    owner_id=auth.uid()::text
    or exists(select 1 from public.files f where f.path=storage.objects.name and (
      f.uploader_id=auth.uid()
      or public.current_role() in ('chief','deputy')
      or f.school_id=public.current_school_id()
      or f.department_id=public.current_department_id()
    ))
  )
);

commit;

select role, count(*) as users
from public.profiles
group by role
order by role;
