# Sales register (all-in-one upload)

**Where:** Import / Export → *Sales register (all-in-one)* (HR Admin). Analysis: **Sales analysis** tab (MD/HR Admin/Accounts see all; marketing sees own).

## What one file does
Upload the Tally *Sales* register exactly as exported (sheet like `Sales-24-25`), one month or a whole year:

| Column (auto-detected, case/space tolerant) | Used for |
|---|---|
| Date, Particulars, Inv No, Value (required) | invoice + sales line |
| GSTIN/UIN | customer key (exact GSTIN → same PAN in another state → name) |
| Varient | product variant (+ category: Packaging, Plastic barrel, Plates & cylinders, Raw material trading, Scrap, Job work, Asset sale) |
| Quantity, Rate | kg and ₹/kg analysis |
| Gross Total, CGST, SGST, IGST, Freight, TCS, Rounded Off | invoice totals |
| *optional* Marketing Person, Sales Order No, SKU Code, Remarks | owner override, SO link, customer SKU |

The app then:
1. creates/updates **customers** (one per company; extra GSTINs of the same company are kept on the customer),
2. adds new **product variants**,
3. stores **invoices** (one per Inv No, multi-line supported; credit notes and cancelled invoices flagged),
4. stores **sales lines** used by Sales (ERP), Sales analysis, MD sales-vs-target charts and actual-cost incentives,
5. tags each line with a **marketing person**: Marketing Person column → customer owner (Import/Export → *Customer → marketing person*) → otherwise *Common / unassigned*.

Each month is imported atomically by the database function `import_sales_register`; re-uploading a month **replaces** it (no duplicates). Rows without Inv No (journal entries such as "Profit on Sales of Asset") are skipped; template rows starting with `EXAMPLE` are ignored.

Templates: `samples/DPPL_Sales_Register_Template.xlsx|csv` (all-in-one), and `samples/customers.csv`, `skus.csv`, `orders.csv`, `invoices.csv` for the older per-table imports. The same files download from the app.

## FY 2024-25 historical load (Sales-24-25, loaded 11 Nov 2026)
* 3,553 rows, 1 Apr 2024 – 31 Mar 2025. 2 journal rows without Inv No skipped (asset-sale profit, −₹1,27,118.64).
* 3,544 invoices: 81 credit notes (−₹93.17 L), 20 cancelled, 7 multi-line invoices → 3,531 sales lines.
* Taxable value ₹136.43 Cr (₹1,36,43,14,968.81), 87,66,250 kg net, CGST ₹7.58 Cr, SGST ₹7.58 Cr, IGST ₹9.37 Cr.
* 228 customer spellings / 220 GSTINs → **207 customers** (12 hold more than one GSTIN). 51 variant spellings → **48 variants**.
* By category: Packaging ₹129.98 Cr · Raw material trading ₹4.36 Cr · Scrap ₹1.25 Cr · Plates & cylinders ₹58.4 L · Plastic barrel ₹22.2 L · Asset sale ₹2.6 L · Job work ₹1.0 L.
* Data notes: credit note DPPL/CN/79/24-25 had a positive Gross Total in Tally (stored negative); 339 lines have no quantity (plastic barrels, plates, some returns); invoice series seen: DP/…, DPCYPL/CYPL (cylinders), EXP (export), JOB, DPPL/CN (credit notes).
* All lines start as *Common / unassigned* — no customer has a marketing owner yet.
