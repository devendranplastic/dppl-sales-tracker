# DPPL Sales & Order Tracker — Phase 1
Static SPA. Open index.html via any static server. Local demo mode (localStorage) by default; demo logins are listed on the login page.
## Connect Supabase
1. Create a Supabase project. 2. SQL editor → run supabase/schema.sql. 3. Auth → add users (email/password); set roles:
   `update profiles set role='md' where id=(select id from auth.users where email='...');` (roles: md, ceo, marketing, factory_manager, planning, dispatch)
4. Paste Project URL + anon key into config.js. Reload.
## Roles
MD/CEO: full, margins, approvals, audit log. Marketing: edit, sees costing cost/price but not margin %, cannot approve. Factory/Planning/Dispatch: read-only, no costing.
## Phase 1.1
- Visits tab: daily visit log (marketing, MD/CEO). Dashboard "Marketing discipline": daily log, new-customer visits/month, new customers/rolling 3 months — met / at risk / missed, click an executive to drill down. Thresholds in config.js.
- Costing role (costing@dppl.demo / cost123): edits costing + feasibility, sees margins, cannot issue/approve quotes or edit customers/enquiries.
- Incentives tab: marketing sees own; MD/CEO see all and edit slabs ([PLACEHOLDER] slabs seeded). First matching slab (min qty, min value, margin band) × incentive % of won value.
- Supabase: re-run supabase/schema.sql (the Phase 1.1 section is idempotent).
## Phase 1.2 — HR Admin
- Role `hr_admin` (demo: admin@dppl.demo / admin123): system admin, all data and configuration. MD/CEO can view Setup read-only.
- Setup tab: Users & employees (role, emp code, mobile, territory, reporting manager, activate/deactivate), Targets (per exec per month YYYY-MM or quarter YYYY-Qn), Visit settings (purposes, skip Sundays, holidays, min visits/day, discipline thresholds, margin limit). config.js values are defaults only.
- Collections tab: invoices, responsible exec, due/promised dates, follow-ups, collections, ageing.
- Analysis tab: target vs achievement, pipeline, ageing, incentive summary; filter by period/executive.
- Supabase: users are created in the Supabase dashboard (Authentication → Add user / Invite); they then appear in Setup → Users. To make the real HR Admin, run the commented template at the end of schema.sql with their email (never commit it).
