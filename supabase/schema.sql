-- =====================================================================
-- DPPL Sales & Order Tracker — complete Supabase schema (v3)
-- Run once in Supabase → SQL editor on a NEW project. Safe to re-run.
-- Roles: hr_admin (system admin) · md · ceo · marketing · costing · factory_manager · planning · dispatch
-- No real credentials belong in this file (public repo).
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- profiles & role helpers
create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  email text, full_name text,
  role text not null default 'dispatch' check (role in ('hr_admin','md','ceo','marketing','costing','factory_manager','planning','dispatch')),
  emp_code text, mobile text, territory text, reporting_manager uuid references profiles(id), active boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now());

create or replace function my_role() returns text language sql stable security definer set search_path=public as
$$ select role from profiles where id=auth.uid() and active $$;
create or replace function has_role(variadic r text[]) returns boolean language sql stable as $$ select coalesce(my_role()=any(r),false) $$;
create or replace function is_admin() returns boolean language sql stable as $$ select has_role('hr_admin') $$;
create or replace function is_full()  returns boolean language sql stable as $$ select has_role('hr_admin','md','ceo') $$;
create or replace function can_edit() returns boolean language sql stable as $$ select has_role('hr_admin','md','ceo','marketing') $$;
create or replace function can_margin() returns boolean language sql stable as $$ select has_role('hr_admin','md','ceo','costing') $$;
create or replace function signed_in() returns boolean language sql stable as $$ select my_role() is not null $$;
create or replace function my_team() returns setof uuid language sql stable security definer set search_path=public as
$$ select auth.uid() union select id from profiles where reporting_manager=auth.uid() $$;

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

-- generic audit trail on every write
create or replace function trg_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into audit_log(action,table_name,record_id,detail,user_id,user_email)
  values(lower(TG_OP),TG_TABLE_NAME,coalesce((case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',(to_jsonb(coalesce(new,old))->>'quotation_id'),(to_jsonb(coalesce(new,old))->>'costing_id')),
  case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end, auth.uid(), (select email from profiles where id=auth.uid()));
return coalesce(new,old); end $$;
do $$ declare t text; begin foreach t in array array['profiles','customers','enquiries','specs','costings','costing_margins','quotations','quotation_margins','activities','tasks','visits','incentive_rules','settings','targets',
 'skus','samples','artworks','orders','order_stages','invoices','dispatches','collections','invoice_followups','complaints'] loop
  execute format('drop trigger if exists t_audit on %I; create trigger t_audit after insert or update or delete on %I for each row execute function trg_audit()',t,t); end loop; end $$;

-- ---------- Row-level security
do $$ declare t text; begin foreach t in array array['profiles','customers','enquiries','specs','costings','costing_margins','quotations','quotation_margins','activities','tasks','visits','incentive_rules','settings','targets',
 'skus','samples','artworks','orders','order_stages','invoices','dispatches','collections','invoice_followups','complaints','audit_log','doc_counters'] loop
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

-- ---------- grants (Supabase already grants these by default; explicit for clarity)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke all on doc_counters from authenticated;

-- ---------- sample data (clearly labelled) — delete when going live
insert into customers(id,name,mobile,city,segment) values
 ('00000000-0000-0000-0000-000000000c01','[SAMPLE] Sri Murugan Foods','9840000001','Chennai','Snacks'),
 ('00000000-0000-0000-0000-000000000c02','[SAMPLE] Kaveri Spices','9840000002','Erode','Spices') on conflict do nothing;
insert into incentive_rules(name,min_qty,min_value,margin_from,margin_to,pct)
 select * from (values ('[PLACEHOLDER] Slab A',10000,100000,12,18,0.5),('[PLACEHOLDER] Slab B',10000,100000,18,25,1.0),('[PLACEHOLDER] Slab C',25000,250000,25,100,1.5)) v(a,b,c,d,e,f)
 where not exists (select 1 from incentive_rules);
insert into settings(margin_min_pct) select 12 where not exists (select 1 from settings);

-- ---------- make the first HR Admin (run separately, replace the placeholder; never commit a real email)
-- update profiles set role='hr_admin' where email = 'HR_ADMIN_EMAIL_PLACEHOLDER';
