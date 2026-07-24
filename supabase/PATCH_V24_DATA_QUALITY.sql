-- ============================================================
-- ONLINE V24 — ЦЕНТР КАЧЕСТВА ДАННЫХ И ИСТОРИЯ ИМПОРТОВ
-- Выполнить один раз: Supabase -> SQL Editor -> New query -> Run.
-- Скрипт НЕ удаляет существующие результаты, школы и пользователей.
-- ============================================================

begin;

-- Расширенная история каждой загрузки.
alter table public.exam_imports add column if not exists status text not null default 'completed';
alter table public.exam_imports add column if not exists accepted_rows integer not null default 0;
alter table public.exam_imports add column if not exists rejected_rows integer not null default 0;
alter table public.exam_imports add column if not exists warnings_count integer not null default 0;
alter table public.exam_imports add column if not exists duplicates_count integer not null default 0;
alter table public.exam_imports add column if not exists unknown_schools_count integer not null default 0;
alter table public.exam_imports add column if not exists file_hash text;
alter table public.exam_imports add column if not exists mapping jsonb not null default '{}'::jsonb;
alter table public.exam_imports add column if not exists issues jsonb not null default '[]'::jsonb;
alter table public.exam_imports add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.exam_imports add column if not exists reverted_at timestamptz;
alter table public.exam_imports add column if not exists reverted_by uuid references public.profiles(id) on delete set null;
alter table public.exam_imports add column if not exists revert_reason text;

-- Старые импорты остаются действующими и получают корректные счётчики.
update public.exam_imports
set
  accepted_rows = case when accepted_rows = 0 then imported_rows else accepted_rows end,
  status = case
    when reverted_at is not null then 'reverted'
    when status is null or status = '' then 'completed'
    else status
  end;

alter table public.exam_imports drop constraint if exists exam_imports_status_check;
alter table public.exam_imports
  add constraint exam_imports_status_check
  check (status in ('processing','completed','partial','failed','reverted'));

create index if not exists exam_imports_created_idx on public.exam_imports(created_at desc);
create index if not exists exam_imports_status_idx on public.exam_imports(status, created_at desc);
create index if not exists exam_imports_file_hash_idx on public.exam_imports(file_hash) where file_hash is not null;
create index if not exists exam_results_import_idx on public.exam_results(import_id);

-- Историю импортов видят только руководство и ответственные за аналитику отделы.
-- Школа не видит районные файлы загрузок, но продолжает видеть свои результаты.
drop policy if exists roo_exam_imports_select on public.exam_imports;
create policy roo_exam_imports_select on public.exam_imports
for select to authenticated
using (
  public.current_role() in ('chief','deputy')
  or (
    public.current_role() in ('department_head','specialist')
    and public.current_department_id() in ('methodical','information')
  )
  or (
    public.current_role() in ('school_director','school_staff')
    and school_id is not null
    and school_id = public.current_school_id()
  )
);

-- Специалист ответственного отдела может завершить только собственный импорт.
drop policy if exists roo_exam_imports_update on public.exam_imports;
create policy roo_exam_imports_update on public.exam_imports
for update to authenticated
using (
  public.current_role() in ('chief','deputy')
  or (
    public.current_role() = 'department_head'
    and public.current_department_id() in ('methodical','information')
  )
  or (
    public.current_role() = 'specialist'
    and public.current_department_id() in ('methodical','information')
    and uploaded_by = auth.uid()
  )
)
with check (
  public.current_role() in ('chief','deputy')
  or (
    public.current_role() = 'department_head'
    and public.current_department_id() in ('methodical','information')
  )
  or (
    public.current_role() = 'specialist'
    and public.current_department_id() in ('methodical','information')
    and uploaded_by = auth.uid()
  )
);

-- Безопасная отмена одной загрузки.
-- Запись истории сохраняется, удаляются только связанные exam_results.
create or replace function public.rollback_exam_import(
  target_import uuid,
  rollback_reason text default 'Причина не указана'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import public.exam_imports%rowtype;
  v_role text;
  v_department text;
  v_deleted integer := 0;
begin
  v_role := public.current_role();
  v_department := public.current_department_id();

  select * into v_import
  from public.exam_imports
  where id = target_import
  for update;

  if not found then
    raise exception 'Импорт не найден';
  end if;

  if not (
    v_role in ('chief','deputy')
    or (
      v_role = 'department_head'
      and v_department in ('methodical','information')
    )
  ) then
    raise exception 'Недостаточно прав для отмены импорта';
  end if;

  if v_import.status = 'reverted' then
    return jsonb_build_object(
      'import_id', target_import,
      'deleted_rows', 0,
      'status', 'reverted',
      'already_reverted', true
    );
  end if;

  select count(*) into v_deleted
  from public.exam_results
  where import_id = target_import;

  delete from public.exam_results
  where import_id = target_import;

  update public.exam_imports
  set
    status = 'reverted',
    reverted_at = now(),
    reverted_by = auth.uid(),
    revert_reason = nullif(trim(rollback_reason), ''),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'rollback_deleted_rows', v_deleted,
      'rollback_at', now()
    )
  where id = target_import;

  insert into public.audit_log(
    actor_id, actor_name, action, entity_type, entity_id, details
  )
  select
    auth.uid(),
    coalesce(p.full_name, p.email, 'Пользователь'),
    'Отменил импорт результатов экзаменов',
    'exam_import',
    target_import::text,
    jsonb_build_object(
      'object', coalesce(v_import.source_file, 'Файл'),
      'deleted_rows', v_deleted,
      'reason', coalesce(nullif(trim(rollback_reason), ''), 'Причина не указана')
    )
  from public.profiles p
  where p.id = auth.uid();

  return jsonb_build_object(
    'import_id', target_import,
    'deleted_rows', v_deleted,
    'status', 'reverted',
    'already_reverted', false
  );
end;
$$;

revoke all on function public.rollback_exam_import(uuid,text) from public;
grant execute on function public.rollback_exam_import(uuid,text) to authenticated;

commit;

-- Контрольная таблица. Ошибок здесь быть не должно.
select
  id,
  source_file,
  academic_year,
  exam_type,
  imported_rows,
  accepted_rows,
  rejected_rows,
  warnings_count,
  duplicates_count,
  status,
  created_at
from public.exam_imports
order by created_at desc
limit 20;
