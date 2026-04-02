-- ── Velocity Dashboard — Supabase Schema ─────────────────────────
-- Run this in Supabase Dashboard → SQL Editor → New Query

-- 1. Uploads table — one row per monthly file per distributor
create table if not exists uploads (
  id            bigserial primary key,
  distributor   text not null,
  month_key     text not null,  -- e.g. "2026-01"
  month         int  not null,  -- 0-11
  year          int  not null,
  row_count     int  default 0,
  total_cases   numeric(12,2) default 0,
  total_sales   numeric(14,2) default 0,
  total_custs   int  default 0,
  total_skus    int  default 0,
  uploaded_at   timestamptz default now(),
  unique(distributor, month_key)
);

-- 2. Velocity rows — one row per line item in each upload
create table if not exists velocity_rows (
  id            bigserial primary key,
  upload_id     bigint references uploads(id) on delete cascade,
  distributor   text not null,
  month_key     text not null,
  month         int  not null,
  year          int  not null,
  whs           text,
  cust_name     text,
  group_name    text,
  cust_no       text,
  city          text,
  st            text,
  vendor        text,
  itemno        text,
  description   text,
  pack          text,
  size          text,
  qty           numeric(10,2) default 0,
  sales         numeric(14,2) default 0
);

-- 3. Pricing table — Ronnoco sell price + distributor fees per SKU
create table if not exists pricing (
  id            bigserial primary key,
  distributor   text not null,
  itemno        text not null,
  description   text,
  sell_price    numeric(10,4) default 0,
  fee_flat      numeric(10,4) default 0,
  fee_pct       numeric(6,3)  default 0,
  updated_at    timestamptz default now(),
  unique(distributor, itemno)
);

-- 4. Upload log
create table if not exists upload_log (
  id         bigserial primary key,
  msg        text,
  ok         boolean default true,
  created_at timestamptz default now()
);

-- 5. Indexes for fast querying
create index if not exists idx_vr_distributor on velocity_rows(distributor);
create index if not exists idx_vr_month_key   on velocity_rows(month_key);
create index if not exists idx_vr_year        on velocity_rows(year);
create index if not exists idx_vr_dist_year   on velocity_rows(distributor, year);
create index if not exists idx_vr_cust        on velocity_rows(cust_name);
create index if not exists idx_vr_itemno      on velocity_rows(itemno);
create index if not exists idx_vr_whs         on velocity_rows(whs);
create index if not exists idx_pr_dist        on pricing(distributor);

-- 6. Disable RLS (functions use service_role key which bypasses RLS anyway)
alter table uploads     disable row level security;
alter table velocity_rows disable row level security;
alter table pricing     disable row level security;
alter table upload_log  disable row level security;

-- Done!
select 'Schema created successfully' as status;
