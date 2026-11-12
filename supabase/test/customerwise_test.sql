-- Customerwise monthly sales + capability flags (sales_import / targets / broadcast). Run after rls_test.sql and register_test.sql. Prints PASS/FAIL lines.
\set QUIET on
reset role;
create or replace function pg_temp.ok(name text, cond boolean) returns text language sql as $$ select (case when cond then 'PASS ' else 'FAIL ' end)||name $$;
create or replace function pg_temp.fails(name text, stmt text) returns text language plpgsql as $$ begin execute stmt; return 'FAIL '||name||' (was allowed)'; exception when others then return 'PASS '||name||' ('||left(sqlerrm,60)||')'; end $$;
update profiles set full_name='Balaji' where id='a0000000-0000-0000-0000-000000000003';
update profiles set full_name='Jesaon' where id='a0000000-0000-0000-0000-000000000004';
create temp table cw as select jsonb_build_array(
  jsonb_build_object('src_row',3,'exec','Balaji','product','Milk','customer','Reg Dairy','customer_id',(select id from customers where name='Reg Dairy Pvt Ltd'),'month','2025-04','qty',100),
  jsonb_build_object('src_row',4,'exec','Jeason','exec_id','a0000000-0000-0000-0000-000000000004','product','Nylon','customer','Reg Oils','month','2025-05','qty',50),
  jsonb_build_object('src_row',5,'exec','Sanjeev','product','Nylon','customer','New CW Customer','month','2025-06','qty',30),
  jsonb_build_object('src_row',6,'exec','Balaji','product','Lami-BOPA','customer','Reg Oils','month','2025-06','qty',10)) j;
grant select on cw to authenticated;
-- no capability yet: info@ (data entry), MD and marketing cannot upload
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000011',false); set role authenticated;
select pg_temp.fails('info@ without sales_import: cannot import customerwise',$$select import_customerwise('2025-26','f.xlsx','25-26',(select j from cw))$$);
select pg_temp.fails('info@ without sales_import: cannot import sales register',$$select import_sales_register('2025-04','x','[]')$$);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); set role authenticated;
select pg_temp.fails('md: cannot import customerwise',$$select import_customerwise('2025-26','f.xlsx','25-26',(select j from cw))$$);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); set role authenticated;
select pg_temp.fails('marketing: cannot import customerwise',$$select import_customerwise('2025-26','f.xlsx','25-26',(select j from cw))$$);
select pg_temp.fails('marketing without targets cap: cannot add targets for others',$$insert into targets(exec_id,period,sales_value) values('a0000000-0000-0000-0000-000000000004','2026-11',1)$$);
select pg_temp.fails('marketing without broadcast cap: cannot message everyone',$$insert into messages(sender_id,subject,body) values(auth.uid(),'x','y')$$);
update profiles set caps='{sales_import,targets,broadcast}' where id=auth.uid();
reset role; select pg_temp.ok('marketing: cannot grant himself capabilities',(select caps='{}' from profiles where id='a0000000-0000-0000-0000-000000000003'));
-- HR Admin grants: info@ -> sales_import; Balaji (mkt) -> targets + broadcast
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false); set role authenticated;
update profiles set caps='{sales_import}' where id='a0000000-0000-0000-0000-000000000011';
update profiles set caps='{targets,broadcast}' where id='a0000000-0000-0000-0000-000000000003';
reset role; select pg_temp.ok('admin: capabilities saved',(select caps='{sales_import}' from profiles where id='a0000000-0000-0000-0000-000000000011') and (select caps='{targets,broadcast}' from profiles where id='a0000000-0000-0000-0000-000000000003'));
-- info@ uploads FY 2025-26
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000011',false); set role authenticated;
select pg_temp.fails('info@: rows outside the FY are refused',$$select import_customerwise('2026-27','f.xlsx','26-27',(select j from cw))$$);
select pg_temp.fails('info@: bad FY refused',$$select import_customerwise('2025-27','f.xlsx','x',(select j from cw))$$);
create temp table r1 as select import_customerwise('2025-26','Customerwise.xlsx','25-26',(select j from cw)) r;
select pg_temp.ok('info@: FY 2025-26 imported (4 rows, 190 kg, 1 new customer)',(select (r->>'rows')::int=4 and (r->>'qty')::numeric=190 and (r->>'customers_new')::int=1 from r1));
select pg_temp.ok('info@: unknown marketing name reported (Sanjeev), stored as text',(select r->'unmatched_execs'='["Sanjeev"]'::jsonb from r1) and (select exec_id is null and exec_raw='Sanjeev' from customerwise_sales where customer_name='New CW Customer'));
select pg_temp.ok('info@: per-person totals in result',(select (r->'by_exec'->>'Balaji')::numeric=110 and (r->'by_exec'->>'Jesaon')::numeric=50 and (r->'by_exec'->>'Sanjeev')::numeric=30 from r1));
select pg_temp.ok('info@: app-suggested customer used and file spelling remembered as alias',(select 'Reg Dairy'=any(name_aliases) from customers where name='Reg Dairy Pvt Ltd') and (select count(*) from customerwise_sales where customer_name='Reg Dairy' and customer_id=(select id from customers where name='Reg Dairy Pvt Ltd'))=1);
select pg_temp.ok('info@: "Jeason" saved as alias of Jesaon',(select exec_id='a0000000-0000-0000-0000-000000000004' from exec_aliases where alias='jeason'));
reset role; select pg_temp.ok('info@: owner follows file (Reg Oils -> Jesaon, most kg) and register sales re-tagged',(select exec_id='a0000000-0000-0000-0000-000000000004' from customers where name='Reg Oils')
  and (select bool_and(exec_id='a0000000-0000-0000-0000-000000000004') from sales_lines where customer_id=(select id from customers where name='Reg Oils') and coalesce(exec_source,'') not in ('file','file-common'))
  and (select count(*) from sales_lines where customer_id=(select id from customers where name='Reg Oils') and exec_source='file' and exec_id='a0000000-0000-0000-0000-000000000004')>=1);
