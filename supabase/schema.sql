-- 用户增长档案台 · Supabase 建表 SQL
-- 使用方式：复制本文件到 Supabase Dashboard -> SQL Editor 中执行。

create extension if not exists pgcrypto;

-- 更新时间触发器
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 登录账号资料表
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 娱乐直播间用户档案表
create table if not exists public.audience_users (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  nickname text not null,
  level_name text,
  tier text not null default 'C' check (tier in ('S', 'A', 'B', 'C')),

  manual_tags text[] not null default '{}',
  auto_tags text[] not null default '{}',
  tags text[] not null default '{}',

  occupation text,
  interests text,
  recent_event text,
  talked_topics text,
  maintenance_method text,

  total_live_count integer not null default 0 check (total_live_count >= 0),
  appeared_count integer not null default 0 check (appeared_count >= 0),
  supported_count integer not null default 0 check (supported_count >= 0),
  support_rate numeric(8, 4) not null default 0 check (support_rate >= 0),

  total_spend_amount numeric(12, 2) not null default 0 check (total_spend_amount >= 0),
  latest_single_spend_amount numeric(12, 2) not null default 0 check (latest_single_spend_amount >= 0),
  high_single_spend_count integer not null default 0 check (high_single_spend_count >= 0),
  single_spend_over_200_count integer not null default 0 check (single_spend_over_200_count >= 0),

  is_willing_to_reply boolean not null default false,
  is_no_purpose boolean not null default true,
  has_offline_meal_request boolean not null default false,
  is_only_rank_and_chat boolean not null default false,

  matched_rules text[] not null default '{}',
  tagging_snapshot jsonb not null default '{}'::jsonb,

  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_audience_users_owner_id on public.audience_users(owner_id);
create index if not exists idx_audience_users_tier on public.audience_users(owner_id, tier);
create index if not exists idx_audience_users_nickname on public.audience_users(owner_id, nickname);
create index if not exists idx_audience_users_last_interaction_at on public.audience_users(owner_id, last_interaction_at desc);
create index if not exists idx_audience_users_total_spend_amount on public.audience_users(owner_id, total_spend_amount desc);
create index if not exists idx_audience_users_support_rate on public.audience_users(owner_id, support_rate desc);

drop trigger if exists trg_audience_users_updated_at on public.audience_users;
create trigger trg_audience_users_updated_at
before update on public.audience_users
for each row execute function public.set_updated_at();

-- 直播场次表
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  live_date date not null default current_date,
  title text,
  started_at timestamptz,
  ended_at timestamptz,

  total_revenue numeric(12, 2) not null default 0 check (total_revenue >= 0),
  paid_user_count integer not null default 0 check (paid_user_count >= 0),
  first_paid_user_count integer not null default 0 check (first_paid_user_count >= 0),
  new_potential_user_count integer not null default 0 check (new_potential_user_count >= 0),
  s_user_revenue numeric(12, 2) not null default 0 check (s_user_revenue >= 0),

  raw_record_text text,
  raw_image_path text,
  ocr_text text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_live_sessions_owner_id on public.live_sessions(owner_id);
create index if not exists idx_live_sessions_live_date on public.live_sessions(owner_id, live_date desc);

drop trigger if exists trg_live_sessions_updated_at on public.live_sessions;
create trigger trg_live_sessions_updated_at
before update on public.live_sessions
for each row execute function public.set_updated_at();

-- 用户直播互动明细表
create table if not exists public.user_live_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  audience_user_id uuid not null references public.audience_users(id) on delete cascade,
  live_session_id uuid references public.live_sessions(id) on delete set null,

  interacted_at timestamptz not null default now(),
  appeared boolean not null default true,
  supported boolean not null default false,
  spend_amount numeric(12, 2) not null default 0 check (spend_amount >= 0),

  is_first_paid boolean not null default false,
  is_willing_to_reply boolean not null default false,
  has_offline_meal_request boolean not null default false,
  is_only_rank_and_chat boolean not null default false,

  topics text,
  remark text,
  raw_text text,

  created_at timestamptz not null default now()
);

create index if not exists idx_interactions_owner_id on public.user_live_interactions(owner_id);
create index if not exists idx_interactions_user_id on public.user_live_interactions(audience_user_id);
create index if not exists idx_interactions_session_id on public.user_live_interactions(live_session_id);
create index if not exists idx_interactions_interacted_at on public.user_live_interactions(owner_id, interacted_at desc);
create index if not exists idx_interactions_spend_amount on public.user_live_interactions(owner_id, spend_amount desc);

-- 标签字典表
create table if not exists public.tag_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,

  tag_name text not null,
  tag_type text not null default 'normal' check (tag_type in ('normal', 'special')),
  definition text,
  rule_description text,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(owner_id, tag_name)
);

