-- =====================================================================
-- DPPL Sales & Order Tracker — complete Supabase schema (v3)
-- Run once in Supabase → SQL editor on a NEW project. Safe to re-run.
-- Roles: hr_admin (system admin) · md · ceo · marketing · costing · factory_manager · planning · dispatch · accounts · data_entry (enters data on behalf of one marketing executive)
-- No real credentials belong in this file (public repo).
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- profiles & role helpers
create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  email text, full_name text,
  role text not null default 'dispatch' check (role in ('hr_admin','md','ceo','marketing','costing','factory_manager','planning','dispatch','accounts','data_entry')),
  emp_code text, mobile text, territory text, reporting_manager uuid references profiles(id), active boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now());

alter table profiles add column if not exists delegate_for uuid references profiles(id);
alter table profiles add column if not exists must_change_password boolean not null default true;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('hr_admin','md','ceo','marketing','costing','factory_manager','planning','dispatch','accounts','data_entry'));
create or replace function my_role() returns text language sql stable security definer set search_path=public as
$$ select role from profiles where id=auth.uid() and active $$;
create or replace function has_role(variadic r text[]) returns boolean language sql stable as $$ select coalesce(my_role()=any(r),false) $$;
create or replace function is_admin() returns boolean language sql stable as $$ select has_role('hr_admin') $$;
create or replace function is_full()  returns boolean language sql stable as $$ select has_role('hr_admin','md','ceo') $$;
create or replace function can_edit() returns boolean language sql stable as $$ select has_role('hr_admin','md','ceo','marketing') $$;
create or replace function can_margin() returns boolean language sql stable as $$ select has_role('hr_admin','md','ceo','costing') $$;
create or replace function signed_in() returns boolean language sql stable as $$ select my_role() is not null $$;
-- capability flags on top of the role (HR Admin sets them in Setup → Users): sales_import (upload sales register + customerwise file),
-- targets (create/edit/delete every marketing person's targets), broadcast (message everyone like MD). HR Admin implicitly has all.
alter table profiles add column if not exists caps text[] not null default '{}';
create or replace function has_cap(c text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select role='hr_admin' or c=any(caps) from profiles where id=auth.uid() and active),false) $$;
create or replace function my_team() returns setof uuid language sql stable security definer set search_path=public as
$$ select auth.uid() union select id from profiles where reporting_manager=auth.uid() $$;

create or replace function acting_for() returns uuid language sql stable security definer set search_path=public as
$$ select delegate_for from profiles where id=auth.uid() and active and role='data_entry' $$;
-- called by the app after auth.updateUser({password}) on first login
create or replace function password_changed() returns void language sql security definer set search_path=public as
$$ update profiles set must_change_password=false, updated_at=now() where id=auth.uid() $$;
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.email) on conflict (id) do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- document numbers generated in the database
create table if not exists doc_counters(prefix text, year int, n int not null default 0, primary key(prefix,year));
create or replace function next_doc_no(p text) returns text language plpgsql security definer set search_path=public as $$
declare y int := extract(year from now()); v int;
begin insert into doc_counters(prefix,year,n) values(p,y,1) on conflict(prefix,year) do update set n=doc_counters.n+1 returning n into v;
return format('%s-%s-%s',p,y,lpad(v::text,4,'0')); end $$;

