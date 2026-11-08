# DPPL Sales & Order Tracker
Mobile-friendly CRM + order tracker for DPPL (flexible packaging). Static site; data in the browser (demo) or Supabase.
Live: https://popkalis-nandu.github.io/dppl-sales-tracker/  — demo logins are listed on the login page (local demo mode only).

## Modules
Customers · Enquiries (spec, feasibility, costing, quotation revisions + margin approval) · Follow-ups & tasks · Daily visits & discipline rules ·
Customer SKUs · Samples & trials (Request → Tech approval → Preparation → QA → Dispatched → Received → Trial → Feedback → Closed) ·
Artwork revisions (approve → lock; others obsolete; tooling cost/ownership/storage) · Orders (PO entry/upload → checklist vs approved quotation → release with ORD number → auto production route → department stage updates with delay reason/recovery/revised date) ·
Dispatch (partial, invoice, transporter, vehicle, LR, POD → invoice in Collections) · Collections (ageing, follow-ups, promises) · Complaints · Repeat-business alerts ·
Incentives (MD/CEO-editable slabs) · Analysis (target vs achievement) · Setup (users, targets, visit rules) · Import/Export (CSV/Excel for customers, SKUs, orders, invoices) · Audit log.
Separate statuses on every enquiry: sales · artwork/sample · order · payment. Won date recorded; "Sales won" uses released orders.

## Roles
hr_admin (system admin, everything) · md / ceo (all data, approvals, release, setup read-only) · marketing (customers, enquiries, quotes, PO, samples, artwork, complaints; no costing/margins) ·
costing (costing sheets, feasibility, margins, sample tech approval) · factory_manager / planning / dispatch (read; update only their own production stages; dispatch records dispatches & invoices).

## Connect Supabase
1. Create a Supabase project (region: Mumbai).
2. SQL editor → run `supabase/schema.sql`, then `supabase/storage.sql` (PO file bucket).
3. Authentication → Users → add yourself (HR Admin). Then in SQL editor run, with your email:
   `update profiles set role='hr_admin' where email='YOUR_EMAIL';`  (never commit a real email/password to this public repo)
4. Optional (to invite users from the app): install Supabase CLI, `supabase login`, `supabase link --project-ref <ref>`, `supabase functions deploy invite-user`.
   Optionally `supabase secrets set SITE_URL=https://popkalis-nandu.github.io/dppl-sales-tracker/`. Also set Authentication → URL configuration → Site URL to the live URL.
   Without the function: add users in Supabase → Authentication; they appear in Setup → Users to assign roles.
5. Put Project URL + anon (public) key in `config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), commit, push. The anon key is designed to be public; security is enforced by RLS.
6. Delete the `[SAMPLE]` rows when going live.

## Security (Supabase mode)
RLS on every table. Costing and margins live in restricted tables (`costings`, `costing_margins`, `quotation_margins`) readable only by hr_admin/md/ceo/costing.
Quotation revision numbers, margin and the approval flag are computed by a DB trigger (client cannot bypass); approvals only by hr_admin/md/ceo; revisions immutable.
Enquiry/sample/complaint/order numbers come from `next_doc_no()`. Locked/obsolete artwork protected by trigger. Departments update only their own production stages.
Invoices/collections/targets/visits: own (and direct reports) for executives, all for management. Incentives via `incentive_lines()` (server-side; margins hidden from marketing).
Every write is recorded in `audit_log` by trigger. Deactivated users lose all access.

## Tests
- `supabase/test/local_stubs.sql` + `schema.sql` + `supabase/test/rls_test.sql` on plain Postgres 17: 39/39 role-switching checks pass.