create index if not exists idx_tag_definitions_owner_id on public.tag_definitions(owner_id);
create index if not exists idx_tag_definitions_tag_name on public.tag_definitions(tag_name);

drop trigger if exists trg_tag_definitions_updated_at on public.tag_definitions;
create trigger trg_tag_definitions_updated_at
before update on public.tag_definitions
for each row execute function public.set_updated_at();

-- 用户标签关系表
create table if not exists public.user_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  audience_user_id uuid not null references public.audience_users(id) on delete cascade,
  tag_id uuid not null references public.tag_definitions(id) on delete cascade,

  source text not null default 'auto' check (source in ('auto', 'manual')),
  reason text,
  created_at timestamptz not null default now(),

  unique(audience_user_id, tag_id, source)
);

create index if not exists idx_user_tags_owner_id on public.user_tags(owner_id);
create index if not exists idx_user_tags_user_id on public.user_tags(audience_user_id);
create index if not exists idx_user_tags_tag_id on public.user_tags(tag_id);

-- 自动打标结果记录表
create table if not exists public.user_tagging_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  audience_user_id uuid not null references public.audience_users(id) on delete cascade,

  old_tier text check (old_tier in ('S', 'A', 'B', 'C')),
  new_tier text check (new_tier in ('S', 'A', 'B', 'C')),
  matched_rules text[] not null default '{}',
  calculated_snapshot jsonb not null default '{}'::jsonb,
  operator_type text not null default 'system' check (operator_type in ('system', 'manual')),

  created_at timestamptz not null default now()
);

create index if not exists idx_tagging_logs_owner_id on public.user_tagging_logs(owner_id);
create index if not exists idx_tagging_logs_user_id on public.user_tagging_logs(audience_user_id);
create index if not exists idx_tagging_logs_created_at on public.user_tagging_logs(owner_id, created_at desc);

-- 直播趋势视图：日维度
create or replace view public.live_daily_metrics as
select
  owner_id,
  live_date,
  sum(total_revenue) as daily_revenue,
  sum(paid_user_count) as paid_user_count,
  sum(first_paid_user_count) as first_paid_user_count,
  case
    when sum(total_revenue) > 0 then round(sum(s_user_revenue) / sum(total_revenue), 4)
    else 0
  end as s_user_revenue_rate,
  sum(new_potential_user_count) as new_potential_user_count
from public.live_sessions
group by owner_id, live_date;

alter view public.live_daily_metrics set (security_invoker = true);

-- 直播趋势视图：周维度
create or replace view public.live_weekly_metrics as
select
  owner_id,
  date_trunc('week', live_date)::date as week_start_date,
  sum(total_revenue) as weekly_revenue,
  sum(new_potential_user_count) as new_potential_user_count
from public.live_sessions
group by owner_id, date_trunc('week', live_date)::date;

alter view public.live_weekly_metrics set (security_invoker = true);

-- 直播趋势视图：月维度
create or replace view public.live_monthly_metrics as
select
  owner_id,
  date_trunc('month', live_date)::date as month_start_date,
  sum(total_revenue) as monthly_revenue,
  sum(new_potential_user_count) as new_potential_user_count
from public.live_sessions
group by owner_id, date_trunc('month', live_date)::date;

alter view public.live_monthly_metrics set (security_invoker = true);

-- 开启 RLS
alter table public.profiles enable row level security;
alter table public.audience_users enable row level security;
alter table public.live_sessions enable row level security;
alter table public.user_live_interactions enable row level security;
alter table public.tag_definitions enable row level security;
alter table public.user_tags enable row level security;
alter table public.user_tagging_logs enable row level security;

-- 重复执行本文件时，先清理旧策略
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "audience_users_select_own" on public.audience_users;
drop policy if exists "audience_users_insert_own" on public.audience_users;
drop policy if exists "audience_users_update_own" on public.audience_users;
drop policy if exists "audience_users_delete_own" on public.audience_users;

drop policy if exists "live_sessions_select_own" on public.live_sessions;
drop policy if exists "live_sessions_insert_own" on public.live_sessions;
drop policy if exists "live_sessions_update_own" on public.live_sessions;
drop policy if exists "live_sessions_delete_own" on public.live_sessions;

drop policy if exists "interactions_select_own" on public.user_live_interactions;
drop policy if exists "interactions_insert_own" on public.user_live_interactions;
drop policy if exists "interactions_update_own" on public.user_live_interactions;
drop policy if exists "interactions_delete_own" on public.user_live_interactions;

