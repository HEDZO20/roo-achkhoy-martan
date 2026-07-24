-- ONLINE V10 — очистка демонстрационных и рабочих данных
-- Сохраняет аккаунты пользователей, подразделения и разрешённые почты отделов.
-- Удаляет школы, поручения, ответы, экзамены, файлы, журнал, уведомления и настройки дизайна.

begin;

delete from storage.objects where bucket_id = 'roo-documents';
delete from public.notifications;
delete from public.audit_log;
delete from public.files;
delete from public.task_comments;
delete from public.submission_versions;
delete from public.submissions;
delete from public.task_recipients;
delete from public.tasks;
delete from public.exam_results;
delete from public.exam_imports;
delete from public.schools;
update public.design_settings set settings='{}'::jsonb, updated_by=null, updated_at=now() where id=1;
update public.profiles set school_id=null where school_id is not null;

-- Сброс нумерации поручений.
select setval(pg_get_serial_sequence('public.tasks','id'), 1, false);
select setval(pg_get_serial_sequence('public.audit_log','id'), 1, false);

commit;
