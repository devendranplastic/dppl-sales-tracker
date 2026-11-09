// Supabase project (publishable key is public by design; security is enforced by RLS in the database).
// Set USE_SUPABASE: true only AFTER supabase/setup_all.sql has been run and users are created. false = local demo mode.
window.DPPL_CONFIG = { USE_SUPABASE: true,
  SUPABASE_URL: "https://ehwgyqnqpcknzecjrgdl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_LppOa3TcG9FroOpN-7XtJw_CQftI3jR", MARGIN_MIN_PCT: 12,
  // Marketing discipline rules
  MIN_NEW_CUSTOMER_VISITS_PER_MONTH: 1, MIN_NEW_CUSTOMERS_PER_3_MONTHS: 1, AT_RISK_DAYS_LEFT: 7,
  // Defaults only — HR Admin edits live values in Setup > Visit settings / Targets
  SKIP_SUNDAYS: true, HOLIDAYS: [], MIN_VISITS_PER_DAY: 1, REORDER_DEFAULT_DAYS: 60, UNCONVERTED_SAMPLE_DAYS: 30, NO_CONTACT_DAYS: 30,
  VISIT_PURPOSES: ['New business','Quotation follow-up','Sample / artwork','Payment follow-up','Complaint','Relationship'] };
