-- EditDesk Optional Private Cloud Schema (Supabase Postgres + Owner-Only RLS)
-- Primary Desktop + iPhone LAN/Tailscale mode uses local SQLite with zero cloud setup.
-- Run this only if you later want private Supabase cloud sync.

create extension if not exists "pgcrypto";

create table if not exists public.app_owner (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.app_owner where user_id = auth.uid()
  );
$$;

create table if not exists public.clients (
  id bigint generated always as identity primary key,
  name text not null unique,
  aliases text not null default '',
  phone text not null default '',
  email text not null default '',
  default_rate_shorts numeric(12,2),
  default_rate_video numeric(12,2),
  default_billing_type text not null default 'one_off',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.editors (
  id bigint generated always as identity primary key,
  name text not null unique,
  phone text not null default '',
  specialty text not null default '',
  is_self boolean not null default false,
  default_rate_shorts numeric(12,2),
  default_rate_video numeric(12,2),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  order_code text not null unique,
  order_date date not null default current_date,
  client_id bigint not null references public.clients(id),
  title text not null,
  category text not null default 'Shorts',
  brief text not null default '',
  billing_type text not null default 'one_off' check (billing_type in ('one_off', 'monthly_package')),
  service_period text not null default '',
  amount numeric(12,2),
  production_status text not null default 'New' check (
    production_status in ('New','Unassigned','Assigned','Editing','Internal review','Client review','Revisions','Approved','Delivered')
  ),
  production_deadline date,
  payment_due_date date,
  editor_id bigint references public.editors(id),
  editor_cost numeric(12,2) not null default 0,
  editor_work_submitted boolean not null default false,
  editor_submitted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.clients(id),
  payment_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'UPI',
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_allocations (
  id bigint generated always as identity primary key,
  payment_id bigint not null references public.payments(id) on delete cascade,
  order_id bigint not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.editor_payouts (
  id bigint generated always as identity primary key,
  editor_id bigint not null references public.editors(id),
  payout_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'UPI',
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.editor_payout_allocations (
  id bigint generated always as identity primary key,
  payout_id bigint not null references public.editor_payouts(id) on delete cascade,
  order_id bigint not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  expense_date date not null default current_date,
  category text not null default 'Software',
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Owner-only RLS on every table
alter table public.app_owner enable row level security;
alter table public.clients enable row level security;
alter table public.editors enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.editor_payouts enable row level security;
alter table public.editor_payout_allocations enable row level security;
alter table public.expenses enable row level security;

create policy owner_only_app_owner on public.app_owner for all using (auth.uid() = user_id);
create policy owner_only_clients on public.clients for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_editors on public.editors for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_orders on public.orders for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_payments on public.payments for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_payment_allocations on public.payment_allocations for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_editor_payouts on public.editor_payouts for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_editor_payout_allocations on public.editor_payout_allocations for all using (public.is_owner()) with check (public.is_owner());
create policy owner_only_expenses on public.expenses for all using (public.is_owner()) with check (public.is_owner());

-- Replace OWNER_AUTH_USER_UUID with your Supabase Auth user UUID before running:
-- insert into public.app_owner (user_id) values ('OWNER_AUTH_USER_UUID') on conflict do nothing;
