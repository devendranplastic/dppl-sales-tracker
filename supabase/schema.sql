-- DPPL Sales & Order Tracker — Phase 1 schema. Run in Supabase SQL editor.
create extension if not exists pgcrypto;
create table if not exists profiles(id uuid primary key references auth.users on delete cascade, full_name text,
  role text not null default 'dispatch' check (role in ('md','ceo','marketing','factory_manager','planning','dispatch')), created_at timestamptz default now());
create or replace function my_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
create or replace function is_full() returns boolean language sql stable as $$ select coalesce(my_role() in ('md','ceo'),false) $$;
create or replace function can_edit() returns boolean language sql stable as $$ select coalesce(my_role() in ('md','ceo','marketing'),false) $$;
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name) values(new.id,split_part(new.email,'@',1)); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table if not exists customers(id uuid primary key default gen_random_uuid(), name text not null, mobile text not null, city text, segment text, gstin text, contact text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists enquiries(id uuid primary key default gen_random_uuid(), enq_no text unique not null, customer_id uuid references customers, product text, qty numeric, value numeric, owner text not null,
  stage text default 'New', next_action text not null check (length(trim(next_action))>0), due_date date not null,
  sales_status text, artwork_status text, order_status text, payment_status text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists specs(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, structure text, pouch_type text, width_mm text, length_mm text, thickness_mic text, colours text, print_type text, special text, feasibility text, feas_remarks text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists costings(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, material numeric, conversion numeric, cylinder numeric, freight numeric, overheads numeric, margin_pct numeric, cost_per_kg numeric, price_per_kg numeric, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists quotations(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, revision int not null, price_per_kg numeric, qty text, validity text, terms text, margin_pct numeric, needs_approval boolean default false, approved boolean default false, approved_by text, created_at timestamptz default now(), updated_at timestamptz default now(), unique(enquiry_id,revision));
create table if not exists activities(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, type text, notes text, next_action text, due_date date, by text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists tasks(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, title text, owner text, due_date date, done boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists audit_log(id bigserial primary key, action text, table_name text, record_id text, detail text, user_email text, user_id uuid default auth.uid(), created_at timestamptz default now());

alter table profiles enable row level security;
create policy p_self on profiles for select using (id=auth.uid() or is_full());
create policy p_admin on profiles for update using (is_full());
-- Shared CRM data: all signed-in roles read; md/ceo/marketing write. No deletes (history preserved).
do $$ declare t text; begin foreach t in array array['customers','enquiries','specs','activities','tasks'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy r_%1$s on %1$I for select using (auth.uid() is not null)',t);
 execute format('create policy i_%1$s on %1$I for insert with check (can_edit())',t);
 execute format('create policy u_%1$s on %1$I for update using (can_edit())',t);
end loop; end $$;
-- Costing: md/ceo/marketing only; view-only roles cannot see.
alter table costings enable row level security;
create policy r_cost on costings for select using (can_edit());
create policy i_cost on costings for insert with check (can_edit());
-- Quotations: all read (price), insert by editors; only md/ceo can update (approve). Old revisions are never updated/deleted.
alter table quotations enable row level security;
create policy r_q on quotations for select using (auth.uid() is not null);
create policy i_q on quotations for insert with check (can_edit() and approved=false);
create policy u_q on quotations for update using (is_full());
-- Hide margin columns from view-only roles/marketing via a safe view is recommended for Phase 2; see README.
alter table audit_log enable row level security;
create policy i_a on audit_log for insert with check (auth.uid() is not null);
create policy r_a on audit_log for select using (is_full());

-- Sample data (clearly labelled)
insert into customers(id,name,mobile,city,segment) values
 ('00000000-0000-0000-0000-000000000c01','[SAMPLE] Sri Murugan Foods','9840000001','Chennai','Snacks'),
 ('00000000-0000-0000-0000-000000000c02','[SAMPLE] Kaveri Spices','9840000002','Erode','Spices') on conflict do nothing;
insert into enquiries(enq_no,customer_id,product,qty,value,owner,stage,next_action,due_date,sales_status,artwork_status,order_status,payment_status) values
 ('ENQ-2026-0001','00000000-0000-0000-0000-000000000c01','[SAMPLE] Chips pouch 3-layer',50000,350000,'ravi','Quotation','Call for feedback',current_date-2,'Open','Pending','-','-'),
 ('ENQ-2026-0002','00000000-0000-0000-0000-000000000c02','[SAMPLE] Masala stand-up pouch',20000,180000,'priya','Feasibility','Share spec',current_date,'Open','Pending','-','-') on conflict do nothing;
-- After creating users in Auth: update profiles set role='md' where id=(select id from auth.users where email='md@yourco.com');

-- ===== Phase 1.1: costing role, visits, incentives (safe to re-run) =====
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('md','ceo','marketing','costing','factory_manager','planning','dispatch'));
alter table customers add column if not exists created_by_name text;
create or replace function is_marketing() returns boolean language sql stable as $$ select coalesce(my_role() in ('md','ceo','marketing'),false) $$;
create or replace function can_cost() returns boolean language sql stable as $$ select coalesce(my_role() in ('md','ceo','marketing','costing'),false) $$;
-- customers/enquiries/activities/tasks: costing cannot write (can_edit() = md/ceo/marketing, unchanged)
-- specs (feasibility): costing may write
drop policy if exists i_specs on specs; drop policy if exists u_specs on specs;
create policy i_specs on specs for insert with check (can_cost());
create policy u_specs on specs for update using (can_cost());
-- costings: md/ceo/marketing/costing read & write
drop policy if exists r_cost on costings; drop policy if exists i_cost on costings;
create policy r_cost on costings for select using (can_cost());
create policy i_cost on costings for insert with check (can_cost());
-- quotations: costing may read, cannot issue or approve (approve = is_full only)
create table if not exists visits(id uuid primary key default gen_random_uuid(), date date not null default current_date, customer_name text not null, customer_type text check (customer_type in ('New','Existing')), purpose text, discussion text not null, next_action text not null, by text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
alter table visits enable row level security;
create policy r_vis on visits for select using (is_full() or my_role()='marketing');
create policy i_vis on visits for insert with check (is_marketing());
create policy u_vis on visits for update using (created_by=auth.uid() or is_full());
create table if not exists incentive_rules(id uuid primary key default gen_random_uuid(), name text, min_qty numeric default 0, min_value numeric default 0, margin_from numeric default 0, margin_to numeric default 100, pct numeric default 0, created_at timestamptz default now(), updated_at timestamptz default now());
alter table incentive_rules enable row level security;
create policy r_inc on incentive_rules for select using (is_marketing());
create policy w_inc on incentive_rules for all using (is_full()) with check (is_full());
insert into incentive_rules(name,min_qty,min_value,margin_from,margin_to,pct)
 select * from (values ('[PLACEHOLDER] Slab A',10000,100000,12,18,0.5),('[PLACEHOLDER] Slab B',10000,100000,18,25,1.0),('[PLACEHOLDER] Slab C',25000,250000,25,100,1.5)) v
 where not exists (select 1 from incentive_rules);

-- ===== Phase 1.2: HR Admin, setup, collections (safe to re-run) =====
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('hr_admin','md','ceo','marketing','costing','factory_manager','planning','dispatch'));
alter table profiles add column if not exists email text, add column if not exists emp_code text, add column if not exists mobile text, add column if not exists territory text,
  add column if not exists reporting_manager text, add column if not exists active boolean default true, add column if not exists updated_at timestamptz default now();
update profiles p set email=u.email from auth.users u where u.id=p.id and p.email is null;
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,email) values(new.id,split_part(new.email,'@',1),new.email); return new; end $$;
create or replace function is_admin() returns boolean language sql stable as $$ select coalesce(my_role()='hr_admin',false) $$;
create or replace function is_full() returns boolean language sql stable as $$ select coalesce(my_role() in ('hr_admin','md','ceo'),false) $$;
create or replace function can_edit() returns boolean language sql stable as $$ select coalesce(my_role() in ('hr_admin','md','ceo','marketing'),false) $$;
create or replace function is_marketing() returns boolean language sql stable as $$ select coalesce(my_role() in ('hr_admin','md','ceo','marketing'),false) $$;
create or replace function can_cost() returns boolean language sql stable as $$ select coalesce(my_role() in ('hr_admin','md','ceo','marketing','costing'),false) $$;
-- profiles: everyone reads own; hr_admin/md/ceo read all; only hr_admin changes roles/details
drop policy if exists p_admin on profiles; create policy p_admin on profiles for update using (is_admin()) with check (is_admin());
-- incentive rules & settings: hr_admin plus md/ceo (is_full) may edit incentive rules; settings/targets/invoices: hr_admin only
create table if not exists settings(id uuid primary key default gen_random_uuid(), min_new_customer_visits_per_month numeric, min_new_customers_per_3_months numeric, min_visits_per_day numeric, at_risk_days_left numeric, margin_min_pct numeric, skip_sundays boolean default true, holidays text[] default '{}', visit_purposes text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists targets(id uuid primary key default gen_random_uuid(), exec text not null, period text not null, sales_value numeric, qty numeric, new_customers numeric, new_cust_visits numeric, collections numeric, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists invoices(id uuid primary key default gen_random_uuid(), invoice_no text not null, customer_id uuid references customers, amount numeric not null, invoice_date date, due_date date not null, promised_date date, exec text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists collections(id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices on delete cascade, amount numeric not null, date date not null, ref text, by text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists invoice_followups(id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices on delete cascade, notes text not null, promised_date date, by text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
do $$ declare t text; begin foreach t in array array['settings','targets','invoices','collections','invoice_followups'] loop
 execute format('alter table %I enable row level security',t);
 execute format('drop policy if exists r_%1$s on %1$I',t); execute format('drop policy if exists w_%1$s on %1$I',t);
 execute format('create policy r_%1$s on %1$I for select using (auth.uid() is not null)',t);
 execute format('create policy w_%1$s on %1$I for all using (is_admin()) with check (is_admin())',t);
end loop; end $$;
-- the responsible executive (or md/ceo) may log collections & follow-ups and set a promised date
create policy x_coll on collections for insert with check (is_marketing());
create policy x_fu on invoice_followups for insert with check (is_marketing());
create policy x_inv on invoices for update using (is_marketing());
-- hr_admin: full write on all other tables (beyond can_edit) incl. deletes
do $$ declare t text; begin foreach t in array array['customers','enquiries','specs','costings','quotations','activities','tasks','visits','incentive_rules'] loop
 execute format('drop policy if exists a_%1$s on %1$I',t);
 execute format('create policy a_%1$s on %1$I for all using (is_admin()) with check (is_admin())',t);
end loop; end $$;
drop policy if exists r_a on audit_log; create policy r_a on audit_log for select using (is_full());

-- Template: after creating the real HR Admin login in Supabase Auth, run (replace the placeholder):
-- update profiles set role='hr_admin' where email = 'HR_ADMIN_EMAIL_PLACEHOLDER';
