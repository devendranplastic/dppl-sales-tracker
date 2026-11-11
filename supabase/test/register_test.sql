-- Sales register (all-in-one) import: run after rls_test.sql (reuses its users). Prints PASS/FAIL lines.
\set QUIET on
reset role;
create or replace function pg_temp.ok(name text, cond boolean) returns text language sql as $$ select (case when cond then 'PASS ' else 'FAIL ' end)||name $$;
create or replace function pg_temp.fails(name text, stmt text) returns text language plpgsql as $$ begin execute stmt; return 'FAIL '||name||' (was allowed)'; exception when others then return 'PASS '||name||' ('||left(sqlerrm,60)||')'; end $$;
create temp table reg_apr as select $j$[
 {"src_row":2,"inv_no":"RT/1/24-25","inv_date":"2024-04-01","customer":"Reg Dairy Pvt Ltd","gstin":"33AAAAA0000A1Z5","variant":"Milk","category":"Packaging","qty":100,"rate":160,"value":16000,"gross_total":18880,"cgst":1440,"sgst":1440,"line_no":1},
 {"src_row":3,"inv_no":"RT/1/24-25","inv_date":"2024-04-01","customer":"Reg Dairy Pvt Ltd","gstin":"33AAAAA0000A1Z5","variant":"Lami PET-Oil","category":"Packaging","qty":50,"rate":220,"value":11000,"gross_total":12980,"cgst":990,"sgst":990,"line_no":2},
 {"src_row":4,"inv_no":"RT/2/24-25","inv_date":"2024-04-02","customer":"REG DAIRY PRIVATE LTD-S","gstin":"33AAAAA0000A1Z5","variant":"Scrap","category":"Scrap","qty":10,"rate":15,"value":150,"line_no":1},
 {"src_row":5,"inv_no":"RT/3/24-25","inv_date":"2024-04-03","customer":"Reg Oils","gstin":"32BBBBB1111B1Z5","variant":"Barrier-Oil","category":"Packaging","qty":20,"rate":190,"value":3800,"exec":"mkt2","line_no":1},
 {"src_row":6,"inv_no":"RT/4/24-25","inv_date":"2024-04-03","customer":"Reg Oils","gstin":"29BBBBB1111B1Z9","variant":"barrier oil","category":"Packaging","qty":5,"rate":190,"value":950,"line_no":1},
 {"src_row":7,"inv_no":"RT/CN/1/24-25","inv_date":"2024-04-20","customer":"Reg Dairy Pvt Ltd","gstin":"33AAAAA0000A1Z5","variant":"Milk","category":"Packaging","qty":-10,"rate":160,"value":-1600,"credit_note":true,"line_no":1},
 {"src_row":8,"inv_no":"RT/5/24-25","inv_date":"2024-04-21","customer":"","cancelled":true,"line_no":1}]$j$::jsonb j;

