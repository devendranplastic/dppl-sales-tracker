-- Run AFTER creating these users in Supabase → Authentication → Users (Add user, "Auto confirm").
-- Sets role, display name and delegation. Contains NO passwords — the default password is set in Supabase Auth only;
-- every user is forced to change it on first login (profiles.must_change_password = true).
update profiles p set role=v.role, full_name=v.name, active=true, must_change_password=true, updated_at=now()
from (values
  ('hr@devendranplastic.com','hr_admin','HR Admin'),
  ('md@devendranplastic.com','md','MD'),
  ('balaji@devendranplastic.com','marketing','Balaji'),
  ('nathan@devendranplastic.com','marketing','Nathan'),
  ('jesaon@devendranplastic.com','marketing','Jesaon'),
  ('suresh@devendranplastic.com','marketing','Suresh'),
  ('info@devendranplastic.com','data_entry','Info (data entry for Balaji)'),
  ('accounts@devendranplastic.com','accounts','Ramesh')
) as v(email,role,name)
where lower(p.email)=v.email;
-- Marketing reports to MD
update profiles set reporting_manager=(select id from profiles where lower(email)='md@devendranplastic.com')
 where lower(email) in ('balaji@devendranplastic.com','nathan@devendranplastic.com','jesaon@devendranplastic.com','suresh@devendranplastic.com');
-- info@ enters visits, enquiries and follow-ups on behalf of Balaji
update profiles set delegate_for=(select id from profiles where lower(email)='balaji@devendranplastic.com')
 where lower(email)='info@devendranplastic.com';
-- Check: lists any of the eight that are not yet created in Auth
select v.email as missing_in_auth from (values ('hr@devendranplastic.com'),('md@devendranplastic.com'),('balaji@devendranplastic.com'),
 ('nathan@devendranplastic.com'),('jesaon@devendranplastic.com'),('suresh@devendranplastic.com'),('info@devendranplastic.com'),('accounts@devendranplastic.com')) v(email)
where not exists (select 1 from profiles p where lower(p.email)=v.email);
