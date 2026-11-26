-- =========================================================
-- PrimeView — محتوى الموقع وصفحة الإعدادات
-- يعيش في نفس قاعدة Mr Black لكن بجداول منفصلة تبدأ بـ pv_.
-- لا يحذف ولا يغيّر أي شيء من جداول المقهى.
-- =========================================================

-- مَن يحق له تعديل موقع PrimeView (منفصل تماماً عن مدراء المقهى)
create table if not exists public.pv_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.pv_admins enable row level security;

create or replace function private.pv_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.pv_admins where user_id = auth.uid());
$$;
revoke all on function private.pv_is_admin() from public;
grant execute on function private.pv_is_admin() to authenticated;

-- كل محتوى الموقع في صف واحد (JSON). القيم الفارغة تُكمَّل من content.js
create table if not exists public.pv_content (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 300000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.pv_content enable row level security;
insert into public.pv_content (id) values (1) on conflict (id) do nothing;

create or replace function private.pv_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger pv_content_touch before update on public.pv_content
  for each row execute function private.pv_touch();

-- الصلاحيات: الكل يقرأ المحتوى، والمدير فقط يعدّل
grant select on public.pv_content to anon, authenticated;
grant update (data) on public.pv_content to authenticated;
grant select on public.pv_admins to authenticated;

create policy pv_content_read on public.pv_content
  for select to anon, authenticated using (true);
create policy pv_content_admin_update on public.pv_content
  for update to authenticated
  using ((select private.pv_is_admin()))
  with check ((select private.pv_is_admin()));
create policy pv_admins_self_read on public.pv_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- مخزن الصور والفيديوهات (قراءة للجميع، رفع وحذف للمدير فقط)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pv-media', 'pv-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

create policy pv_media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pv-media' and (select private.pv_is_admin()));
create policy pv_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'pv-media' and (select private.pv_is_admin()))
  with check (bucket_id = 'pv-media' and (select private.pv_is_admin()));
create policy pv_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pv-media' and (select private.pv_is_admin()));