grant select on reg_apr to authenticated;
-- marketing / md cannot import or assign
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); set role authenticated;
select pg_temp.fails('marketing: cannot import sales register',$$select import_sales_register('2024-04','x',(select j from reg_apr))$$);
select pg_temp.fails('marketing: cannot assign customer owners',$$select assign_customer_execs('[]')$$);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); set role authenticated;
select pg_temp.fails('md: cannot import sales register (HR Admin only)',$$select import_sales_register('2024-04','x',(select j from reg_apr))$$);
-- HR Admin imports
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); set role authenticated;
select pg_temp.fails('admin: rows outside the month are refused',$$select import_sales_register('2024-05','x',(select j from reg_apr))$$);
create temp table r1 as select import_sales_register('2024-04','Sales-24-25.xlsx',(select j from reg_apr)) r;
select pg_temp.ok('admin: 6 lines, 6 invoices incl. 1 credit note + 1 cancelled',(select (r->>'lines')::int=6 and (r->>'invoices')::int=6 and (r->>'credit_notes')::int=1 and (r->>'cancelled')::int=1 from r1));
select pg_temp.ok('admin: 2 customers created (GSTIN merges name variants, same name keeps 2nd GSTIN)',(select count(*) from customers where name in ('Reg Dairy Pvt Ltd','Reg Oils'))=2 and (select count(*) from customers where name ilike 'reg dairy private%')=0);
select pg_temp.ok('admin: Reg Oils holds both GSTINs',(select gstins @> array['32BBBBB1111B1Z5','29BBBBB1111B1Z9'] from customers where name='Reg Oils'));
select pg_temp.ok('admin: variants de-duplicated (Barrier-Oil = barrier oil)',(select count(*) from product_variants where key in ('milk','lamipetoil','scrap','barrieroil'))=4 and (select category from product_variants where key='scrap')='Scrap');
select pg_temp.ok('admin: multi-line invoice totals',(select lines=2 and value=27000 and gross_total=31860 from sales_invoices where invoice_no='RT/1/24-25'));
select pg_temp.ok('admin: file marketing person mapped (mkt2), rest unassigned/common',(select count(*) from sales_lines where month='2024-04' and exec_id='a0000000-0000-0000-0000-000000000004')=1 and (select count(*) from sales_lines where month='2024-04' and is_common and exec_id is null)=5);
select pg_temp.ok('admin: credit note is negative value and qty',(select value=-1600 and qty=-10 and is_credit_note from sales_lines where invoice_no='RT/CN/1/24-25'));
-- re-upload the same month: no duplicates
select import_sales_register('2024-04','Sales-24-25.xlsx',(select j from reg_apr)) is not null;
select pg_temp.ok('admin: re-upload is idempotent (no duplicate lines/invoices/customers)',(select count(*) from sales_lines where month='2024-04')=6 and (select count(*) from sales_invoices where month='2024-04')=6 and (select count(*) from customers where name like 'Reg %')=2 and (select count(*) from sales_uploads where month='2024-04')=1);
-- assign Reg Dairy to mkt (customer owner) -> its lines re-tagged; file-mapped line untouched
select assign_customer_execs(jsonb_build_array(jsonb_build_object('customer_id',(select id from customers where name='Reg Dairy Pvt Ltd'),'exec_id','a0000000-0000-0000-0000-000000000003'),
  jsonb_build_object('customer_id',(select id from customers where name='Reg Oils'),'exec_id','a0000000-0000-0000-0000-000000000003')));
select pg_temp.ok('admin: owner assignment re-tags customer sales, keeps file-mapped person',(select count(*) from sales_lines where month='2024-04' and exec_id='a0000000-0000-0000-0000-000000000003')=5 and (select count(*) from sales_lines where month='2024-04' and exec_id='a0000000-0000-0000-0000-000000000004')=1);
select pg_temp.fails('admin: owner must be a marketing person',$$select assign_customer_execs(jsonb_build_array(jsonb_build_object('customer_id',(select id from customers where name='Reg Oils'),'exec_id','a0000000-0000-0000-0000-000000000005')))$$);
-- next month import keeps owner mapping
select import_sales_register('2024-05','May.csv','[{"src_row":2,"inv_no":"RT/9/24-25","inv_date":"2024-05-02","customer":"Reg Dairy","gstin":"33AAAAA0000A1Z5","variant":"Milk","qty":10,"value":1600,"line_no":1},{"src_row":3,"inv_no":"RT/10/24-25","inv_date":"2024-05-03","customer":"Reg Dairy Karnataka Unit","gstin":"29AAAAA0000A1Z1","variant":"Milk","qty":5,"value":800,"line_no":1}]') is not null;
select pg_temp.ok('admin: other-state GSTIN with same PAN joins the same customer',(select count(*) from customers where name ilike 'reg dairy%')=1 and (select gstins @> array['29AAAAA0000A1Z1'] from customers where name='Reg Dairy Pvt Ltd'));
select pg_temp.ok('admin: next month auto-assigned via customer owner',(select exec_id='a0000000-0000-0000-0000-000000000003' and exec_source='customer' and not is_common from sales_lines where invoice_no='RT/9/24-25'));
-- visibility
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000004',false); set role authenticated;
select pg_temp.ok('marketing (mkt2): sees only own register invoice',(select count(*) from sales_invoices)=1 and (select count(*) from sales_lines where month like '2024-%')=1);
select pg_temp.fails('marketing: cannot take over a customer (owner change)',$$update customers set exec_id='a0000000-0000-0000-0000-000000000004' where name='Reg Oils'$$);
select pg_temp.ok('marketing: variants readable',(select count(*) from product_variants)>=4);
select pg_temp.fails('marketing: cannot edit variants',$$insert into product_variants(name,key) values('x','x')$$);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000010',false); set role authenticated;
select pg_temp.ok('accounts: reads register invoices',(select count(*) from sales_invoices)=8);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000005',false); set role authenticated;
select pg_temp.ok('costing: register invoices hidden',(select count(*) from sales_invoices)=0);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); set role authenticated;
select pg_temp.ok('md: sees all register invoices',(select count(*) from sales_invoices)=8);
reset role;
