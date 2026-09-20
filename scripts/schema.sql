-- 书签大礼包 / wanzhi
-- 可重复执行。公开读已发布数据；写操作仅 admin；收藏和访问只碰自己的行。

create extension if not exists pg_trgm;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  nickname text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'banned')),
  last_login_at timestamptz,
  login_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists status text not null default 'active';

alter table public.profiles
  add column if not exists last_login_at timestamptz;

alter table public.profiles
  add column if not exists login_count int not null default 0;

do $$ begin
  alter table public.profiles
    add constraint profiles_status_check check (status in ('active', 'banned'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.pack (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  icon text not null default '',
  tone text not null default '',
  sort_order int not null default 0,
  status smallint not null default 1 check (status in (0, 1)),
  created_at timestamptz not null default now()
);

alter table public.pack add column if not exists icon text not null default '';
alter table public.pack add column if not exists tone text not null default '';

create table if not exists public.category (
  id bigint generated always as identity primary key,
  pack_id bigint not null references public.pack (id) on delete cascade,
  parent_id bigint references public.category (id) on delete cascade,
  name text not null,
  level int not null default 1 check (level between 1 and 10),
  path text not null default '/',
  sort_order int not null default 0,
  status smallint not null default 1 check (status in (0, 1))
);

create table if not exists public.site (
  id bigint generated always as identity primary key,
  pack_id bigint not null references public.pack (id) on delete cascade,
  category_id bigint not null references public.category (id) on delete cascade,
  title text not null,
  url text not null,
  host text not null default '',
  description text,
  status text not null default 'PUBLISHED' check (status in ('DRAFT', 'PUBLISHED', 'OFFLINE')),
  sort_order int not null default 0,
  source_added_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bookmark_import (
  id bigint generated always as identity primary key,
  pack_id bigint references public.pack (id) on delete set null,
  filename text not null,
  status text not null check (status in ('SUCCESS', 'PARTIAL', 'FAILED')),
  created_categories int not null default 0,
  created_sites int not null default 0,
  skipped int not null default 0,
  failed int not null default 0,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.favorite (
  user_id uuid not null references auth.users (id) on delete cascade,
  site_id bigint not null references public.site (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, site_id)
);

create table if not exists public.visit_record (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  site_id bigint not null references public.site (id) on delete cascade,
  visited_at timestamptz not null default now()
);

create index if not exists category_pack_parent_idx on public.category (pack_id, parent_id);
create index if not exists site_pack_category_idx on public.site (pack_id, category_id);
create index if not exists site_title_trgm_idx on public.site using gin (title gin_trgm_ops);
create index if not exists visit_user_time_idx on public.visit_record (user_id, visited_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, nickname)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'username', ''),
    coalesce(nullif(new.raw_user_meta_data->>'nickname', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
       new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.last_login_at is distinct from old.last_login_at
       or new.login_count is distinct from old.login_count
     )
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not public.is_admin() then
    raise exception 'only admin can change role, status, or login stats';
  end if;
  return new;
end;
$$;

create or replace function public.record_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
  set
    last_login_at = now(),
    login_count = coalesce(login_count, 0) + 1
  where id = auth.uid()
    and status = 'active';
end;
$$;

-- 管理台重置他人密码（浏览器无 Publishable key，不能走 Auth Admin API）
create or replace function public.admin_reset_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_user_id is null then
    raise exception 'user required';
  end if;
  if p_new_password is null or char_length(btrim(p_new_password)) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found';
  end if;

  update auth.users
  set
    encrypted_password = crypt(btrim(p_new_password), gen_salt('bf')),
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.category_set_path()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent public.category;
begin
  if new.parent_id is null then
    new.level := 1;
    if new.id is not null then
      new.path := '/' || new.id::text || '/';
    end if;
  else
    if new.parent_id = new.id then
      raise exception 'category cannot parent itself';
    end if;
    select * into parent from public.category where id = new.parent_id;
    if parent.id is null then
      raise exception 'parent category missing';
    end if;
    if parent.pack_id <> new.pack_id then
      raise exception 'parent category is in another pack';
    end if;
    new.level := parent.level + 1;
    if new.level > 10 then
      raise exception 'category depth > 10';
    end if;
    if new.id is not null then
      new.path := parent.path || new.id::text || '/';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

drop trigger if exists category_path on public.category;
create trigger category_path
  before insert or update of parent_id, pack_id on public.category
  for each row execute function public.category_set_path();

alter table public.profiles enable row level security;
alter table public.pack enable row level security;
alter table public.category enable row level security;
alter table public.site enable row level security;
alter table public.bookmark_import enable row level security;
alter table public.favorite enable row level security;
alter table public.visit_record enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists pack_select on public.pack;
create policy pack_select on public.pack
  for select to anon, authenticated
  using (status = 1 or public.is_admin());

drop policy if exists pack_write on public.pack;
create policy pack_write on public.pack
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists category_select on public.category;
create policy category_select on public.category
  for select to anon, authenticated
  using (status = 1 or public.is_admin());

drop policy if exists category_write on public.category;
create policy category_write on public.category
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists site_select on public.site;
create policy site_select on public.site
  for select to anon, authenticated
  using (status = 'PUBLISHED' or public.is_admin());

drop policy if exists site_write on public.site;
create policy site_write on public.site
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists import_admin on public.bookmark_import;
create policy import_admin on public.bookmark_import
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists favorite_own on public.favorite;
create policy favorite_own on public.favorite
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists visit_own on public.visit_record;
create policy visit_own on public.visit_record
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant usage on schema public to anon, authenticated, service_role;

grant select on public.pack, public.category, public.site to anon;
grant select, insert, update, delete on public.pack, public.category, public.site, public.bookmark_import to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.favorite, public.visit_record to authenticated;

grant all on public.profiles, public.pack, public.category, public.site, public.bookmark_import, public.favorite, public.visit_record to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

revoke all on function public.record_login() from public;
grant execute on function public.record_login() to authenticated, service_role;

revoke all on function public.admin_reset_password(uuid, text) from public;
grant execute on function public.admin_reset_password(uuid, text) to authenticated, service_role;

revoke all on function public.handle_new_user() from public;
revoke all on function public.protect_profile_role() from public;
revoke all on function public.category_set_path() from public;

create or replace view public.pack_public
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.name,
  p.description,
  p.sort_order,
  (
    select count(*)::int
    from public.site s
    where s.pack_id = p.id and s.status = 'PUBLISHED'
  ) as site_count,
  p.icon,
  p.tone
from public.pack p
where p.status = 1;

grant select on public.pack_public to anon, authenticated, service_role;

insert into public.pack (slug, name, description, icon, tone, sort_order)
values
  ('wuzhi', '无知资源书签', '长期积累的综合性高频书签清单，覆盖广、密度高（20260903）。', 'library', '#ff5a1f', 1),
  ('cheese', '奶酪书签', '奶酪出品的精选书签合集，优质网站与工具导航（20260506）。', 'cookie', '#2a9d8f', 2),
  ('software', '软件', '软件下载、系统工具、开发工具等入口，集中查找与快速获取。', 'app-window', '#3d5a80', 3),
  ('entertainment', '娱乐休闲', '音乐、影视、游戏、电子书与兴趣社区，适度放松、触发灵感。', 'gamepad-2', '#bc4749', 4),
  ('study', '学习', 'MOOC、教程、电子书、题库、编程与数据科学、外语，系统化学习路径。', 'book-open', '#6a994e', 5),
  ('tools', '在线工具', '格式转换、下载上传、图片音视频、PDF、AI 助手。临时需求即开即用。', 'wrench', '#0077b6', 6),
  ('cloud', '云盘磁力', '常用网盘与资源入口合集，统一检索与管理（请合法合规使用）。', 'cloud', '#7f5539', 7),
  ('work', '工作', '协同办公、项目管理、效率与自动化、远程办公工具与技巧。', 'briefcase', '#1d3557', 8),
  ('design', '在线设计', '配色、图标、插画、素材、排版、Mockup、UI 组件库与灵感来源。', 'palette', '#9b2226', 9),
  ('office', '在线办公', '在线办公与协作相关工具与资源合集。', 'files', '#588157', 10),
  ('academic', '文库学术', '论文检索、期刊索引、学术搜索、文献管理、写作与排版。', 'graduation-cap', '#e09f3e', 11),
  ('explore', '资源探索', '垂直社区、导航站、精选仓库与优质信息源，拓展信息半径。', 'compass', '#386641', 12)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  icon = case
    when public.pack.icon = '' or public.pack.icon !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
      then excluded.icon
    else public.pack.icon
  end,
  tone = case when public.pack.tone = '' then excluded.tone else public.pack.tone end;

create or replace function public.category_counts(p_pack_id bigint)
returns table (category_id bigint, direct_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select s.category_id, count(*)::integer
  from public.site s
  where s.pack_id = p_pack_id
    and s.status = 'PUBLISHED'
  group by s.category_id;
$$;

revoke all on function public.category_counts(bigint) from public;
grant execute on function public.category_counts(bigint) to anon, authenticated, service_role;

-- Admin-only: Postgres 侧用量（库体积、分表、Auth 用户数）。账单级 egress/MAU 仍看 Dashboard。
create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;

  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'auth_users', (select count(*)::bigint from auth.users),
    'profiles', (select count(*)::bigint from public.profiles),
    'checked_at', now(),
    'tables', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.total_bytes desc)
      from (
        select
          c.relname as name,
          pg_total_relation_size(c.oid)::bigint as total_bytes,
          pg_relation_size(c.oid)::bigint as table_bytes,
          pg_indexes_size(c.oid)::bigint as index_bytes,
          coalesce(s.n_live_tup, 0)::bigint as row_estimate
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname in (
            'pack', 'category', 'site', 'bookmark_import',
            'favorite', 'visit_record', 'profiles'
          )
      ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_usage_stats() from public;
grant execute on function public.admin_usage_stats() to authenticated, service_role;
