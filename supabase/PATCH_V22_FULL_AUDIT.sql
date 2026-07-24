-- ONLINE V22 — исправление рейтингов без исходных данных
-- Выполнить один раз в Supabase -> SQL Editor -> New query -> Run.

begin;

-- Новая школа не получает 100% автоматически.
alter table public.schools alter column rating drop not null;
alter table public.schools alter column rating drop default;

-- Убираем стартовые 100% только у школ, по которым ещё не было поручений.
update public.schools s
set rating = null
where not exists (
  select 1 from public.task_recipients tr where tr.school_id = s.id
);

-- Рейтинг отдела появляется только после реальной активности.
create or replace view public.department_performance with (security_invoker=true) as
with task_stats as (
  select
    department_id,
    count(*) as tasks_given,
    count(*) filter (where status='done') as completed,
    count(*) filter (where status='overdue') as overdue
  from public.tasks
  where status <> 'draft'
  group by department_id
), submission_stats as (
  select
    t.department_id,
    count(s.id) as responses,
    count(s.id) filter (where s.status='review') as waiting_review,
    count(s.id) filter (where s.status='returned') as returned_count,
    avg(extract(epoch from (s.updated_at-s.submitted_at))/3600.0)
      filter (where s.submitted_at is not null and s.status in ('accepted','returned')) as avg_review_hours
  from public.tasks t
  join public.submissions s on s.task_id=t.id
  group by t.department_id
)
select
  d.id,
  d.name,
  d.email,
  d.head_name,
  coalesce(ts.tasks_given,0) as tasks_given,
  coalesce(ts.completed,0) as completed,
  coalesce(ts.overdue,0) as overdue,
  coalesce(ss.waiting_review,0) as waiting_review,
  coalesce(ss.responses,0) as responses,
  case when ss.avg_review_hours is null then null else round(ss.avg_review_hours::numeric,1) end as avg_review_hours,
  case
    when coalesce(ts.completed,0)+coalesce(ts.overdue,0)+coalesce(ss.responses,0)=0 then null
    else round(
      greatest(0,least(100,
        100
        - coalesce(ts.overdue,0)*8
        - coalesce(ss.waiting_review,0)*2
        - coalesce(ss.returned_count,0)*2
        - greatest(coalesce(ss.avg_review_hours,0)-24,0)*0.5
      ))::numeric,1
    )
  end as rating
from public.departments d
left join task_stats ts on ts.department_id=d.id
left join submission_stats ss on ss.department_id=d.id;

commit;
