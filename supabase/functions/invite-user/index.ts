// Supabase Edge Function: HR Admin invites / creates a user and sets their role.
// Deploy:  supabase functions deploy invite-user
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.
// Optional: supabase secrets set SITE_URL=https://popkalis-nandu.github.io/dppl-sales-tracker/
import { createClient } from "npm:@supabase/supabase-js@2";
const ROLES = ["hr_admin","md","ceo","marketing","costing","factory_manager","planning","dispatch"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await caller.from("profiles").select("role,active").eq("id", user.id).single();
    if (!me || me.role !== "hr_admin" || !me.active) return json({ error: "Only HR Admin can invite users" }, 403);
    const { email, full_name, role, emp_code, mobile, territory, password } = await req.json();
    if (!email || !ROLES.includes(role)) return json({ error: "email and a valid role are required" }, 400);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // password given => create directly (email confirmed); otherwise send an invite email
    const res = password
      ? await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })
      : await admin.auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo: Deno.env.get("SITE_URL") ?? undefined });
    if (res.error) return json({ error: res.error.message }, 400);
    const id = res.data.user!.id;
    const { error } = await admin.from("profiles").upsert({ id, email, full_name, role, emp_code, mobile, territory, active: true });
    if (error) return json({ error: error.message }, 400);
    await admin.from("audit_log").insert({ action: "invite", table_name: "profiles", record_id: id, user_id: user.id, detail: { email, role } });
    return json({ id, invited: !password });
  } catch (e) { return json({ error: String(e) }, 500); }
});
