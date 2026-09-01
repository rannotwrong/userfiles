-- 用户日记 · 微信小程序登录映射表
-- 说明：
-- 1. 小程序版不直接使用邮箱验证码。
-- 2. 后端用 wx.login() 的 code 换取 openid，再在本表查找或创建用户。
-- 3. 后续可将业务表 owner_id 迁移为引用本表 id，或在后端做 auth.users 与 wechat_users 的映射。

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.wechat_users (
  id uuid primary key default gen_random_uuid(),
  wechat_openid text not null unique,
  wechat_unionid text unique,
  display_name text,
  avatar_url text,
  last_app_version text,
  last_release_channel text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wechat_users_openid on public.wechat_users(wechat_openid);
create index if not exists idx_wechat_users_unionid on public.wechat_users(wechat_unionid);

drop trigger if exists trg_wechat_users_updated_at on public.wechat_users;
create trigger trg_wechat_users_updated_at
before update on public.wechat_users
for each row execute function public.set_updated_at();

alter table public.wechat_users enable row level security;

-- 当前登录由后端 service_role 统一处理，不开放前端直连读写。
drop policy if exists "wechat_users_no_direct_client_access" on public.wechat_users;
create policy "wechat_users_no_direct_client_access"
on public.wechat_users
for all
using (false)
with check (false);

-- 后续业务表接入建议：
-- 方案 A：继续保留网页版 Supabase Auth，新增 wechat_owner_id 字段兼容小程序。
-- 方案 B：小程序独立业务表，owner_id references public.wechat_users(id)。
-- 方案 C：后端创建 auth.users 映射，沿用现有 owner_id 结构。
-- 当前推荐先用方案 A 或 C，以便网页版和小程序版逐步并行。

create table if not exists public.wechat_audience_users (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.wechat_users(id) on delete cascade,

  nickname text not null,
  tier text not null default 'C' check (tier in ('S', 'A', 'B', 'C')),
  level_name text,
  birthday date,

  manual_tags text[] not null default '{}',
  auto_tags text[] not null default '{}',
  tags text[] not null default '{}',

  occupation text,
  interests text,
  recent_event text,
  talked_topics text,
  maintenance_method text,

  total_spend_amount numeric not null default 0,
  latest_single_spend_amount numeric not null default 0,
  highest_single_spend_amount numeric not null default 0,
  high_single_spend_count integer not null default 0,
  single_spend_over_200_count integer not null default 0,

  total_live_count integer not null default 0,
  appeared_count integer not null default 0,
  supported_count integer not null default 0,
  support_rate numeric not null default 0,

  is_willing_to_reply boolean not null default false,
  is_no_purpose boolean not null default true,
  has_offline_meal_request boolean not null default false,
  is_only_rank_and_chat boolean not null default false,

  matched_rules text[] not null default '{}',
  tagging_snapshot jsonb not null default '{}',
  notes text,

  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wechat_audience_users_owner on public.wechat_audience_users(owner_id);
create index if not exists idx_wechat_audience_users_tier on public.wechat_audience_users(owner_id, tier);
create index if not exists idx_wechat_audience_users_updated on public.wechat_audience_users(owner_id, updated_at desc);

drop trigger if exists trg_wechat_audience_users_updated_at on public.wechat_audience_users;
create trigger trg_wechat_audience_users_updated_at
before update on public.wechat_audience_users
for each row execute function public.set_updated_at();

alter table public.wechat_audience_users enable row level security;

drop policy if exists "wechat_audience_users_no_direct_client_access" on public.wechat_audience_users;
create policy "wechat_audience_users_no_direct_client_access"
on public.wechat_audience_users
for all
using (false)
with check (false);

create table if not exists public.wechat_live_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.wechat_users(id) on delete cascade,
  audience_user_id uuid references public.wechat_audience_users(id) on delete set null,

  live_date date not null default current_date,
  total_revenue numeric not null default 0,
  gift_user_count integer not null default 0,
  new_gift_user_count integer not null default 0,
  top_gift text,
  score integer not null default 0 check (score >= 0 and score <= 100),

  source_text text,
  ocr_text text,
  recognition_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wechat_live_records_owner_date on public.wechat_live_records(owner_id, live_date desc);
create index if not exists idx_wechat_live_records_user on public.wechat_live_records(audience_user_id);

drop trigger if exists trg_wechat_live_records_updated_at on public.wechat_live_records;
create trigger trg_wechat_live_records_updated_at
before update on public.wechat_live_records
for each row execute function public.set_updated_at();

alter table public.wechat_live_records enable row level security;

drop policy if exists "wechat_live_records_no_direct_client_access" on public.wechat_live_records;
create policy "wechat_live_records_no_direct_client_access"
on public.wechat_live_records
for all
using (false)
with check (false);

-- 仅允许服务端 service_role 通过 Supabase Data API 访问这些表。
-- 不向 anon/authenticated 授权，小程序前端不能绕过后端直连业务数据。
grant usage on schema public to service_role;
revoke all privileges on table public.wechat_users from anon, authenticated;
revoke all privileges on table public.wechat_audience_users from anon, authenticated;
revoke all privileges on table public.wechat_live_records from anon, authenticated;
grant all privileges on table public.wechat_users to service_role;
grant all privileges on table public.wechat_audience_users to service_role;
grant all privileges on table public.wechat_live_records to service_role;
