# DPPL Sales & Order Tracker — Phase 1
Static SPA. Open index.html via any static server. Local demo mode (localStorage) by default; demo logins are listed on the login page.
## Connect Supabase
1. Create a Supabase project. 2. SQL editor → run supabase/schema.sql. 3. Auth → add users (email/password); set roles:
   `update profiles set role='md' where id=(select id from auth.users where email='...');` (roles: md, ceo, marketing, factory_manager, planning, dispatch)
4. Paste Project URL + anon key into config.js. Reload.
## Roles
MD/CEO: full, margins, approvals, audit log. Marketing: edit, sees costing cost/price but not margin %, cannot approve. Factory/Planning/Dispatch: read-only, no costing.
