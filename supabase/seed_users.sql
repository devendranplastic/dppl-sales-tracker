-- Run AFTER creating these users in Supabase → Authentication → Users (Add user / Invite).
-- Sets role and display name. Contains NO passwords — set those in Supabase Auth only.
update profiles p set role=v.role, full_name=v.name, active=true, updated_at=now()
from (values
  ('hr@devendranplastic.com','hr_admin','HR Admin'),
  ('md@devendranplastic.com','md','MD'),
  ('balaji@devendranplastic.com','ceo','Balaji'),
  ('nathan@devendranplastic.com','marketing','Nathan'),
  ('jesaon@devendranplastic.com','marketing','Jesaon'),
  ('suresh@devendranplastic.com','marketing','Suresh')
) as v(email,role,name)
where lower(p.email)=v.email;
-- Marketing reports to MD (change in Setup → Users if needed)
update profiles set reporting_manager=(select id from profiles where lower(email)='md@devendranplastic.com')
 where lower(email) in ('nathan@devendranplastic.com','jesaon@devendranplastic.com','suresh@devendranplastic.com');
-- Check: lists any of the six that are not yet created in Auth
select v.email as missing_in_auth from (values ('hr@devendranplastic.com'),('md@devendranplastic.com'),('balaji@devendranplastic.com'),
 ('nathan@devendranplastic.com'),('jesaon@devendranplastic.com'),('suresh@devendranplastic.com')) v(email)
where not exists (select 1 from profiles p where lower(p.email)=v.email);