-- ---------- core sales tables
create table if not exists customers(id uuid primary key default gen_random_uuid(), name text not null, mobile text not null, city text, segment text, gstin text, contact text,
  created_by uuid default auth.uid() references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists enquiries(id uuid primary key default gen_random_uuid(), enq_no text unique, customer_id uuid not null references customers,
  product text, qty numeric, value numeric, owner_id uuid references profiles(id), stage text not null default 'New',
  next_action text not null check (length(trim(next_action))>0), due_date date not null,
  sales_status text, artwork_status text, order_status text, payment_status text, won_at timestamptz, lost_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists specs(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, structure text, pouch_type text, width_mm text, length_mm text,
  thickness_mic text, colours text, print_type text, special text, feasibility text, feas_remarks text, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
-- costing: whole table restricted to hr_admin/md/ceo/costing; margin split into its own table
create table if not exists costings(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, material numeric, conversion numeric, cylinder numeric,
  freight numeric, overheads numeric, cost_per_kg numeric, price_per_kg numeric, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists costing_margins(costing_id uuid primary key references costings on delete cascade, margin_pct numeric, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists quotations(id uuid primary key default gen_random_uuid(), enquiry_id uuid not null references enquiries on delete cascade, revision int, price_per_kg numeric not null,
  qty text, validity text, terms text, needs_approval boolean not null default false, approved boolean not null default false, approved_by uuid, approved_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now(), unique(enquiry_id,revision));
create table if not exists quotation_margins(quotation_id uuid primary key references quotations on delete cascade, margin_pct numeric, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists activities(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, type text, notes text, next_action text, due_date date,
  by_id uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists tasks(id uuid primary key default gen_random_uuid(), enquiry_id uuid references enquiries on delete cascade, title text, owner_id uuid references profiles(id), due_date date,
  done boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists visits(id uuid primary key default gen_random_uuid(), date date not null default current_date, customer_name text not null, customer_type text check (customer_type in ('New','Existing')),
  purpose text, discussion text not null, next_action text not null, by_id uuid default auth.uid() references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists incentive_rules(id uuid primary key default gen_random_uuid(), name text, min_qty numeric default 0, min_value numeric default 0, margin_from numeric default 0, margin_to numeric default 100, pct numeric default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists settings(id uuid primary key default gen_random_uuid(), min_new_customer_visits_per_month numeric, min_new_customers_per_3_months numeric, min_visits_per_day numeric, at_risk_days_left numeric,
  margin_min_pct numeric default 12, skip_sundays boolean default true, holidays text[] default '{}', visit_purposes text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists targets(id uuid primary key default gen_random_uuid(), exec_id uuid references profiles(id), period text not null, sales_value numeric, qty numeric, new_customers numeric, new_cust_visits numeric, collections numeric, created_at timestamptz default now(), updated_at timestamptz default now());

-- ---------- phase 2/3: SKUs, samples, artwork, orders, dispatch, invoices, complaints
create table if not exists skus(id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers, sku_code text not null, description text, structure text, size text, format text,
  approved_artwork_id uuid, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now(), unique(customer_id,sku_code));
create table if not exists samples(id uuid primary key default gen_random_uuid(), sample_no text unique, enquiry_id uuid references enquiries on delete cascade, sku_id uuid references skus, spec_rev text, qty text, purpose text,
  stage text not null default 'Request', result text default 'Pending', batch text, courier text, docket text, observations text, feedback text, history jsonb default '[]',
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists artworks(id uuid primary key default gen_random_uuid(), sku_id uuid not null references skus on delete cascade, revision int not null, file_ref text, notes text,
  tooling_cost numeric default 0, tooling_owner text, storage text, status text not null default 'Draft' check (status in ('Draft','Sent to customer','Customer approved','Locked','Obsolete')),
  approved_at timestamptz, locked boolean default false, locked_by uuid, locked_at timestamptz, created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now(), unique(sku_id,revision));
create table if not exists orders(id uuid primary key default gen_random_uuid(), order_no text unique, enquiry_id uuid references enquiries, customer_id uuid not null references customers, sku_id uuid references skus,
  owner_id uuid references profiles(id), po_no text not null, po_date date, po_qty numeric not null, po_price numeric not null, po_terms text, po_artwork_rev text, po_file_name text, po_file_path text,
  requested_date date, confirmed_date date, checklist jsonb default '{}', released boolean not null default false, released_at timestamptz, released_by uuid, status text default 'Open',
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists order_stages(id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade, seq int, name text, dept_role text,
  status text default 'Pending' check (status in ('Pending','In progress','Done','Delayed')), planned_date date, actual_date date, delay_reason text, recovery_action text, responsible text, revised_date date, last_comm text,
  updated_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  check (status<>'Delayed' or (delay_reason is not null and recovery_action is not null and revised_date is not null)));
create table if not exists invoices(id uuid primary key default gen_random_uuid(), invoice_no text not null, customer_id uuid references customers, order_id uuid references orders, amount numeric not null,
  invoice_date date, due_date date not null, promised_date date, exec_id uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists dispatches(id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade, qty numeric not null, date date not null, invoice_no text, invoice_id uuid references invoices,
  transporter text, vehicle text, lr_no text, pod text default 'Pending', pod_date date, by_id uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists collections(id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices on delete cascade, amount numeric not null, date date not null, ref text, by_id uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists invoice_followups(id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices on delete cascade, notes text not null, promised_date date, by_id uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists complaints(id uuid primary key default gen_random_uuid(), cmp_no text unique, customer_id uuid not null references customers, order_id uuid references orders, invoice_id uuid references invoices, batch text,
  type text, severity text, description text not null, status text default 'Open', root_cause text, corrective_action text, customer_comm text, owner_id uuid default auth.uid(), closed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), check (status<>'Closed' or root_cause is not null));
create table if not exists audit_log(id bigserial primary key, action text, table_name text, record_id text, detail jsonb, user_id uuid default auth.uid(), user_email text, created_at timestamptz default now());

-- ---------- business-rule triggers
create or replace function trg_numbers() returns trigger language plpgsql as $$
begin
  if TG_TABLE_NAME='enquiries' then if new.enq_no is null then new.enq_no:=next_doc_no('ENQ'); end if; end if;
  if TG_TABLE_NAME='samples' then if new.sample_no is null then new.sample_no:=next_doc_no('SMP'); end if; end if;
  if TG_TABLE_NAME='complaints' then if new.cmp_no is null then new.cmp_no:=next_doc_no('CMP'); end if; end if;
  if TG_TABLE_NAME='orders' then if new.released and new.order_no is null then
    if new.confirmed_date is null then raise exception 'Factory-confirmed delivery date is required before release'; end if;
    new.order_no:=next_doc_no('ORD'); end if; end if;
  new.updated_at:=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['enquiries','samples','complaints','orders'] loop
  execute format('drop trigger if exists t_num on %I; create trigger t_num before insert or update on %I for each row execute function trg_numbers()',t,t); end loop; end $$;

-- quotation: revision, margin and approval flag computed server-side from the latest costing (cannot be bypassed by the client)
create or replace function trg_quote() returns trigger language plpgsql security definer set search_path=public as $$
declare c numeric; lim numeric; m numeric;
begin
  if TG_OP='INSERT' then
    select coalesce(max(revision)+1,0) into new.revision from quotations where enquiry_id=new.enquiry_id;
    select cost_per_kg into c from costings where enquiry_id=new.enquiry_id order by created_at desc limit 1;
    select coalesce((select margin_min_pct from settings order by created_at limit 1),12) into lim;
    if c is not null and c>0 then m:=round((new.price_per_kg/c-1)*100,2); end if;
    new.needs_approval := (m is null) or (m<lim);  -- no costing yet = needs approval
    new.approved:=false; new.approved_by:=null;
  else
    if (new.approved is distinct from old.approved) and not is_full() then raise exception 'Only HR Admin / MD / CEO can approve quotations'; end if;
    if new.price_per_kg is distinct from old.price_per_kg then raise exception 'Quotation revisions are immutable — issue a new revision'; end if;
    if new.approved and not old.approved then new.approved_by:=auth.uid(); new.approved_at:=now(); end if;
  end if;
  return new; end $$;
drop trigger if exists t_quote on quotations; create trigger t_quote before insert or update on quotations for each row execute function trg_quote();
create or replace function trg_quote_margin() returns trigger language plpgsql security definer set search_path=public as $$
declare c numeric; begin
  select cost_per_kg into c from costings where enquiry_id=new.enquiry_id order by created_at desc limit 1;
  insert into quotation_margins(quotation_id,margin_pct) values(new.id, case when c>0 then round((new.price_per_kg/c-1)*100,2) end) on conflict (quotation_id) do nothing; return new; end $$;
drop trigger if exists t_quote_m on quotations; create trigger t_quote_m after insert on quotations for each row execute function trg_quote_margin();

-- artwork: approved-version lock & obsolete block
create or replace function trg_artwork() returns trigger language plpgsql as $$
begin
  if TG_OP='UPDATE' then
    if old.status='Obsolete' then raise exception 'Obsolete artwork revisions cannot be changed'; end if;
    if old.status='Locked' and not (new.status='Obsolete' and is_full()) then raise exception 'Locked artwork can only be made obsolete by HR Admin/MD/CEO'; end if;
    if new.status='Locked' and not is_full() then raise exception 'Only HR Admin/MD/CEO can lock artwork'; end if;
  elsif new.status in ('Locked','Obsolete') then raise exception 'New revisions start as Draft'; end if;
  return new; end $$;
drop trigger if exists t_art on artworks; create trigger t_art before insert or update on artworks for each row execute function trg_artwork();

-- order stages: each department may only change status/progress fields of its own stages
create or replace function trg_stage() returns trigger language plpgsql as $$
begin if not is_full() and (new.order_id,new.seq,new.name,new.dept_role) is distinct from (old.order_id,old.seq,old.name,old.dept_role) then raise exception 'Route definition can only be changed by management'; end if;
new.updated_by:=auth.uid(); return new; end $$;
drop trigger if exists t_stage on order_stages; create trigger t_stage before update on order_stages for each row execute function trg_stage();

-- ---------- in-app broadcast messages (MD / CEO / HR Admin -> all or selected roles)
create table if not exists messages(id uuid primary key default gen_random_uuid(), sender_id uuid not null default auth.uid() references profiles(id), subject text not null, body text not null,
  all_users boolean not null default true, roles text[] not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists message_recipients(id uuid primary key default gen_random_uuid(), message_id uuid not null references messages on delete cascade, user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), unique(message_id,user_id));
create or replace function trg_message_fanout() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into message_recipients(message_id,user_id) select new.id,p.id from profiles p where p.active and (new.all_users or p.role=any(new.roles)) on conflict do nothing; return new; end $$;
drop trigger if exists t_msg_fanout on messages; create trigger t_msg_fanout after insert on messages for each row execute function trg_message_fanout();
create or replace function trg_rcpt_guard() returns trigger language plpgsql as $$
begin if (new.message_id,new.user_id) is distinct from (old.message_id,old.user_id) then raise exception 'Only read status can change'; end if; return new; end $$;
drop trigger if exists t_rcpt_guard on message_recipients; create trigger t_rcpt_guard before update on message_recipients for each row execute function trg_rcpt_guard();

-- ---------- historical import, monthly ERP sales, actual costs, dispatch plans
alter table customers add column if not exists customer_code text;
create unique index if not exists customers_code_uq on customers(lower(customer_code)) where customer_code is not null;
create table if not exists import_logs(id uuid primary key default gen_random_uuid(), kind text not null, month text, file_name text, rows_total int, added int, updated int, rejected int, rejected_rows jsonb default '[]',
  by_id uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists customer_history(id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers on delete cascade, customer_code text, order_date date, order_no text, sku_code text, qty numeric, value numeric, notes text,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists sales_uploads(id uuid primary key default gen_random_uuid(), month text not null unique check (month ~ '^\d{4}-\d{2}$'), file_name text, rows int, total_value numeric, uploaded_by uuid default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists sales_lines(id uuid primary key default gen_random_uuid(), upload_id uuid not null references sales_uploads on delete cascade, month text not null, invoice_no text not null, invoice_date date, customer_code text, customer_name text,
  customer_id uuid references customers, sku text, qty numeric, unit text, value numeric not null, so_no text, exec_raw text, exec_id uuid references profiles(id), is_common boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create index if not exists sales_lines_month on sales_lines(month); create index if not exists sales_lines_exec on sales_lines(exec_id);
create table if not exists exec_aliases(id uuid primary key default gen_random_uuid(), alias text not null unique, raw_name text, exec_id uuid references profiles(id), is_common boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now(), check (is_common or exec_id is not null));
create table if not exists actual_costs(id uuid primary key default gen_random_uuid(), month text not null check (month ~ '^\d{4}-\d{2}$'), sku_id uuid references skus on delete cascade, product text, material numeric, conversion numeric,
  cost_per_kg numeric not null, remarks text, by_id uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now(), check (sku_id is not null or product is not null));
create unique index if not exists actual_costs_uq on actual_costs(month, coalesce(sku_id::text, lower(product)));
create table if not exists dispatch_plans(id uuid primary key default gen_random_uuid(), date date not null, order_id uuid references orders, sku_id uuid references skus, customer_id uuid references customers,
  planned_qty numeric not null, planned_vehicle text, planned_time text, priority text default 'Normal', remarks text, created_by uuid default auth.uid(),
  actual_qty numeric, vehicle_no text, driver text, transporter text, lr_no text, dispatch_time text, invoice_no text, invoice_file_name text, invoice_file_path text,
  dispatch_id uuid references dispatches, invoice_id uuid references invoices, confirmed_by uuid, confirmed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
-- planning may change only plan fields; dispatch only confirmation fields
create or replace function trg_dplan() returns trigger language plpgsql as $$
begin
  if is_full() then return new; end if;
  if my_role()='dispatch' and (new.date,new.order_id,new.sku_id,new.customer_id,new.planned_qty,new.planned_vehicle,new.planned_time,new.priority,new.remarks)
     is distinct from (old.date,old.order_id,old.sku_id,old.customer_id,old.planned_qty,old.planned_vehicle,old.planned_time,old.priority,old.remarks) then raise exception 'Dispatch can only confirm, not change the plan'; end if;
  if my_role()='planning' and (new.actual_qty,new.vehicle_no,new.lr_no,new.invoice_no,new.confirmed_at) is distinct from (old.actual_qty,old.vehicle_no,old.lr_no,old.invoice_no,old.confirmed_at) then raise exception 'Only Dispatch confirms dispatches'; end if;
  return new; end $$;
drop trigger if exists t_dplan on dispatch_plans; create trigger t_dplan before update on dispatch_plans for each row execute function trg_dplan();

-- ---------- accounts: credit control & disputes; data entry on behalf
alter table customers add column if not exists credit_limit numeric;
alter table customers add column if not exists credit_hold boolean not null default false;
alter table invoices add column if not exists dispute text default 'None';
alter table invoices add column if not exists dispute_note text;
alter table orders add column if not exists credit_approved boolean not null default false;
alter table orders add column if not exists credit_approved_by uuid;
alter table orders add column if not exists credit_approved_at timestamptz;
-- Accounts may change only credit fields on customers and credit approval on orders
create or replace function trg_accounts_guard() returns trigger language plpgsql as $$
declare allowed text[] := case TG_TABLE_NAME when 'customers' then array['credit_limit','credit_hold','updated_at'] else array['credit_approved','credit_approved_by','credit_approved_at','updated_at'] end;
begin
  if my_role()='accounts' and (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then raise exception 'Accounts can only change credit fields here'; end if;
  if TG_TABLE_NAME='orders' then
    if new.credit_approved and not old.credit_approved then
      if not has_role('accounts','hr_admin','md','ceo') then raise exception 'Credit approval is for Accounts'; end if;
      new.credit_approved_by:=auth.uid(); new.credit_approved_at:=now(); end if; end if;
  return new; end $$;
drop trigger if exists t_acc_guard on customers; create trigger t_acc_guard before update on customers for each row execute function trg_accounts_guard();
drop trigger if exists t_acc_guard on orders; create trigger t_acc_guard before update on orders for each row execute function trg_accounts_guard();
-- release blocked while customer is on credit hold / over limit unless Accounts approved
create or replace function trg_credit_release() returns trigger language plpgsql security definer set search_path=public as $$
declare c customers; o numeric;
begin
  if new.released and not old.released and not new.credit_approved then
    select * into c from customers where id=new.customer_id;
    select coalesce(sum(i.amount - coalesce((select sum(k.amount) from collections k where k.invoice_id=i.id),0)),0) into o from invoices i where i.customer_id=new.customer_id;
    if c.credit_hold or (c.credit_limit>0 and o + new.po_qty*new.po_price > c.credit_limit) then raise exception 'Customer on credit hold / over credit limit — Accounts approval required'; end if;
  end if; return new; end $$;
drop trigger if exists t_credit on orders; create trigger t_credit before update on orders for each row execute function trg_credit_release();

-- generic audit trail on every write
create or replace function trg_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into audit_log(action,table_name,record_id,detail,user_id,user_email)
  values(lower(TG_OP),TG_TABLE_NAME,coalesce((case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',(to_jsonb(coalesce(new,old))->>'quotation_id'),(to_jsonb(coalesce(new,old))->>'costing_id')),
  case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end, auth.uid(), (select email from profiles where id=auth.uid()));
return coalesce(new,old); end $$;
do $$ declare t text; begin foreach t in array array['profiles','customers','enquiries','specs','costings','costing_margins','quotations','quotation_margins','activities','tasks','visits','incentive_rules','settings','targets',
 'skus','samples','artworks','orders','order_stages','invoices','dispatches','collections','invoice_followups','complaints','messages','import_logs','customer_history','sales_uploads','exec_aliases','actual_costs','dispatch_plans'] loop
  execute format('drop trigger if exists t_audit on %I; create trigger t_audit after insert or update or delete on %I for each row execute function trg_audit()',t,t); end loop; end $$;


-- ---------- Row-level security
do $$ declare t text; begin foreach t in array array['profiles','customers','enquiries','specs','costings','costing_margins','quotations','quotation_margins','activities','tasks','visits','incentive_rules','settings','targets',
 'skus','samples','artworks','orders','order_stages','invoices','dispatches','collections','invoice_followups','complaints','audit_log','doc_counters','messages','message_recipients','import_logs','customer_history','sales_uploads','sales_lines','exec_aliases','actual_costs','dispatch_plans'] loop
  execute format('alter table %I enable row level security',t);
  execute (select coalesce(string_agg(format('drop policy if exists %I on %I;',policyname,t),' '),'select 1') from pg_policies where schemaname='public' and tablename=t);
  execute format('create policy adm_%1$s on %1$I for all using (is_admin()) with check (is_admin())',t);  -- HR Admin: everything
end loop; end $$;
-- profiles: names readable by all signed-in users (needed to show owners); only HR Admin edits (policy above)
create policy r_profiles on profiles for select using (signed_in() or id=auth.uid());
-- shared sales data: all signed-in read; md/ceo/marketing write
do $$ declare t text; begin foreach t in array array['customers','enquiries','activities','tasks','skus'] loop
  execute format('create policy r_%1$s on %1$I for select using (signed_in())',t);
  execute format('create policy i_%1$s on %1$I for insert with check (can_edit())',t);
  execute format('create policy u_%1$s on %1$I for update using (can_edit())',t); end loop; end $$;
-- specs/feasibility: costing team may also write
create policy r_specs on specs for select using (signed_in());
create policy w_specs on specs for insert with check (can_edit() or has_role('costing'));
create policy u_specs on specs for update using (can_edit() or has_role('costing'));
-- costing & margins: hidden from marketing and view roles entirely
create policy r_cost on costings for select using (can_margin());
create policy w_cost on costings for insert with check (can_margin());
create policy r_cm on costing_margins for select using (can_margin());
create policy w_cm on costing_margins for insert with check (can_margin());
create policy r_qm on quotation_margins for select using (can_margin());
-- quotations: price/terms visible to all signed in; marketing/md/ceo issue; approval enforced by trigger
create policy r_q on quotations for select using (signed_in());
create policy i_q on quotations for insert with check (can_edit());
create policy u_q on quotations for update using (is_full());
-- visits: own + direct reports; md/ceo all
create policy r_vis on visits for select using (is_full() or by_id in (select my_team()));
create policy i_vis on visits for insert with check (can_edit() and by_id=auth.uid());
create policy u_vis on visits for update using (by_id=auth.uid());
-- incentive rules: md/ceo manage; marketing may read slabs
create policy r_inc on incentive_rules for select using (can_edit());
create policy w_inc on incentive_rules for all using (is_full()) with check (is_full());
-- settings: all read (rules), only HR Admin writes
create policy r_set on settings for select using (signed_in());
-- targets: md/ceo all; executive own/team
create policy r_tgt on targets for select using (is_full() or exec_id in (select my_team()));
-- samples: all signed in read; marketing creates; stage owners (costing/factory/dispatch) update
create policy r_smp on samples for select using (signed_in());
create policy i_smp on samples for insert with check (can_edit());
create policy u_smp on samples for update using (can_edit() or has_role('costing','factory_manager','dispatch'));
-- artwork: all read; marketing/md/ceo write (lock rule in trigger)
create policy r_art on artworks for select using (signed_in());
create policy i_art on artworks for insert with check (can_edit());
create policy u_art on artworks for update using (can_edit());
-- orders: all read; marketing enters PO; only md/ceo release (trigger + policy)
create policy r_ord on orders for select using (signed_in());
create policy i_ord on orders for insert with check (can_edit() and not released);
create policy u_ord on orders for update using (is_full() or (can_edit() and not released)) with check (is_full() or not released);
-- order stages: all read; management creates route; each department updates its own stages
create policy r_stg on order_stages for select using (signed_in());
create policy i_stg on order_stages for insert with check (is_full());
create policy u_stg on order_stages for update using (is_full() or dept_role=my_role());
-- invoices & collections: md/ceo all; responsible executive own/team; dispatch creates invoices on dispatch
create policy r_inv on invoices for select using (is_full() or exec_id in (select my_team()) or has_role('dispatch'));
create policy i_inv on invoices for insert with check (is_full() or has_role('dispatch'));
create policy u_inv on invoices for update using (is_full() or exec_id=auth.uid());
create policy r_col on collections for select using (exists(select 1 from invoices i where i.id=invoice_id));
create policy i_col on collections for insert with check (exists(select 1 from invoices i where i.id=invoice_id and (is_full() or i.exec_id=auth.uid())));
create policy r_fu on invoice_followups for select using (exists(select 1 from invoices i where i.id=invoice_id));
create policy i_fu on invoice_followups for insert with check (exists(select 1 from invoices i where i.id=invoice_id and (is_full() or i.exec_id=auth.uid())));
-- dispatches
create policy r_dsp on dispatches for select using (signed_in());
create policy i_dsp on dispatches for insert with check (is_full() or has_role('dispatch'));
create policy u_dsp on dispatches for update using (is_full() or has_role('dispatch'));
-- complaints: all read; marketing registers; factory investigates
create policy r_cmp on complaints for select using (signed_in());
create policy i_cmp on complaints for insert with check (can_edit());
create policy u_cmp on complaints for update using (can_edit() or has_role('factory_manager'));
-- audit log: read by md/ceo (HR Admin via adm_ policy); written only by triggers (security definer)
create policy r_audit on audit_log for select using (is_full());

-- messages: only md/ceo/hr_admin broadcast (as themselves); recipients read their own; sender sees read receipts
create or replace function is_msg_sender(m uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from messages where id=m and sender_id=auth.uid()) $$;
create or replace function is_msg_recipient(m uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from message_recipients where message_id=m and user_id=auth.uid()) $$;
create policy i_msg on messages for insert with check ((is_full() or has_cap('broadcast')) and sender_id=auth.uid());
create policy u_msg on messages for update using ((is_full() or has_cap('broadcast')) and sender_id=auth.uid()) with check (sender_id=auth.uid());
create policy d_msg on messages for delete using ((is_full() or has_cap('broadcast')) and sender_id=auth.uid());
create policy r_msg on messages for select using (sender_id=auth.uid() or is_msg_recipient(id));
create policy r_rcpt on message_recipients for select using (user_id=auth.uid() or is_msg_sender(message_id));
create policy u_rcpt on message_recipients for update using (user_id=auth.uid()) with check (user_id=auth.uid());

-- historical import & ERP sales: only HR Admin writes (adm_ policies); MD/CEO see all; marketing sees only own sales rows
create policy r_implog on import_logs for select using (is_full());
create policy r_chist on customer_history for select using (signed_in());
create policy r_supl on sales_uploads for select using (signed_in());
create policy r_sl on sales_lines for select using (is_full() or exec_id in (select my_team()));
create policy r_alias on exec_aliases for select using (is_full());
-- actual cost/kg: costing enters; visible only to hr_admin/md/ceo/costing
create policy r_ac on actual_costs for select using (can_margin());
create policy i_ac on actual_costs for insert with check (has_role('costing'));
create policy u_ac on actual_costs for update using (has_role('costing'));
-- dispatch plans: planning plans, dispatch confirms; visible to management, marketing, planning, dispatch
create policy r_dp on dispatch_plans for select using (has_role('md','ceo','marketing','planning','dispatch'));
create policy i_dp on dispatch_plans for insert with check (has_role('planning','md','ceo'));
create policy u_dp on dispatch_plans for update using (has_role('planning','dispatch','md','ceo'));

-- incentive on actual ERP sales, margin from latest actual cost/kg (margin only shown to margin roles)
create or replace function sales_incentives() returns table(month text, exec_id uuid, qty numeric, value numeric, margin_pct numeric, slab text, incentive numeric, margin_basis text)
language sql stable security definer set search_path=public as $$
  with lm as (
    select l.month, l.exec_id, l.qty, l.value, l.unit,
      (select ac.cost_per_kg from actual_costs ac left join skus s on s.id=ac.sku_id
        where ac.month<=l.month and (regexp_replace(lower(coalesce(s.sku_code,ac.product,'')),'[^a-z0-9]','','g')=regexp_replace(lower(coalesce(l.sku,'')),'[^a-z0-9]','','g'))
        order by ac.month desc limit 1) c
    from sales_lines l where not l.is_common and l.exec_id is not null and (is_full() or l.exec_id=auth.uid())),
  g as (select lm.month, lm.exec_id, sum(lm.qty) qty, sum(lm.value) val,
      sum(case when c>0 and lm.qty>0 and (unit is null or unit ilike 'kg%') then lm.value*((lm.value/lm.qty)/c-1)*100 end)
      / nullif(sum(case when c>0 and lm.qty>0 and (unit is null or unit ilike 'kg%') then lm.value end),0) m
    from lm group by 1,2)
  select g.month, g.exec_id, g.qty, g.val, case when can_margin() then round(g.m,2) end, r.name, coalesce(round(g.val*r.pct/100,2),0),
    case when g.m is null then 'no actual cost — lowest slab' else 'actual cost' end
  from g left join lateral (select * from incentive_rules r where g.qty>=r.min_qty and g.val>=r.min_value and (g.m is null or (g.m>=r.margin_from and g.m<r.margin_to))
    order by case when g.m is null then r.margin_from end nulls last, r.created_at limit 1) r on true $$;

-- data entry on behalf (e.g. info@ for Balaji): records are owned by the executive; audit_log.user_id shows who keyed them
create policy de_cust_i on customers for insert with check (has_role('data_entry') and created_by=acting_for());
create policy de_enq_i on enquiries for insert with check (has_role('data_entry') and owner_id=acting_for());
create policy de_enq_u on enquiries for update using (has_role('data_entry') and owner_id=acting_for()) with check (owner_id=acting_for());
create policy de_act_i on activities for insert with check (has_role('data_entry') and by_id=acting_for() and exists(select 1 from enquiries e where e.id=enquiry_id and e.owner_id=acting_for()));
create policy de_task_i on tasks for insert with check (has_role('data_entry') and owner_id=acting_for());
create policy de_task_u on tasks for update using (has_role('data_entry') and owner_id=acting_for());
create policy de_vis_r on visits for select using (has_role('data_entry') and by_id=acting_for());
create policy de_vis_i on visits for insert with check (has_role('data_entry') and by_id=acting_for());
create policy de_vis_u on visits for update using (has_role('data_entry') and by_id=acting_for());
create policy de_tgt_r on targets for select using (has_role('data_entry') and exec_id=acting_for());
-- accounts (Ramesh): invoices, receipts, disputes, credit control; reads ERP sales and dispatch plans; no costing/margins
create policy acc_inv_r on invoices for select using (has_role('accounts'));
create policy acc_inv_i on invoices for insert with check (has_role('accounts'));
create policy acc_inv_u on invoices for update using (has_role('accounts'));
create policy acc_col_i on collections for insert with check (has_role('accounts'));
create policy acc_col_u on collections for update using (has_role('accounts'));
create policy acc_fu_i on invoice_followups for insert with check (has_role('accounts'));
create policy acc_cust_u on customers for update using (has_role('accounts'));
create policy acc_ord_u on orders for update using (has_role('accounts'));
create policy acc_sl_r on sales_lines for select using (has_role('accounts'));
create policy acc_dp_r on dispatch_plans for select using (has_role('accounts'));

-- ---------- incentives computed server-side (marketing never sees margins)
create or replace function incentive_lines() returns table(enquiry_id uuid, enq_no text, owner_id uuid, customer_id uuid, qty numeric, value numeric, margin_pct numeric, slab text, incentive numeric)
language sql stable security definer set search_path=public as $$
  with w as (
    select e.id, e.enq_no, e.owner_id, e.customer_id,
      coalesce(o.po_qty, e.qty, nullif(q.qty,'')::numeric, 0) qty,
      coalesce(o.po_qty*o.po_price, nullif(q.qty,'')::numeric*q.price_per_kg, e.value, 0) val,
      qm.margin_pct m
    from enquiries e
    left join lateral (select * from quotations q where q.enquiry_id=e.id order by revision desc limit 1) q on true
    left join quotation_margins qm on qm.quotation_id=q.id
    left join lateral (select * from orders o where o.enquiry_id=e.id and o.released order by released_at desc limit 1) o on true
    where e.stage='Won' and (is_full() or e.owner_id=auth.uid()))
  select w.id, w.enq_no, w.owner_id, w.customer_id, w.qty, w.val, case when is_full() then w.m end, r.name, coalesce(round(w.val*r.pct/100,2),0)
  from w left join lateral (select * from incentive_rules r where w.qty>=r.min_qty and w.val>=r.min_value and w.m>=r.margin_from and w.m<r.margin_to order by r.created_at limit 1) r on true $$;

-- ---------- Sales register (all-in-one Tally upload): customers by GSTIN, product variants, invoices + lines, customer -> marketing owner
create or replace function norm_key(t text) returns text language sql immutable as $$ select regexp_replace(lower(coalesce(t,'')),'[^a-z0-9]','','g') $$;
alter table customers add column if not exists gstins text[] not null default '{}';
alter table customers add column if not exists exec_id uuid references profiles(id);
alter table customers add column if not exists source text;
create index if not exists customers_gstins_gin on customers using gin(gstins);
create table if not exists product_variants(id uuid primary key default gen_random_uuid(), name text not null, key text not null unique, category text not null default 'Packaging',
  active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now());
alter table sales_uploads add column if not exists kind text not null default 'erp';
create table if not exists sales_invoices(id uuid primary key default gen_random_uuid(), upload_id uuid not null references sales_uploads on delete cascade, month text not null, invoice_no text not null,
  invoice_date date, customer_id uuid references customers, customer_name text, gstin text, so_no text, exec_id uuid references profiles(id), exec_raw text, exec_source text, is_common boolean not null default false,
  is_credit_note boolean not null default false, is_cancelled boolean not null default false, lines int, qty numeric, value numeric, cgst numeric, sgst numeric, igst numeric, freight numeric, tcs numeric,
  round_off numeric, gross_total numeric, remarks text, created_at timestamptz default now(), updated_at timestamptz default now());
create unique index if not exists sales_invoices_no on sales_invoices(lower(trim(invoice_no)));
create index if not exists sales_invoices_month on sales_invoices(month); create index if not exists sales_invoices_cust on sales_invoices(customer_id);
alter table sales_lines add column if not exists sales_invoice_id uuid references sales_invoices on delete cascade;
alter table sales_lines add column if not exists line_no int;
alter table sales_lines add column if not exists gstin text;
alter table sales_lines add column if not exists variant text;
alter table sales_lines add column if not exists category text;
alter table sales_lines add column if not exists rate numeric;
alter table sales_lines add column if not exists is_credit_note boolean not null default false;
alter table sales_lines add column if not exists exec_source text;
alter table sales_lines add column if not exists tax numeric;
alter table sales_lines add column if not exists gross_total numeric;
create index if not exists sales_lines_cust on sales_lines(customer_id);
-- only management may change who owns a customer
create or replace function trg_cust_owner() returns trigger language plpgsql as $$
begin if new.exec_id is distinct from old.exec_id and not (is_full() or has_cap('customers')) and coalesce(current_setting('dppl.owner_sync',true),'')<>'on' then raise exception 'Only HR Admin / info@ can change the customer''s marketing owner'; end if; return new; end $$;
drop trigger if exists t_cust_owner on customers; create trigger t_cust_owner before update on customers for each row execute function trg_cust_owner();
do $$ declare t text; begin foreach t in array array['product_variants','sales_invoices'] loop
  execute format('alter table %I enable row level security',t);
  execute (select coalesce(string_agg(format('drop policy if exists %I on %I;',policyname,t),' '),'select 1') from pg_policies where schemaname='public' and tablename=t);
  execute format('create policy adm_%1$s on %1$I for all using (is_admin()) with check (is_admin())',t); end loop; end $$;
drop trigger if exists t_audit on product_variants; create trigger t_audit after insert or update or delete on product_variants for each row execute function trg_audit();
create policy r_pv on product_variants for select using (signed_in());
-- invoices from the register follow the sales_lines rule: management all, marketing own/team, accounts read
create policy r_si on sales_invoices for select using (is_full() or exec_id in (select my_team()));
create policy acc_si_r on sales_invoices for select using (has_role('accounts'));

-- One month of the register per call (atomic). Re-uploading a month replaces it, so the same file never duplicates.
create or replace function import_sales_register(p_month text, p_file text, p_rows jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; v_cid uuid; n_new int:=0; n_match int:=0; n_var int:=0; n_sku int:=0; up uuid; n_inv int; n_lines int; v_val numeric; v_qty numeric;
begin
  if not (is_admin() or has_cap('sales_import')) then raise exception 'Only HR Admin or a user with the sales-upload permission can import the sales register'; end if;
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then raise exception 'Bad month %', p_month; end if;
  if to_regclass('pg_temp._reg') is not null then drop table pg_temp._reg; end if;
  create temp table _reg as select x.*, null::uuid cid, null::uuid xid, null::text xsrc
    from jsonb_to_recordset(p_rows) as x(src_row int, inv_no text, inv_date date, customer text, gstin text, customer_code text, variant text, category text, qty numeric, rate numeric, value numeric,
      gross_total numeric, cgst numeric, sgst numeric, igst numeric, freight numeric, tcs numeric, round_off numeric, exec text, so_no text, sku_code text, remarks text, cancelled boolean, credit_note boolean, line_no int);
  update _reg set gstin=nullif(upper(trim(gstin)),''), customer=trim(customer), inv_no=trim(inv_no), customer_code=nullif(trim(customer_code),''), exec=nullif(trim(exec),''),
    cancelled=coalesce(cancelled,false), credit_note=coalesce(credit_note,false);
  if exists(select 1 from _reg where inv_no is null or inv_no='' or inv_date is null) then raise exception 'Every row needs Inv No and Date'; end if;
  if exists(select 1 from _reg where to_char(inv_date,'YYYY-MM')<>p_month) then raise exception 'Rows outside % in this batch', p_month; end if;
  -- replace the month (and any of these invoice numbers filed under another month)
  delete from sales_uploads where month=p_month;
  delete from sales_invoices where lower(trim(invoice_no)) in (select lower(inv_no) from _reg);
  -- customers: code -> GSTIN (any of the customer's GSTINs) -> same PAN (GSTIN chars 3-12) -> name; new ones are created
  for r in select distinct on (k) customer, gstin, customer_code from (select g.*, coalesce(g.gstin,norm_key(g.customer)) k, count(*) over (partition by coalesce(g.gstin,norm_key(g.customer)), norm_key(g.customer)) nn
           from _reg g where not g.cancelled and coalesce(g.customer,'')<>'') z order by k, nn desc, src_row loop  -- new customer takes the most-used spelling for that GSTIN
    v_cid:=null;
    if r.customer_code is not null then select id into v_cid from customers where lower(customer_code)=lower(r.customer_code) limit 1; end if;
    if v_cid is null and r.gstin is not null then select id into v_cid from customers where upper(gstin)=r.gstin or r.gstin=any(gstins) order by created_at limit 1; end if;
    if v_cid is null and length(r.gstin)=15 then select id into v_cid from customers where exists(select 1 from unnest(gstins||gstin) x where substr(x,3,10)=substr(r.gstin,3,10)) order by created_at limit 1; end if; -- same PAN = same company, other state/branch
    if v_cid is null then select id into v_cid from customers where norm_key(name)=norm_key(r.customer) order by created_at limit 1; end if;
    if v_cid is null then
      insert into customers(name,mobile,gstin,gstins,customer_code,source,created_by) values(r.customer,'',r.gstin,case when r.gstin is null then '{}' else array[r.gstin] end,r.customer_code,'sales register',auth.uid()) returning id into v_cid; n_new:=n_new+1;
    else n_match:=n_match+1;
      if r.gstin is not null then update customers set gstins=case when r.gstin=any(gstins) then gstins else gstins||r.gstin end, gstin=coalesce(nullif(gstin,''),r.gstin)
        where id=v_cid and (not (r.gstin=any(gstins)) or coalesce(gstin,'')=''); end if; end if;
  end loop;
  update _reg g set cid=coalesce(
    (select id from customers c where g.customer_code is not null and lower(c.customer_code)=lower(g.customer_code) limit 1),
    (select id from customers c where g.gstin is not null and (upper(c.gstin)=g.gstin or g.gstin=any(c.gstins)) order by created_at limit 1),
    (select id from customers c where length(g.gstin)=15 and exists(select 1 from unnest(c.gstins||c.gstin) x where substr(x,3,10)=substr(g.gstin,3,10)) order by created_at limit 1),
    (select id from customers c where norm_key(c.name)=norm_key(g.customer) order by created_at limit 1));
  -- product variants (Tally "Varient") and optional customer SKU codes
  insert into product_variants(name,key,category) select distinct on (norm_key(variant)) trim(variant), norm_key(variant), coalesce(nullif(category,''),'Packaging') from _reg
    where norm_key(variant)<>'' order by norm_key(variant), src_row on conflict (key) do nothing; get diagnostics n_var=row_count;
  insert into skus(customer_id,sku_code,description) select distinct on (g.cid, g.sku_code) g.cid, trim(g.sku_code), g.variant from _reg g where g.cid is not null and coalesce(trim(g.sku_code),'')<>''
    on conflict (customer_id,sku_code) do nothing; get diagnostics n_sku=row_count;
  -- marketing person: file column (alias table, then email/name/emp code) -> customer owner -> unassigned (common)
  update _reg g set xid=a.exec_id, xsrc=case when a.is_common then 'file-common' else 'file' end from exec_aliases a where g.exec is not null and a.alias=norm_key(g.exec);
  update _reg g set xid=p.id, xsrc='file' from profiles p where g.xsrc is null and g.exec is not null
    and norm_key(g.exec) in (norm_key(p.email),norm_key(p.full_name),norm_key(split_part(p.email,'@',1)),nullif(norm_key(p.emp_code),''));
  update _reg g set xid=c.exec_id, xsrc='customer' from customers c where g.xsrc is null and c.id=g.cid and c.exec_id is not null;
  select coalesce(sum(value),0), coalesce(sum(qty),0) into v_val, v_qty from _reg where not cancelled;
  insert into sales_uploads(month,file_name,rows,total_value,kind) values(p_month,p_file,(select count(*) from _reg where not cancelled),v_val,'register') returning id into up;
  insert into sales_invoices(upload_id,month,invoice_no,invoice_date,customer_id,customer_name,gstin,so_no,exec_id,exec_raw,exec_source,is_common,is_credit_note,is_cancelled,lines,qty,value,cgst,sgst,igst,freight,tcs,round_off,gross_total,remarks)
  select up,p_month,min(inv_no),min(inv_date),(array_agg(cid order by line_no))[1],(array_agg(customer order by line_no))[1],(array_agg(gstin order by line_no))[1],
    string_agg(distinct so_no,', '),(array_agg(xid order by line_no))[1],(array_agg(exec order by line_no))[1],(array_agg(xsrc order by line_no))[1],(array_agg(xid order by line_no))[1] is null,
    bool_or(credit_note),bool_and(cancelled),count(*) filter (where not cancelled),sum(qty),sum(value),sum(cgst),sum(sgst),sum(igst),sum(freight),sum(tcs),sum(round_off),sum(gross_total),string_agg(distinct remarks,'; ')
  from _reg group by lower(inv_no); get diagnostics n_inv=row_count;
  insert into sales_lines(upload_id,month,invoice_no,invoice_date,customer_code,customer_name,customer_id,sku,qty,unit,value,so_no,exec_raw,exec_id,is_common,
    sales_invoice_id,line_no,gstin,variant,category,rate,is_credit_note,exec_source,tax,gross_total)
  select up,p_month,g.inv_no,g.inv_date,g.customer_code,g.customer,g.cid,coalesce(nullif(trim(g.sku_code),''),g.variant),g.qty,case when g.qty is not null then 'kg' end,coalesce(g.value,0),g.so_no,g.exec,g.xid,g.xid is null,
    si.id,g.line_no,g.gstin,g.variant,g.category,g.rate,g.credit_note,g.xsrc,coalesce(g.cgst,0)+coalesce(g.sgst,0)+coalesce(g.igst,0),g.gross_total
  from _reg g join sales_invoices si on lower(trim(si.invoice_no))=lower(g.inv_no) where not g.cancelled; get diagnostics n_lines=row_count;
  drop table pg_temp._reg;
  return jsonb_build_object('month',p_month,'lines',n_lines,'invoices',n_inv,'customers_new',n_new,'customers_matched',n_match,'variants_new',n_var,'skus_new',n_sku,'value',v_val,'qty',v_qty,
    'credit_notes',(select count(*) from sales_invoices where upload_id=up and is_credit_note),'cancelled',(select count(*) from sales_invoices where upload_id=up and is_cancelled),
    'unassigned_lines',(select count(*) from sales_lines where upload_id=up and exec_id is null));
end $$;

-- Assign customers to marketing persons in bulk: p = [{"customer_id":..,"exec_id":.. or null}]. Re-tags that customer's register sales
-- (rows whose marketing person came from the file itself are left alone). exec_id null = common / unassigned.
create or replace function assign_customer_execs(p jsonb) returns int language plpgsql set search_path=public as $$
declare r record; n int:=0;
begin
  if not is_admin() then raise exception 'Only HR Admin can assign customer owners'; end if;
  for r in select * from jsonb_to_recordset(p) as x(customer_id uuid, exec_id uuid) loop
    if r.exec_id is not null and not exists(select 1 from profiles where id=r.exec_id and role='marketing') then raise exception 'Not a marketing person: %', r.exec_id; end if;
    update customers set exec_id=r.exec_id where id=r.customer_id and exec_id is distinct from r.exec_id;
    update sales_lines set exec_id=r.exec_id, is_common=r.exec_id is null, exec_source=case when r.exec_id is null then null else 'customer' end
      where customer_id=r.customer_id and coalesce(exec_source,'') not in ('file','file-common');
    update sales_invoices set exec_id=r.exec_id, is_common=r.exec_id is null, exec_source=case when r.exec_id is null then null else 'customer' end
      where customer_id=r.customer_id and coalesce(exec_source,'') not in ('file','file-common');
    n:=n+1; end loop;
  return n; end $$;

-- ---------- Customerwise monthly sales (Bala's "Customerwise Sales Details" sheet: marketing person × product × customer × month, quantity in kg)
-- One upload per financial year; re-uploading a FY replaces it (the current-year sheet grows every month). The file is the authoritative
-- customer -> marketing person mapping: after each upload customers.exec_id follows it and register sales are re-tagged.
alter table customers add column if not exists name_aliases text[] not null default '{}';
create table if not exists customerwise_uploads(id uuid primary key default gen_random_uuid(), fy text not null unique check (fy ~ '^\d{4}-\d{2}$'), file_name text, sheet text,
  lines int, rows int, total_qty numeric, months_covered text[] not null default '{}', uploaded_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists customerwise_sales(id uuid primary key default gen_random_uuid(), upload_id uuid not null references customerwise_uploads on delete cascade, fy text not null, month text not null check (month ~ '^\d{4}-\d{2}$'),
  customer_id uuid references customers, customer_name text not null, product text, exec_id uuid references profiles(id), exec_raw text, qty numeric not null, unit text not null default 'kg', src_row int,
  created_at timestamptz default now(), updated_at timestamptz default now());
create index if not exists cws_fy on customerwise_sales(fy); create index if not exists cws_cust on customerwise_sales(customer_id); create index if not exists cws_exec on customerwise_sales(exec_id);
do $$ declare t text; begin foreach t in array array['customerwise_uploads','customerwise_sales'] loop
  execute format('alter table %I enable row level security',t);
  execute (select coalesce(string_agg(format('drop policy if exists %I on %I;',policyname,t),' '),'select 1') from pg_policies where schemaname='public' and tablename=t);
  execute format('create policy adm_%1$s on %1$I for all using (is_admin()) with check (is_admin())',t); end loop; end $$;
drop trigger if exists t_audit on customerwise_uploads; create trigger t_audit after insert or update or delete on customerwise_uploads for each row execute function trg_audit();
create policy r_cwu on customerwise_uploads for select using (signed_in());
-- quantities: management, accounts, the uploader (sales_import) and the target setter (targets) see all; marketing sees own/team
create policy r_cws on customerwise_sales for select using (is_full() or has_role('accounts') or has_cap('sales_import') or has_cap('targets') or exec_id in (select my_team()));

-- capability holders: uploader (info@) logs imports and keeps marketing-name mappings; target setter (Balaji) manages every marketing person's targets
drop policy if exists cap_implog_r on import_logs; create policy cap_implog_r on import_logs for select using (has_cap('sales_import') and by_id=auth.uid());
drop policy if exists cap_implog_i on import_logs; create policy cap_implog_i on import_logs for insert with check (has_cap('sales_import') and by_id=auth.uid());
drop policy if exists cap_alias_r on exec_aliases; create policy cap_alias_r on exec_aliases for select using (has_cap('sales_import'));
drop policy if exists cap_alias_i on exec_aliases; create policy cap_alias_i on exec_aliases for insert with check (has_cap('sales_import'));
drop policy if exists cap_alias_u on exec_aliases; create policy cap_alias_u on exec_aliases for update using (has_cap('sales_import'));
drop policy if exists cap_tgt on targets; create policy cap_tgt on targets for all using (has_cap('targets'))
  with check (has_cap('targets') and exists(select 1 from profiles p where p.id=exec_id and p.role='marketing'));
drop policy if exists cap_sl_r on sales_lines; create policy cap_sl_r on sales_lines for select using (has_cap('targets'));  -- target setter sees everyone's actual sales

-- Make customers.exec_id follow the customerwise file: per customer, the marketing person with the most kg in the latest FY where the customer
-- has a mapped person. Register sales lines/invoices are re-tagged (rows whose person came from a Marketing Person column are kept).
create or replace function sync_customer_owners_from_cws() returns jsonb language plpgsql security definer set search_path=public as $$
declare n_c int; n_l int; n_i int;
begin
  if not (is_admin() or has_cap('sales_import')) then raise exception 'Not allowed'; end if;
  create temp table _own on commit drop as
    select distinct on (customer_id) customer_id, exec_id from (
      select customer_id, fy, exec_id, sum(qty) q from customerwise_sales where customer_id is not null and exec_id is not null group by 1,2,3) z
    order by customer_id, fy desc, q desc;
  perform set_config('dppl.owner_sync','on',true);
  update customers c set exec_id=o.exec_id from _own o where c.id=o.customer_id and c.exec_id is distinct from o.exec_id; get diagnostics n_c=row_count;
  perform set_config('dppl.owner_sync','',true);
  update sales_lines l set exec_id=o.exec_id, is_common=false, exec_source='customer' from _own o
    where l.customer_id=o.customer_id and coalesce(l.exec_source,'') not in ('file','file-common') and l.exec_id is distinct from o.exec_id; get diagnostics n_l=row_count;
  update sales_invoices s set exec_id=o.exec_id, is_common=false, exec_source='customer' from _own o
    where s.customer_id=o.customer_id and coalesce(s.exec_source,'') not in ('file','file-common') and s.exec_id is distinct from o.exec_id; get diagnostics n_i=row_count;
  drop table _own;
  return jsonb_build_object('customers_reassigned',n_c,'sales_lines_retagged',n_l,'sales_invoices_retagged',n_i);
end $$;

-- One financial year per call (atomic). p_rows: [{src_row, exec, exec_id?, product, customer, customer_id?, month 'YYYY-MM', qty}]
-- customer_id / exec_id are the app's suggested matches (fuzzy names); the database verifies them and otherwise matches by name / saved alias or creates the customer.
create or replace function import_customerwise(p_fy text, p_file text, p_sheet text, p_rows jsonb, p_sync_owners boolean default true) returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; v_cid uuid; n_new int:=0; up uuid; v_qty numeric; n_rows int; v_sync jsonb:='{}'; v_from text; v_to text;
begin
  if not (is_admin() or has_cap('sales_import')) then raise exception 'Only HR Admin or a user with the sales-upload permission can import customerwise sales'; end if;
  if p_fy is null or p_fy !~ '^\d{4}-\d{2}$' or (substr(p_fy,1,4)::int+1)%100<>substr(p_fy,6,2)::int then raise exception 'Bad financial year % (use 2025-26)', p_fy; end if;
  v_from:=substr(p_fy,1,4)||'-04'; v_to:=(substr(p_fy,1,4)::int+1)||'-03';
  if to_regclass('pg_temp._cw') is not null then drop table pg_temp._cw; end if;
  create temp table _cw as select x.*, null::uuid cid, null::uuid xid from jsonb_to_recordset(p_rows) as x(src_row int, exec text, exec_id uuid, product text, customer text, customer_id uuid, month text, qty numeric);
  update _cw set customer=nullif(regexp_replace(trim(customer),'\s+',' ','g'),''), exec=nullif(trim(exec),''), product=nullif(trim(product),'');
  if exists(select 1 from _cw where customer is null or qty is null or month is null) then raise exception 'Every row needs Customer Name, month and quantity'; end if;
  if exists(select 1 from _cw where month !~ '^\d{4}-\d{2}$' or month<v_from or month>v_to) then raise exception 'Rows outside FY % (Apr % – Mar %)', p_fy, v_from, v_to; end if;
  -- customers: app suggestion (if it exists) -> exact name / saved alias -> create
  update _cw g set cid=g.customer_id where g.customer_id is not null and exists(select 1 from customers c where c.id=g.customer_id);
  update _cw g set cid=(select id from customers c where norm_key(c.name)=norm_key(g.customer) or norm_key(g.customer)=any(select norm_key(a) from unnest(c.name_aliases) a) order by created_at limit 1) where g.cid is null;
  for r in select distinct on (norm_key(customer)) customer from _cw where cid is null order by norm_key(customer), src_row loop
    insert into customers(name,mobile,source,created_by) values(r.customer,'','customerwise sales',auth.uid()) returning id into v_cid; n_new:=n_new+1;
    update _cw set cid=v_cid where cid is null and norm_key(customer)=norm_key(r.customer); end loop;
  -- remember the file's spelling so next month's upload matches exactly
  update customers c set name_aliases=c.name_aliases||a.names from (select cid, array_agg(distinct customer) names from _cw g group by cid) a
    where c.id=a.cid and not (a.names <@ (c.name_aliases||c.name));
  -- marketing person: app suggestion (must be a marketing profile) -> saved alias -> name / email / emp code; unknown names stay as text (exec_raw)
  update _cw g set xid=g.exec_id from profiles p where g.exec_id is not null and p.id=g.exec_id and p.role='marketing';
  update _cw g set xid=a.exec_id from exec_aliases a where g.xid is null and g.exec is not null and a.alias=norm_key(g.exec) and not a.is_common;
  update _cw g set xid=p.id from profiles p where g.xid is null and g.exec is not null and p.role='marketing'
    and norm_key(g.exec) in (norm_key(p.full_name),norm_key(split_part(p.email,'@',1)),norm_key(p.email),nullif(norm_key(p.emp_code),''));
  insert into exec_aliases(alias,raw_name,exec_id) select distinct on (norm_key(exec)) norm_key(exec), exec, xid from _cw where xid is not null and exec is not null and norm_key(exec)<>''
    order by norm_key(exec) on conflict (alias) do update set exec_id=excluded.exec_id, raw_name=excluded.raw_name, is_common=false;
  delete from customerwise_uploads where fy=p_fy;
  select coalesce(sum(qty),0), count(*) into v_qty, n_rows from _cw;
  insert into customerwise_uploads(fy,file_name,sheet,lines,rows,total_qty,months_covered)
    values(p_fy,p_file,p_sheet,(select count(distinct src_row) from _cw),n_rows,v_qty,(select coalesce(array_agg(distinct month order by month),'{}') from _cw)) returning id into up;
  insert into customerwise_sales(upload_id,fy,month,customer_id,customer_name,product,exec_id,exec_raw,qty,src_row)
    select up,p_fy,month,cid,customer,product,xid,exec,qty,src_row from _cw;
  if p_sync_owners then v_sync:=sync_customer_owners_from_cws(); end if;
  return jsonb_build_object('fy',p_fy,'rows',n_rows,'lines',(select lines from customerwise_uploads where id=up),'qty',v_qty,'customers',(select count(distinct cid) from _cw),'customers_new',n_new,
    'unmatched_execs',(select coalesce(jsonb_agg(distinct exec),'[]') from _cw where xid is null and exec is not null),
    'by_exec',(select jsonb_object_agg(k,q) from (select coalesce(p.full_name,g.exec,'(blank)') k, sum(g.qty) q from _cw g left join profiles p on p.id=g.xid group by 1) z))||v_sync;
end $$;
revoke execute on function sync_customer_owners_from_cws() from anon;
revoke execute on function import_customerwise(text,text,text,jsonb,boolean) from anon;

-- ---------- grants (Supabase already grants these by default; explicit for clarity)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke all on doc_counters from authenticated;

-- ---------- defaults (no sample business data: the live DB starts clean; test fixtures live in supabase/test/rls_test.sql)
insert into incentive_rules(name,min_qty,min_value,margin_from,margin_to,pct)
 select * from (values ('[PLACEHOLDER] Slab A',10000,100000,12,18,0.5),('[PLACEHOLDER] Slab B',10000,100000,18,25,1.0),('[PLACEHOLDER] Slab C',25000,250000,25,100,1.5)) v(a,b,c,d,e,f)
 where not exists (select 1 from incentive_rules);
insert into settings(margin_min_pct) select 12 where not exists (select 1 from settings);

-- ---------- v1.6.0: dashboards for every login + live refresh
-- Accounts and sales-upload users (info@) see all kg targets for the team dashboard
drop policy if exists r_tgt_sales on targets; create policy r_tgt_sales on targets for select using (has_role('accounts') or has_cap('sales_import') or has_cap('targets'));
-- Company kg per month (no customer detail) for roles without sales access (planning, dispatch, factory): actual + target totals
create or replace function team_kg_monthly() returns table(fy text, month text, kg numeric, target_kg numeric)
 language sql stable security definer set search_path = public as $$
 with a as (select fy, month, sum(qty) kg from customerwise_sales group by fy, month),
      t as (select period as month, sum(qty) as target_kg from targets where period ~ '^\d{4}-\d{2}$' and qty is not null group by period)
 select coalesce(a.fy, case when substr(t.month,6,2)::int>=4 then substr(t.month,1,4)||'-'||lpad(((substr(t.month,1,4)::int+1)%100)::text,2,'0') else (substr(t.month,1,4)::int-1)::text||'-'||substr(t.month,3,2) end) as fy,
        coalesce(a.month, t.month) as month, coalesce(a.kg,0) as kg, t.target_kg
 from a full join t on t.month = a.month where auth.uid() is not null order by 2 $$;
revoke all on function team_kg_monthly() from public, anon; grant execute on function team_kg_monthly() to authenticated;
-- Realtime: the app re-loads when these change (RLS still applies to every subscriber)
do $$ declare t text; begin
 foreach t in array array['customerwise_uploads','targets','orders','enquiries','visits','tasks','messages','message_recipients','dispatch_plans','sales_uploads'] loop
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I', t); end if;
 end loop; end $$;

-- ---------- v1.7.0: marketing persons see only their own customers (Bala t43u); only HR Admin / info@ add or edit customers
create or replace function is_mkt() returns boolean language sql stable security definer set search_path = public as $$ select coalesce((select role='marketing' from profiles where id=auth.uid() and active),false) $$;
create or replace function cust_mine(c uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from customers where id=c and exec_id=auth.uid()) $$;
create or replace function can_cust_write() returns boolean language sql stable security definer set search_path = public as $$ select is_admin() or has_cap('customers') or has_cap('sales_import') $$;
-- restrictive policies are AND-ed with the existing permissive ones, so other roles keep their current access
drop policy if exists mk_own_customers on customers; create policy mk_own_customers on customers as restrictive for select using (not is_mkt() or exec_id = auth.uid());
drop policy if exists cw_cust_i on customers; create policy cw_cust_i on customers as restrictive for insert with check (can_cust_write());
drop policy if exists cw_cust_u on customers; create policy cw_cust_u on customers as restrictive for update using (can_cust_write() or has_role('accounts'));
do $$ declare t text; begin
 foreach t in array array['customerwise_sales','orders','invoices','sales_invoices','sales_lines','complaints','customer_history','dispatch_plans','skus'] loop
  execute format('drop policy if exists mk_own_%1$s on %1$I', t);
  execute format('create policy mk_own_%1$s on %1$I as restrictive for select using (not is_mkt() or customer_id is null or cust_mine(customer_id))', t);
 end loop; end $$;
drop policy if exists mk_own_samples on samples; create policy mk_own_samples on samples as restrictive for select using (not is_mkt() or sku_id is null or exists(select 1 from skus s where s.id=samples.sku_id and (s.customer_id is null or cust_mine(s.customer_id))));
drop policy if exists mk_own_artworks on artworks; create policy mk_own_artworks on artworks as restrictive for select using (not is_mkt() or sku_id is null or exists(select 1 from skus s where s.id=artworks.sku_id and (s.customer_id is null or cust_mine(s.customer_id))));
drop policy if exists mk_own_order_stages on order_stages; create policy mk_own_order_stages on order_stages as restrictive for select using (not is_mkt() or exists(select 1 from orders o where o.id=order_stages.order_id and (o.customer_id is null or cust_mine(o.customer_id))));
drop policy if exists mk_own_dispatches on dispatches; create policy mk_own_dispatches on dispatches as restrictive for select using (not is_mkt() or exists(select 1 from orders o where o.id=dispatches.order_id and (o.customer_id is null or cust_mine(o.customer_id))));
-- collections / invoice_followups already require a visible invoice (EXISTS on invoices), so they follow the invoices rule
-- person-level kg (no customer names) for dashboards and target cards: team view for admins/accounts/info@/targets cap; own only for marketing
create or replace function kg_by_person() returns table(fy text, month text, exec_id uuid, kg numeric)
 language sql stable security definer set search_path = public as $$
 select s.fy, s.month, s.exec_id, sum(s.qty) from customerwise_sales s
 where auth.uid() is not null and (is_full() or has_role('accounts') or has_cap('sales_import') or has_cap('targets') or s.exec_id = auth.uid())
 group by 1,2,3 order by 2 $$;
revoke all on function kg_by_person() from public, anon; grant execute on function kg_by_person() to authenticated;
revoke all on function cust_mine(uuid) from public, anon; grant execute on function cust_mine(uuid) to authenticated;
-- (live: info@ was given the 'customers' cap in Setup → Users)
drop policy if exists cap_cust_i on customers; create policy cap_cust_i on customers for insert with check (has_cap('customers'));
drop policy if exists cap_cust_u on customers; create policy cap_cust_u on customers for update using (has_cap('customers'));

-- ---------- v1.8.0: marketing (Nathan, Jesaon, Suresh, Sanjeev) see only their own person-level data; Balaji = CEO (full view) but still a sales person
create or replace function is_seller(u uuid) returns boolean language sql stable security definer set search_path=public as
 $$ select exists(select 1 from profiles where id=u and (role='marketing' or 'sales_person'=any(coalesce(caps,'{}')))) $$;
grant execute on function is_seller(uuid) to authenticated;
create or replace function enq_mine(e uuid) returns boolean language sql stable security definer set search_path=public as
 $$ select exists(select 1 from enquiries where id=e and owner_id=auth.uid()) $$;
grant execute on function enq_mine(uuid) to authenticated;
-- targets may be set for any sales person (marketing role or sales_person cap)
drop policy if exists cap_tgt on targets;
create policy cap_tgt on targets for all using (has_cap('targets')) with check (has_cap('targets') and is_seller(exec_id));
-- restrictive own-person rules for role=marketing
do $$ declare t text; begin
  foreach t in array array['enquiries','tasks'] loop
    execute format('drop policy if exists mk_self_%1$s on %1$s', t);
    execute format('create policy mk_self_%1$s on %1$s as restrictive for all to authenticated using (not is_mkt() or owner_id=auth.uid()) with check (not is_mkt() or owner_id=auth.uid())', t);
  end loop;
  foreach t in array array['quotations','specs','activities'] loop
    execute format('drop policy if exists mk_self_%1$s on %1$s', t);
    execute format('create policy mk_self_%1$s on %1$s as restrictive for all to authenticated using (not is_mkt() or enquiry_id is null or enq_mine(enquiry_id)) with check (not is_mkt() or enquiry_id is null or enq_mine(enquiry_id))', t);
  end loop;
  drop policy if exists mk_self_visits on visits;
  create policy mk_self_visits on visits as restrictive for all to authenticated using (not is_mkt() or by_id=auth.uid()) with check (not is_mkt() or by_id=auth.uid());
  drop policy if exists mk_self_targets on targets;
  create policy mk_self_targets on targets as restrictive for select to authenticated using (not is_mkt() or exec_id=auth.uid());
  foreach t in array array['customerwise_sales','sales_lines','sales_invoices','invoices'] loop
    execute format('drop policy if exists mk_self_%1$s on %1$s', t);
    execute format('create policy mk_self_%1$s on %1$s as restrictive for select to authenticated using (not is_mkt() or exec_id is null or exec_id=auth.uid())', t);
  end loop;
  -- other marketing people's profiles are hidden from marketing (names of non-marketing staff stay visible)
  drop policy if exists mk_self_profiles on profiles;
  create policy mk_self_profiles on profiles as restrictive for select to authenticated using (not is_mkt() or id=auth.uid() or role<>'marketing');
end $$;
-- aggregates: marketing get only their own person
create or replace function kg_by_person() returns table(fy text, month text, exec_id uuid, kg numeric) language sql stable security definer set search_path=public as $$
 select s.fy, s.month, s.exec_id, sum(s.qty) from customerwise_sales s
 where auth.uid() is not null and (s.exec_id = auth.uid() or (not is_mkt() and (is_full() or has_role('accounts') or has_cap('sales_import') or has_cap('targets'))))
 group by 1,2,3 order by 2 $$;
create or replace function team_kg_monthly() returns table(fy text, month text, kg numeric, target_kg numeric) language sql stable security definer set search_path=public as $$
 with a as (select fy, month, sum(qty) kg from customerwise_sales where not is_mkt() or exec_id=auth.uid() group by fy, month),
      t as (select period as month, sum(qty) as target_kg from targets where period ~ '^\d{4}-\d{2}$' and qty is not null and (not is_mkt() or exec_id=auth.uid()) group by period)
 select coalesce(a.fy, case when substr(t.month,6,2)::int>=4 then substr(t.month,1,4)||'-'||lpad(((substr(t.month,1,4)::int+1)%100)::text,2,'0') else (substr(t.month,1,4)::int-1)::text||'-'||substr(t.month,3,2) end) as fy,
        coalesce(a.month, t.month) as month, coalesce(a.kg,0) as kg, t.target_kg
 from a full join t on t.month = a.month where auth.uid() is not null order by 2 $$;
grant execute on function kg_by_person() to authenticated;
grant execute on function team_kg_monthly() to authenticated;

CREATE OR REPLACE FUNCTION public.import_customerwise(p_fy text, p_file text, p_sheet text, p_rows jsonb, p_sync_owners boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_cid uuid; n_new int:=0; up uuid; v_qty numeric; n_rows int; v_sync jsonb:='{}'; v_from text; v_to text;
begin
  if not (is_admin() or has_cap('sales_import')) then raise exception 'Only HR Admin or a user with the sales-upload permission can import customerwise sales'; end if;
  if p_fy is null or p_fy !~ '^\d{4}-\d{2}$' or (substr(p_fy,1,4)::int+1)%100<>substr(p_fy,6,2)::int then raise exception 'Bad financial year % (use 2025-26)', p_fy; end if;
  v_from:=substr(p_fy,1,4)||'-04'; v_to:=(substr(p_fy,1,4)::int+1)||'-03';
  if to_regclass('pg_temp._cw') is not null then drop table pg_temp._cw; end if;
  create temp table _cw as select x.*, null::uuid cid, null::uuid xid from jsonb_to_recordset(p_rows) as x(src_row int, exec text, exec_id uuid, product text, customer text, customer_id uuid, month text, qty numeric);
  update _cw set customer=nullif(regexp_replace(trim(customer),'\s+',' ','g'),''), exec=nullif(trim(exec),''), product=nullif(trim(product),'');
  if exists(select 1 from _cw where customer is null or qty is null or month is null) then raise exception 'Every row needs Customer Name, month and quantity'; end if;
  if exists(select 1 from _cw where month !~ '^\d{4}-\d{2}$' or month<v_from or month>v_to) then raise exception 'Rows outside FY % (Apr % – Mar %)', p_fy, v_from, v_to; end if;
  -- customers: app suggestion (if it exists) -> exact name / saved alias -> create
  update _cw g set cid=g.customer_id where g.customer_id is not null and exists(select 1 from customers c where c.id=g.customer_id);
  update _cw g set cid=(select id from customers c where norm_key(c.name)=norm_key(g.customer) or norm_key(g.customer)=any(select norm_key(a) from unnest(c.name_aliases) a) order by created_at limit 1) where g.cid is null;
  for r in select distinct on (norm_key(customer)) customer from _cw where cid is null order by norm_key(customer), src_row loop
    insert into customers(name,mobile,source,created_by) values(r.customer,'','customerwise sales',auth.uid()) returning id into v_cid; n_new:=n_new+1;
    update _cw set cid=v_cid where cid is null and norm_key(customer)=norm_key(r.customer); end loop;
  -- remember the file's spelling so next month's upload matches exactly
  update customers c set name_aliases=c.name_aliases||a.names from (select cid, array_agg(distinct customer) names from _cw g group by cid) a
    where c.id=a.cid and not (a.names <@ (c.name_aliases||c.name));
  -- marketing person: app suggestion (must be a marketing profile) -> saved alias -> name / email / emp code; unknown names stay as text (exec_raw)
  update _cw g set xid=g.exec_id from profiles p where g.exec_id is not null and p.id=g.exec_id and is_seller(p.id);
  update _cw g set xid=a.exec_id from exec_aliases a where g.xid is null and g.exec is not null and a.alias=norm_key(g.exec) and not a.is_common;
  update _cw g set xid=p.id from profiles p where g.xid is null and g.exec is not null and is_seller(p.id)
    and norm_key(g.exec) in (norm_key(p.full_name),norm_key(split_part(p.email,'@',1)),norm_key(p.email),nullif(norm_key(p.emp_code),''));
  insert into exec_aliases(alias,raw_name,exec_id) select distinct on (norm_key(exec)) norm_key(exec), exec, xid from _cw where xid is not null and exec is not null and norm_key(exec)<>''
    order by norm_key(exec) on conflict (alias) do update set exec_id=excluded.exec_id, raw_name=excluded.raw_name, is_common=false;
  delete from customerwise_uploads where fy=p_fy;
  select coalesce(sum(qty),0), count(*) into v_qty, n_rows from _cw;
  insert into customerwise_uploads(fy,file_name,sheet,lines,rows,total_qty,months_covered)
    values(p_fy,p_file,p_sheet,(select count(distinct src_row) from _cw),n_rows,v_qty,(select coalesce(array_agg(distinct month order by month),'{}') from _cw)) returning id into up;
  insert into customerwise_sales(upload_id,fy,month,customer_id,customer_name,product,exec_id,exec_raw,qty,src_row)
    select up,p_fy,month,cid,customer,product,xid,exec,qty,src_row from _cw;
  if p_sync_owners then v_sync:=sync_customer_owners_from_cws(); end if;
  return jsonb_build_object('fy',p_fy,'rows',n_rows,'lines',(select lines from customerwise_uploads where id=up),'qty',v_qty,'customers',(select count(distinct cid) from _cw),'customers_new',n_new,
    'unmatched_execs',(select coalesce(jsonb_agg(distinct exec),'[]') from _cw where xid is null and exec is not null),
    'by_exec',(select jsonb_object_agg(k,q) from (select coalesce(p.full_name,g.exec,'(blank)') k, sum(g.qty) q from _cw g left join profiles p on p.id=g.xid group by 1) z))||v_sync;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_customer_execs(p jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r record; n int:=0;
begin
  if not is_admin() then raise exception 'Only HR Admin can assign customer owners'; end if;
  for r in select * from jsonb_to_recordset(p) as x(customer_id uuid, exec_id uuid) loop
    if r.exec_id is not null and not exists(select 1 from profiles where id=r.exec_id and (role='marketing' or 'sales_person'=any(coalesce(caps,'{}')))) then raise exception 'Not a marketing person: %', r.exec_id; end if;
    update customers set exec_id=r.exec_id where id=r.customer_id and exec_id is distinct from r.exec_id;
    update sales_lines set exec_id=r.exec_id, is_common=r.exec_id is null, exec_source=case when r.exec_id is null then null else 'customer' end
      where customer_id=r.customer_id and coalesce(exec_source,'') not in ('file','file-common');
    update sales_invoices set exec_id=r.exec_id, is_common=r.exec_id is null, exec_source=case when r.exec_id is null then null else 'customer' end
      where customer_id=r.customer_id and coalesce(exec_source,'') not in ('file','file-common');
    n:=n+1; end loop;
  return n; end $function$;

-- live data change (v1.8, not part of a fresh install): Balaji -> role 'ceo' with caps {targets,broadcast,sales_person}

-- ---------- v1.8.1: every non-marketing role gets read-only team marketing views (discipline, per-person kg, targets)
drop policy if exists r_vis_nonmkt on visits;
create policy r_vis_nonmkt on visits for select to authenticated using (signed_in() and not is_mkt());
drop policy if exists r_tgt_nonmkt on targets;
create policy r_tgt_nonmkt on targets for select to authenticated using (signed_in() and not is_mkt());
create or replace function kg_by_person() returns table(fy text, month text, exec_id uuid, kg numeric) language sql stable security definer set search_path=public as $$
 select s.fy, s.month, s.exec_id, sum(s.qty) from customerwise_sales s
 where auth.uid() is not null and signed_in() and (s.exec_id = auth.uid() or not is_mkt())
 group by 1,2,3 order by 2 $$;
grant execute on function kg_by_person() to authenticated;

-- ---------- make the first HR Admin (run separately, replace the placeholder; never commit a real email)
-- update profiles set role='hr_admin' where email = 'HR_ADMIN_EMAIL_PLACEHOLDER';

-- ---------- v1.9.0 (Bala t47u/t48u/t49u): marketing may type a NEW customer name in New enquiry, Visit report and Sample request.
-- The customer is created server-side, owned by the caller (not spoofable), flagged needs_review; only info@ (customers cap) / HR Admin
-- can rename, change owner, mark reviewed or merge it (also during the monthly customerwise upload). Additive: live v1.8.1 UI unaffected.
alter table customers add column if not exists needs_review boolean not null default false;
alter table customers add column if not exists review_note text;
alter table customers add column if not exists reviewed_by uuid references profiles(id);
alter table customers add column if not exists reviewed_at timestamptz;
alter table visits  add column if not exists customer_id uuid references customers(id);
alter table samples add column if not exists customer_id uuid references customers(id);
create index if not exists customers_needs_review_idx on customers(needs_review) where needs_review;
create index if not exists visits_customer_idx on visits(customer_id);
create index if not exists samples_customer_idx on samples(customer_id);

-- create (or find) a customer from a marketing form; owner = caller (or the executive info@ types for)
create or replace function new_customer_from_form(p_name text, p_source text default 'enquiry', p_contact text default null, p_city text default null, p_mobile text default null)
 returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_mgr boolean; v_name text; v_id uuid; v_ex record; v_note text;
begin
  if v_uid is null or not exists(select 1 from profiles where id=v_uid and active) then raise exception 'Not signed in'; end if;
  v_mgr := is_admin() or has_cap('customers');
  v_owner := case when is_seller(v_uid) then v_uid else acting_for() end;
  if not v_mgr and (v_owner is null or not is_seller(v_owner)) then raise exception 'Only a marketing person (or info@ / HR Admin) can add a customer here'; end if;
  if coalesce(p_source,'') not in ('enquiry','visit','sample') then raise exception 'Bad source %', p_source; end if;
  v_name := regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');
  if length(v_name) < 2 or length(v_name) > 150 or norm_key(v_name) = '' then raise exception 'Enter the customer name (2–150 characters)'; end if;
  -- duplicate check (case / space / punctuation-insensitive, aliases too): own list for marketing, whole list for info@ / HR
  select id, name into v_ex from customers c
   where (norm_key(c.name)=norm_key(v_name) or norm_key(v_name)=any(select norm_key(a) from unnest(c.name_aliases) a))
     and (v_mgr or c.exec_id = v_owner) order by created_at limit 1;
  if found then return jsonb_build_object('id',v_ex.id,'name',v_ex.name,'existing',true); end if;
  if exists(select 1 from customers c where norm_key(c.name)=norm_key(v_name) or norm_key(v_name)=any(select norm_key(a) from unnest(c.name_aliases) a)) then
    v_note := 'Same name already exists in the customer list (another owner / unassigned) — check and merge'; end if;
  insert into customers(name, mobile, city, contact, exec_id, source, created_by, needs_review, review_note)
   values(v_name, coalesce(nullif(trim(p_mobile),''),''), nullif(trim(p_city),''), nullif(trim(p_contact),''), v_owner, p_source, v_uid, not v_mgr, v_note)
   returning id into v_id;
  return jsonb_build_object('id',v_id,'name',v_name,'existing',false,'needs_review',not v_mgr);
end $$;
revoke all on function new_customer_from_form(text,text,text,text,text) from public, anon;
grant execute on function new_customer_from_form(text,text,text,text,text) to authenticated;

-- merge a duplicate into the correct customer: moves every linked record, keeps the duplicate's spelling as an alias, deletes the duplicate
create or replace function merge_customers(p_from uuid, p_into uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare f customers; t customers; n jsonb := '{}'; k int; tb text;
begin
  if not (is_admin() or has_cap('customers')) then raise exception 'Only info@ / HR Admin can merge customers'; end if;
  if p_from = p_into then raise exception 'Pick two different customers'; end if;
  select * into f from customers where id=p_from for update; select * into t from customers where id=p_into for update;
  if f.id is null or t.id is null then raise exception 'Customer not found'; end if;
  if exists(select 1 from skus a join skus b on b.sku_code=a.sku_code where a.customer_id=p_from and b.customer_id=p_into) then
    raise exception 'Both customers have the same SKU code(s) — rename or remove the duplicate SKU first'; end if;
  foreach tb in array array['enquiries','skus','orders','invoices','complaints','customer_history','sales_lines','dispatch_plans','sales_invoices','customerwise_sales','samples'] loop
    execute format('update %I set customer_id=$1 where customer_id=$2', tb) using p_into, p_from; get diagnostics k = row_count;
    if k>0 then n := n || jsonb_build_object(tb,k); end if; end loop;
  update visits set customer_id=p_into, customer_name=t.name where customer_id=p_from or (customer_id is null and norm_key(customer_name)=norm_key(f.name));
  get diagnostics k = row_count; if k>0 then n := n || jsonb_build_object('visits',k); end if;
  if f.customer_code is not null and t.customer_code is null then update customers set customer_code=null where id=p_from; update customers set customer_code=f.customer_code where id=p_into; end if;
  update customers set name_aliases = (select coalesce(array_agg(distinct a),'{}') from unnest(t.name_aliases || f.name_aliases || f.name) a where a<>t.name),
    contact=coalesce(contact,f.contact), city=coalesce(city,f.city), mobile=coalesce(nullif(mobile,''),nullif(f.mobile,''),''), gstin=coalesce(gstin,f.gstin),
    segment=coalesce(segment,f.segment), exec_id=coalesce(exec_id,f.exec_id), updated_at=now() where id=p_into;
  delete from customers where id=p_from;
  return jsonb_build_object('merged',f.name,'into',t.name,'moved',n);
end $$;
revoke all on function merge_customers(uuid,uuid) from public, anon;
grant execute on function merge_customers(uuid,uuid) to authenticated;

-- review stamp + keep visit names in step with renames
create or replace function trg_cust_review() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='UPDATE' then
    if (new.needs_review is distinct from old.needs_review or new.review_note is distinct from old.review_note) and not (is_admin() or has_cap('customers') or auth.uid() is null)
      then raise exception 'Only info@ / HR Admin can review customers'; end if;
    if old.needs_review and not new.needs_review then new.reviewed_by := auth.uid(); new.reviewed_at := now(); end if;
  end if; return new; end $$;
drop trigger if exists t_cust_review on customers; create trigger t_cust_review before update on customers for each row execute function trg_cust_review();
create or replace function trg_cust_rename() returns trigger language plpgsql security definer set search_path = public as $$
begin if new.name is distinct from old.name then update visits set customer_name=new.name where customer_id=new.id; end if; return null; end $$;
drop trigger if exists t_cust_rename on customers; create trigger t_cust_rename after update of name on customers for each row execute function trg_cust_rename();

-- marketing: a visit / sample may only point at one of their own customers; samples follow own customer + own enquiry
-- (visits: insert/update check only, so a marketing person still sees his own visit after info@ merges the customer into someone else's)
drop policy if exists mk_own_vis_cust on visits;
drop policy if exists mk_own_vis_cust_i on visits;
create policy mk_own_vis_cust_i on visits as restrictive for insert to authenticated with check (not is_mkt() or customer_id is null or cust_mine(customer_id));
drop policy if exists mk_own_vis_cust_u on visits;
create policy mk_own_vis_cust_u on visits as restrictive for update to authenticated using (true) with check (not is_mkt() or customer_id is null or cust_mine(customer_id));
drop policy if exists mk_own_smp_cust on samples;
create policy mk_own_smp_cust on samples as restrictive for all to authenticated
 using (not is_mkt() or ((customer_id is null or cust_mine(customer_id)) and (enquiry_id is null or enq_mine(enquiry_id))))
 with check (not is_mkt() or ((customer_id is null or cust_mine(customer_id)) and (enquiry_id is null or enq_mine(enquiry_id))));
drop policy if exists mk_own_enq_cust on enquiries;
create policy mk_own_enq_cust on enquiries as restrictive for all to authenticated using (true) with check (not is_mkt() or customer_id is null or cust_mine(customer_id));
-- customers.mobile is NOT NULL but many imported customers have none: the app sends '' as null, so keep it '' (fixes "Save changes" on such customers)
create or replace function trg_cust_mobile() returns trigger language plpgsql as $$ begin new.mobile := coalesce(new.mobile,''); return new; end $$;
drop trigger if exists t_cust_mobile on customers; create trigger t_cust_mobile before insert or update on customers for each row execute function trg_cust_mobile();

-- ---------- v1.9.2 (Bala t52u): factory manager (fm) can view Sales analysis (full team view, read-only, like Accounts)
-- additive SELECT-only policies; no write access; marketing restrictions unchanged (their restrictive policies still apply to them)
drop policy if exists fm_cws_r on customerwise_sales;
create policy fm_cws_r on customerwise_sales for select to authenticated using (has_role('factory_manager'));
drop policy if exists fm_sl_r on sales_lines;
create policy fm_sl_r on sales_lines for select to authenticated using (has_role('factory_manager'));
drop policy if exists fm_si_r on sales_invoices;
create policy fm_si_r on sales_invoices for select to authenticated using (has_role('factory_manager'));
