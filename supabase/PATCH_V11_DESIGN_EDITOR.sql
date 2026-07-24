-- ONLINE V11: исправление сохранения визуального редактора
-- Выполните один раз в Supabase SQL Editor, если база V10 уже создана.

insert into public.design_settings(id,settings,updated_at)
values (1,'{}'::jsonb,now())
on conflict (id) do nothing;

drop policy if exists roo_design_insert on public.design_settings;
create policy roo_design_insert on public.design_settings
for insert to authenticated
with check (public.current_role() in ('chief','deputy') and id=1);

drop policy if exists roo_design_update on public.design_settings;
create policy roo_design_update on public.design_settings
for update to authenticated
using (public.current_role() in ('chief','deputy'))
with check (public.current_role() in ('chief','deputy'));

select 'V11 design editor patch installed' as result;
