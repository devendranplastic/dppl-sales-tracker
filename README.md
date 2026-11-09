# DPPL Sales & Order Tracker
Mobile-friendly CRM + order tracker for DPPL (flexible packaging). Static site; data in the browser (demo) or Supabase.
Live: https://popkalis-nandu.github.io/dppl-sales-tracker/  — demo logins are listed on the login page (local demo mode only).

## Modules
Customers · Enquiries (spec, feasibility, costing, quotation revisions + margin approval) · Follow-ups & tasks · Daily visits & discipline rules ·
Customer SKUs · Samples & trials (Request → Tech approval → Preparation → QA → Dispatched → Received → Trial → Feedback → Closed) ·
Artwork revisions (approve → lock; others obsolete; tooling cost/ownership/storage) · Orders (PO entry/upload → checklist vs approved quotation → release with ORD number → auto production route → department stage updates with delay reason/recovery/revised date) ·
Dispatch (partial, invoice, transporter, vehicle, LR, POD → invoice in Collections) · Collections (ageing, follow-ups, promises) · Complaints · Repeat-business alerts ·
Messages (MD/CEO/HR Admin broadcast to all or selected roles; bell with unread count; read receipts; optional WhatsApp/email share — no automatic sending) · Incentives (MD/CEO-editable slabs) · Analysis (target vs achievement) · Setup (users, targets, visit rules) · Import/Export (CSV/Excel for customers, SKUs, orders, invoices) · Audit log.
Separate statuses on every enquiry: sales · artwork/sample · order · payment. Won date recorded; "Sales won" uses released orders.

## HR Admin data tools
- **Import data** (HR Admin only): customers, SKU details, past order history, monthly ERP sales — CSV/Excel templates, column mapping, preview with validation (required fields, duplicate code/name/mobile, SKU→customer link), upsert by customer code / customer+SKU code, import log with downloadable rejected rows.
- **Monthly sales upload**: rows mapped to executives by emp code / email / name / saved alias; unmatched names mapped once (or marked Common). Re-uploading a month replaces it after confirmation.
  **Sales (ERP)** tab: executive-wise value/qty/customers vs target, Common sales orders separately, company total. Feeds Analysis, dashboard achievement and incentives. Dashboard shows "Sales data last uploaded"; HR Admin gets a reminder after the 5th.
- **Actual cost** (Costing): monthly actual cost/kg per SKU/product; actual margin = sold/PO price vs latest actual cost (hidden from marketing/view roles). Reminder after the 5th.
- **Dispatch plan**: Planning enters the daily plan; Dispatch confirms (qty, vehicle, driver/transporter, LR, time, invoice no + invoice copy → private bucket `invoice-files`), creating the dispatch + invoice on the order. Plan vs actual: dispatched / partial / pending / missed. Dashboard flags a missing plan on working days.

## Roles
hr_admin (system admin, everything) · md / ceo (all data, approvals, release, setup read-only) · marketing (customers, enquiries, quotes, PO, samples, artwork, complaints; no costing/margins) ·
costing (costing sheets, feasibility, margins, sample tech approval) · factory_manager / planning / dispatch (read; update only their own production stages; dispatch records dispatches & invoices).

## Connect Supabase
1. Create a Supabase project (region: Mumbai).
2. SQL editor → paste and run `supabase/setup_all.sql` (schema + messages + PO file bucket, safe to re-run).
3. Authentication → Users → add the six DPPL users (hr@, md@, balaji@, nathan@, jesaon@, suresh@devendranplastic.com) with passwords set in Supabase only.
   Then run `supabase/seed_users.sql` (sets roles/names; lists any email not yet created). Never commit passwords.
4. Optional (to invite users from the app): install Supabase CLI, `supabase login`, `supabase link --project-ref <ref>`, `supabase functions deploy invite-user`.
   Optionally `supabase secrets set SITE_URL=https://popkalis-nandu.github.io/dppl-sales-tracker/`. Also set Authentication → URL configuration → Site URL to the live URL.
   Without the function: add users in Supabase → Authentication; they appear in Setup → Users to assign roles.
5. URL + publishable key are already in `config.js`; set `USE_SUPABASE: true`, commit, push. The anon key is designed to be public; security is enforced by RLS.
6. Delete the `[SAMPLE]` rows when going live.

## Security (Supabase mode)
RLS on every table. Costing and margins live in restricted tables (`costings`, `costing_margins`, `quotation_margins`) readable only by hr_admin/md/ceo/costing.
Quotation revision numbers, margin and the approval flag are computed by a DB trigger (client cannot bypass); approvals only by hr_admin/md/ceo; revisions immutable.
Enquiry/sample/complaint/order numbers come from `next_doc_no()`. Locked/obsolete artwork protected by trigger. Departments update only their own production stages.
Invoices/collections/targets/visits: own (and direct reports) for executives, all for management. Incentives via `incentive_lines()` (server-side; margins hidden from marketing).
Every write is recorded in `audit_log` by trigger. Deactivated users lose all access.

## Tests
- `supabase/setup_all.sql` (one-shot: schema + storage; rebuild with `supabase/build_setup_all.sh`). `supabase/test/local_stubs.sql` + `setup_all.sql` + `supabase/test/rls_test.sql` on plain Postgres 17: 65/65 role-switching checks pass (incl. messages, ERP sales, actual cost, dispatch plans); seed_users.sql verified.