drop policy if exists "tag_definitions_select_own" on public.tag_definitions;
drop policy if exists "tag_definitions_insert_own" on public.tag_definitions;
drop policy if exists "tag_definitions_update_own" on public.tag_definitions;
drop policy if exists "tag_definitions_delete_own" on public.tag_definitions;

drop policy if exists "user_tags_select_own" on public.user_tags;
drop policy if exists "user_tags_insert_own" on public.user_tags;
drop policy if exists "user_tags_update_own" on public.user_tags;
drop policy if exists "user_tags_delete_own" on public.user_tags;

drop policy if exists "tagging_logs_select_own" on public.user_tagging_logs;
drop policy if exists "tagging_logs_insert_own" on public.user_tagging_logs;

-- profiles RLS
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- audience_users RLS
create policy "audience_users_select_own"
on public.audience_users for select
using (auth.uid() = owner_id);

create policy "audience_users_insert_own"
on public.audience_users for insert
with check (auth.uid() = owner_id);

create policy "audience_users_update_own"
on public.audience_users for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "audience_users_delete_own"
on public.audience_users for delete
using (auth.uid() = owner_id);

-- live_sessions RLS
create policy "live_sessions_select_own"
on public.live_sessions for select
using (auth.uid() = owner_id);

create policy "live_sessions_insert_own"
on public.live_sessions for insert
with check (auth.uid() = owner_id);

create policy "live_sessions_update_own"
on public.live_sessions for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "live_sessions_delete_own"
on public.live_sessions for delete
using (auth.uid() = owner_id);

-- user_live_interactions RLS
create policy "interactions_select_own"
on public.user_live_interactions for select
using (auth.uid() = owner_id);

create policy "interactions_insert_own"
on public.user_live_interactions for insert
with check (auth.uid() = owner_id);

create policy "interactions_update_own"
on public.user_live_interactions for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "interactions_delete_own"
on public.user_live_interactions for delete
using (auth.uid() = owner_id);

-- tag_definitions RLS
create policy "tag_definitions_select_own"
on public.tag_definitions for select
using (auth.uid() = owner_id);

create policy "tag_definitions_insert_own"
on public.tag_definitions for insert
with check (auth.uid() = owner_id);

create policy "tag_definitions_update_own"
on public.tag_definitions for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "tag_definitions_delete_own"
on public.tag_definitions for delete
using (auth.uid() = owner_id);

-- user_tags RLS
create policy "user_tags_select_own"
on public.user_tags for select
using (auth.uid() = owner_id);

create policy "user_tags_insert_own"
on public.user_tags for insert
with check (auth.uid() = owner_id);

create policy "user_tags_update_own"
on public.user_tags for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "user_tags_delete_own"
on public.user_tags for delete
using (auth.uid() = owner_id);

-- user_tagging_logs RLS
create policy "tagging_logs_select_own"
on public.user_tagging_logs for select
using (auth.uid() = owner_id);

create policy "tagging_logs_insert_own"
on public.user_tagging_logs for insert
with check (auth.uid() = owner_id);

-- 初始化标签字典函数：用户首次登录后调用
create or replace function public.create_default_tags_for_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tag_definitions (owner_id, tag_name, tag_type, definition, rule_description)
  values
    (auth.uid(), '高额支持', 'normal', '用户在直播间有较高打赏、守护或连续支持行为', '总消费金额较高，或存在单笔大额支持行为'),
    (auth.uid(), '稳定陪伴', 'normal', '用户经常出现，停留稳定，即使不一定每次都发言', '出现次数达到 3 次及以上'),
    (auth.uid(), '氛围带动', 'normal', '用户能接话、抛梗、暖场，让直播间不冷清', '互动记录中愿意接话为 true'),
    (auth.uid(), '点歌偏好', 'normal', '用户常点歌、聊音乐，或对某类表演内容反应明显', '话题中出现点歌、歌曲或音乐偏好'),
    (auth.uid(), '情绪支持', 'normal', '用户会在主播状态不好时安慰、鼓励或陪伴', '备注中出现安慰、鼓励等情绪支持行为'),
    (auth.uid(), '预算敏感', 'normal', '用户对打赏、守护或付费表达明显犹豫', '备注中出现没钱、预算、下次再支持等表达'),
    (auth.uid(), '新进观望', 'normal', '用户刚开始接触直播间，信息仍少', '出现次数小于等于 2 次'),
    (auth.uid(), '潜水守候', 'normal', '用户发言少，但停留时间长，偶尔关键时刻出现', '出现次数达到 3 次及以上，但接话少且消费金额较低'),
    (auth.uid(), '目的用户', 'special', '用户单次消费金额较高，但提出线下、吃饭或越界关系请求', '单次消费 > 1000，同时提出见面、吃饭、私下关系等诉求')
  on conflict (owner_id, tag_name) do nothing;
end;
$$;
