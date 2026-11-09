# Go-live on Supabase — exact steps

**Status: completed 9 Nov 2026** (schema applied, 8 users created with must-change-password, roles seeded, auth URLs set, public sign-up disabled, `invite-user` deployed, `USE_SUPABASE: true`). Keep this file for re-builds / a new project.

Project: `https://ehwgyqnqpcknzecjrgdl.supabase.co` · App: <https://devendranplastic.github.io/dppl-sales-tracker/>

Do these steps once, in order. **No password is ever stored in this repository.** The default password is typed only into Supabase Auth.

1. **Create the schema.** Supabase Dashboard › *SQL Editor* › New query › paste the whole of `supabase/setup_all.sql` › **Run**. It is safe to run again. It creates the tables, RLS policies, triggers, functions and the `po-files` / `invoice-files` storage buckets.
2. **Create the Auth users.** *Authentication › Users › Add user › Create new user*, with **Auto Confirm User** ticked, using the default password Bala supplied, for:
   - hr@devendranplastic.com
   - md@devendranplastic.com
   - balaji@devendranplastic.com
   - nathan@devendranplastic.com
   - jesaon@devendranplastic.com
   - suresh@devendranplastic.com
   - info@devendranplastic.com
   - accounts@devendranplastic.com
3. **Assign roles.** In the SQL Editor, run `supabase/seed_users.sql`. It sets the roles and names, Balaji = marketing, info@ = data entry for Balaji, accounts@ = Accounts (Ramesh), marketing reporting to the MD, and `must_change_password = true`. The last query should return **no rows**. Any email it lists is missing from Auth.
4. **Auth URLs.** *Authentication › URL Configuration*: set **Site URL** to `https://devendranplastic.github.io/dppl-sales-tracker/` and add the same URL under Redirect URLs.
5. *(Optional)* **Invite from the app.** Run `supabase functions deploy invite-user` (Supabase CLI) so that HR Admin can invite Costing, Planning, Factory and Dispatch users from Setup › Users. Otherwise, add them as in step 2 and set their role in Setup › Users.
6. **Switch the app to live.** In `config.js`, set `USE_SUPABASE: true`. Commit and push to `main`. GitHub Pages redeploys in about one minute.
7. **First sign-in test.** Sign in as each user. Each one should be forced to change the password, then see their own menus. Checks:
   - MD sees the charts.
   - Nathan sees only his own data.
   - info@ shows "entering for Balaji".
   - Accounts sees Collections but no costing.
8. **Load real data.** As HR Admin, use Import/Export › HR import: customers › SKUs › history › last month's ERP sales CSV (map the aliases). Then add Targets.
9. **Disable public sign-up.** Authentication › Providers › Email (or Sign In / Up settings): turn off *Allow new users to sign up*. Users are added only by HR Admin (invite) or in the dashboard; otherwise a self-registered account would get default read access.

`setup_all.sql` no longer inserts sample rows, so re-running it on the live database is safe.

Rollback: set `USE_SUPABASE: false` and push. The site returns to demo mode, and the data stays in Supabase.