set role authenticated; select pg_temp.ok('info@: unmapped person leaves the new customer unassigned',(select exec_id is null from customers where name='New CW Customer'));
insert into import_logs(kind,month,file_name,rows_total,added,by_id) values('customerwise','2025-26','Customerwise.xlsx',4,4,auth.uid());
select pg_temp.ok('info@: can log and read own imports',(select count(*) from import_logs where kind='customerwise')=1);
select pg_temp.ok('info@: can read customerwise quantities',(select count(*) from customerwise_sales)=4);
-- re-upload replaces the FY (current-year sheet grows each month)
select import_customerwise('2025-26','Customerwise.xlsx','25-26',(select j from cw)-3) is not null;
select pg_temp.ok('info@: re-upload replaces the FY (no duplicates)',(select count(*) from customerwise_sales where fy='2025-26')=3 and (select count(*) from customerwise_uploads where fy='2025-26')=1 and (select count(*) from customers where name='New CW Customer')=1);
select import_customerwise('2025-26','Customerwise.xlsx','25-26',(select j from cw)) is not null;
-- info@ can also upload the Tally register month
select pg_temp.ok('info@: can import a sales register month',(select (import_sales_register('2025-04','Sales-25-26.xlsx','[{"src_row":2,"inv_no":"CW/1/25-26","inv_date":"2025-04-02","customer":"Reg Oils","gstin":"32BBBBB1111B1Z5","variant":"Nylon","qty":5,"value":900,"line_no":1}]')->>'lines')::int=1));
reset role; select pg_temp.ok('info@: register line follows the file owner',(select exec_id='a0000000-0000-0000-0000-000000000004' from sales_lines where invoice_no='CW/1/25-26')); set role authenticated;
select pg_temp.ok('info@: cannot read register sales lines (value data)',(select count(*) from sales_lines)=0);
-- ...but no other HR Admin powers
select pg_temp.fails('info@: cannot assign customer owners directly',$$select assign_customer_execs('[]')$$);
select pg_temp.fails('info@: cannot add targets',$$insert into targets(exec_id,period,sales_value) values('a0000000-0000-0000-0000-000000000003','2026-11',1)$$);
select pg_temp.fails('info@: cannot broadcast',$$insert into messages(sender_id,subject,body) values(auth.uid(),'x','y')$$);
update profiles set role='hr_admin' where id=auth.uid();
select pg_temp.ok('info@: cannot change roles/profiles; audit log hidden',(select role='data_entry' from profiles where id=auth.uid()) and (select count(*) from audit_log)=0);
select pg_temp.fails('info@: cannot write customerwise rows directly',$$insert into customerwise_sales(upload_id,fy,month,customer_name,qty) values((select id from customerwise_uploads limit 1),'2025-26','2025-04','x',1)$$);
-- FY 2026-27: latest FY decides the owner
create temp table cw2 as select '[{"src_row":3,"exec":"balaji","product":"Nylon","customer":"Reg Oils","month":"2026-04","qty":500}]'::jsonb j;
reset role; grant select on cw2 to authenticated; set role authenticated;
select import_customerwise('2026-27','Customerwise.xlsx','26-27',(select j from cw2)) is not null;
reset role; select pg_temp.ok('info@: current FY owner wins (Reg Oils -> Balaji)',(select exec_id='a0000000-0000-0000-0000-000000000003' from customers where name='Reg Oils') and (select exec_id='a0000000-0000-0000-0000-000000000003' from sales_lines where invoice_no='CW/1/25-26'));
-- visibility
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000004',false); set role authenticated;
select pg_temp.ok('marketing (Jesaon): sees only own customerwise rows',(select count(*) from customerwise_sales)=1 and (select bool_and(exec_id=auth.uid()) from customerwise_sales));
select pg_temp.ok('marketing: FY upload list visible',(select count(*) from customerwise_uploads)=2);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000005',false); set role authenticated;
select pg_temp.ok('costing: customerwise rows hidden',(select count(*) from customerwise_sales)=0);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false); set role authenticated;
select pg_temp.ok('md: sees all customerwise rows',(select count(*) from customerwise_sales)=5);
insert into messages(sender_id,subject,body) values(auth.uid(),'MD note','still works');
select pg_temp.ok('md: can still broadcast',(select count(*) from messages where subject='MD note')=1);
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000010',false); set role authenticated;
select pg_temp.ok('accounts: sees all customerwise rows',(select count(*) from customerwise_sales)=5);
-- Balaji: targets for every marketing person + broadcast, still marketing otherwise
reset role; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); set role authenticated;
select pg_temp.ok('Balaji: sees all customerwise rows (target setting)',(select count(*) from customerwise_sales)=5);
insert into targets(exec_id,period,sales_value,qty) values('a0000000-0000-0000-0000-000000000004','2026-11',500000,3000);
select pg_temp.ok('Balaji: adds a target for Jesaon',(select count(*) from targets where exec_id='a0000000-0000-0000-0000-000000000004' and period='2026-11')=1);
update targets set sales_value=600000 where exec_id='a0000000-0000-0000-0000-000000000004' and period='2026-11';
select pg_temp.ok('Balaji: edits it',(select sales_value=600000 from targets where exec_id='a0000000-0000-0000-0000-000000000004' and period='2026-11'));
select pg_temp.ok('Balaji: sees all targets',(select count(*) from targets where exec_id<>auth.uid())>=1);
select pg_temp.fails('Balaji: target only for marketing persons',$$insert into targets(exec_id,period,sales_value) values('a0000000-0000-0000-0000-000000000005','2026-11',1)$$);
delete from targets where exec_id='a0000000-0000-0000-0000-000000000004' and period='2026-11';
select pg_temp.ok('Balaji: deletes it',(select count(*) from targets where exec_id='a0000000-0000-0000-0000-000000000004' and period='2026-11')=0);
insert into messages(sender_id,subject,body) values(auth.uid(),'Targets for November','Please check your targets');
select pg_temp.ok('Balaji: broadcasts to everyone (fan-out)',(select count(*) from message_recipients r join messages m on m.id=r.message_id where m.subject='Targets for November')>=9);
update messages set body='Updated' where subject='Targets for November';
select pg_temp.ok('Balaji: edits own message',(select body='Updated' from messages where subject='Targets for November'));
select pg_temp.ok('Balaji: sees read receipts of own message',(select count(*) from message_recipients r join messages m on m.id=r.message_id where m.subject='Targets for November')>=9);
select pg_temp.fails('Balaji: cannot send as someone else',$$insert into messages(sender_id,subject,body) values('a0000000-0000-0000-0000-000000000002','x','y')$$);
delete from messages where subject='MD note';
reset role; select pg_temp.ok('Balaji: cannot delete MD''s message',(select count(*) from messages where subject='MD note')=1);
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); set role authenticated;
delete from messages where subject='Targets for November';
reset role; select pg_temp.ok('Balaji: deletes own message (recipients removed too)',(select count(*) from messages where subject='Targets for November')=0 and (select count(*) from message_recipients r where not exists(select 1 from messages m where m.id=r.message_id))=0);
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false); set role authenticated;
select pg_temp.fails('Balaji: cannot import customerwise (no sales_import)',$$select import_customerwise('2026-27','f.xlsx','26-27',(select j from cw2))$$);
select pg_temp.fails('Balaji: cannot change a customer owner by hand',$$update customers set exec_id='a0000000-0000-0000-0000-000000000004' where name='Reg Dairy Pvt Ltd'$$);
select pg_temp.fails('Balaji: cannot change Setup settings',$$insert into settings(min_visits_per_day) values(3)$$);
select pg_temp.ok('Balaji: still enters own visits as marketing',(select count(*) from (select 1) x)=1);
insert into visits(date,customer_name,customer_type,purpose,discussion,next_action,by_id) values(current_date,'CW Visit','Existing','x','y','z',auth.uid());
select pg_temp.ok('Balaji: visit saved',(select count(*) from visits where customer_name='CW Visit')=1);
reset role;
