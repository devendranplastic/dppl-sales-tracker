# Customerwise monthly sales (kg) — upload, LY vs CY analysis, permissions

**Where:** Import / Export → *Customerwise monthly sales (kg)* (HR Admin) or the **Sales uploads** tab (users with the *Upload sales files* permission, e.g. info@).
Analysis: **Sales analysis** tab (top section) and a summary card on the MD / HR Admin dashboard.

## The file (Bala's "Customerwise Sales Details")
| Column | Meaning |
|---|---|
| S.No | optional |
| Name | marketing person (Balaji, Nathan, Jesaon/“Jeason”, Suresh, …) |
| Product | product group (Milk, Nylon, Lami-BOPA, Oil-3L, …) |
| Customer Name | customer as written in the sheet |
| Apr … Mar | **quantity in kg** for that month (blank or `-` = no sale) |
| Total, Average | optional; only cross-checked |

* A title row on top is fine (`Customerwise Sales Details - 2026-27`). One sheet = one financial year; the FY comes from the sheet name (`25-26`) or the title, and can be changed in the preview.
* Blank rows and the grand-total row at the bottom are skipped (the grand total is used to cross-check the import).
* Template: `samples/DPPL_Customerwise_Sales_Template.xlsx|csv` (same download in the app). Rows starting with `EXAMPLE` are ignored.

**Unit = kg.** Checked against the Tally register (FY 2024-25, which has kg): Tirumala Milk Products 3,31,865 kg Milk in FY 24-25 vs 5,29,812 in this file for FY 25-26 (same monthly magnitude, 9–47 t vs 26–75 t); Elanad Milk 2,25,721 vs 2,37,932; Sunraja 4,33,389 vs similar. The FY 25-26 company total (83.52 lakh kg) is close to the FY 24-25 register's packaging kg (74.48 lakh kg; 87.66 lakh kg incl. scrap/trading). Rupee values would be in crores, so the figures cannot be ₹.

## What an upload does
1. **Re-uploading a FY replaces that FY** (upload the growing current-year sheet every month — no duplicates).
2. Customers are matched to the app's customers: exact name → saved spelling → fuzzy (legal suffixes like Pvt Ltd ignored, branch suffix “-Chennai”, “/other names”, small typos). The preview lists every close match and every “new” customer so the uploader can pick the right one; the choice is remembered (customer `name_aliases`). Unknown customers are created.
3. Marketing person names are matched to logins (name, email, emp code, saved alias; “Jeason” → Jesaon). A name without a login (e.g. **Sanjeev**) is kept as text and shown as “Sanjeev (no login)” in the analysis; create his login and re-upload to attach his rows.
4. **The file is the authoritative customer → marketing person mapping:** each customer's owner = the person with the most kg in the latest FY where the customer has a mapped person. Tally register sales (FY 24-25 onwards) are re-tagged to that owner (rows whose person came from a Marketing Person column in the register are kept).
5. Database: `import_customerwise(fy, file, sheet, rows, sync_owners)` (one atomic call per FY), `sync_customer_owners_from_cws()`, tables `customerwise_uploads`, `customerwise_sales`.

## Analysis (Sales analysis tab + dashboard)
* **YTD** = April to the last month uploaded for the current FY, compared with the same months last year; growth %, monthly average, full-year pace.
* Month by month: LY bars vs CY bars, plus FY 2024-25 as a line from the Tally register's **packaging kg** (same basis; the customerwise file has no FY 24-25 sheet).
* By marketing person, by product, top customers, and customer movement: **new** (bought this year, nothing last year), **lost** (bought last year till the same month, nothing this year), **grew**, **dropped**.
* Filters: current FY, marketing person, product. **Download LY vs CY (Excel)**: Monthly, By marketing person, By product, Customers (with status), Data.
* Visibility: MD/CEO/HR Admin/Accounts, info@ and Balaji (target setter) see all; each marketing person sees only own rows.

## Permissions (capability flags, Setup → Users → *Extra permissions*)
| Flag | Given to | Allows |
|---|---|---|
| `sales_import` | info@devendranplastic.com | Upload the **sales register (all-in-one)** and the **customerwise file**, map marketing-person names, see the upload pages and LY vs CY analysis. No other HR Admin powers (no users/roles, targets, owners card, audit log, settings, register value data). |
| `targets` | balaji@devendranplastic.com | Targets tab: create / edit / delete targets for **every** marketing person (database refuses non-marketing people); sees everyone's sales and kg to set them. |
| `broadcast` | balaji@devendranplastic.com | Message everyone / selected roles like the MD, see read receipts, edit or delete own messages. |
HR Admin implicitly has all flags. Flags are enforced by row-level security (`has_cap()`); the UI only hides what the database already refuses. Tests: `supabase/test/customerwise_test.sql` (52 checks).
