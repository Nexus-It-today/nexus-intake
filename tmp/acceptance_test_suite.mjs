// Sprint 1 "Foundation it" — live acceptance test suite.
// Runs against: local Supabase (npx supabase start) + `npm run dev` on :3000.
// Prints one PASS/FAIL line per assertion with real request/response evidence.

const APP = "http://localhost:3000";
const AUTH_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const results = [];
function record(id, description, pass, detail) {
  results.push({ id, description, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${description}${detail ? " — " + detail : ""}`);
}

async function signIn(email, password) {
  const res = await fetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function api(token, path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${APP}${path}`, { ...init, headers });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

const PASSWORD = "TestPass123!";

async function main() {
  console.log("=== Signing in test users ===");
  const superAdminToken = await signIn("office@nexus.delivery", PASSWORD);
  const orgAAdminToken = await signIn("org-a-admin@example-test.dev", PASSWORD);
  const orgAViewerToken = await signIn("org-a-viewer@example-test.dev", PASSWORD);
  const orgBAdminToken = await signIn("org-b-admin@example-test.dev", PASSWORD);
  const merchantA1AdminToken = await signIn("merchant-a1-admin@example-test.dev", PASSWORD);
  console.log("All 5 test users signed in successfully.\n");

  // --- A. Route protection (unauthenticated) ---
  {
    const r = await api(null, "/api/platform/access-profile");
    record("route-protection-1", "GET /api/platform/access-profile with no token", r.status === 401, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }
  {
    const r = await api(null, "/api/platform/organisations", { method: "POST", body: JSON.stringify({ name: "Should Not Exist" }) });
    record("route-protection-2", "POST /api/platform/organisations with no token", r.status === 401, `status=${r.status}`);
  }
  {
    const res = await fetch(`${APP}/manage-it`, { redirect: "manual" });
    record("route-protection-3", "Legacy /manage-it redirects when no session cookie (middleware, unchanged behaviour)", res.status === 307 || res.status === 308, `status=${res.status} location=${res.headers.get("location")}`);
  }

  // --- B. Organisation creation, editing, archive ---
  let orgAId, orgBId;
  {
    const r = await api(superAdminToken, "/api/platform/organisations", {
      method: "POST",
      body: JSON.stringify({ name: "Acceptance Test Org A", tradingName: "Test Org A", ownerEmail: "org-a-admin@example-test.dev" }),
    });
    orgAId = r.json?.organisation?.id;
    record("org-create-1", "nexus_super_admin creates Organisation A with an owner invite", r.status === 201 && Boolean(orgAId), `status=${r.status} orgId=${orgAId} ownerInviteError=${r.json?.ownerInviteError}`);
  }
  {
    const r = await api(superAdminToken, "/api/platform/organisations", {
      method: "POST",
      body: JSON.stringify({ name: "Acceptance Test Org B", ownerEmail: "org-b-admin@example-test.dev" }),
    });
    orgBId = r.json?.organisation?.id;
    record("org-create-2", "nexus_super_admin creates Organisation B (isolation control group)", r.status === 201 && Boolean(orgBId), `status=${r.status} orgId=${orgBId}`);
  }
  {
    const r = await api(orgAAdminToken, "/api/platform/organisations", { method: "POST", body: JSON.stringify({ name: "Should Be Forbidden" }) });
    record("org-create-3", "organisation_owner (non-platform-admin) CANNOT create a new organisation", r.status === 403, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}`, { method: "PATCH", body: JSON.stringify({ tradingName: "Test Org A (renamed)" }) });
    record("org-edit-1", "organisation_owner edits their own organisation's trading name", r.status === 200 && r.json?.organisation?.trading_name === "Test Org A (renamed)", `status=${r.status} tradingName=${r.json?.organisation?.trading_name}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
    const r2 = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
    record("org-archive-1", "organisation can be archived then restored (status field, no hard delete)", r.json?.organisation?.status === "archived" && r2.json?.organisation?.status === "active", `archived-status=${r.json?.organisation?.status} restored-status=${r2.json?.organisation?.status}`);
  }

  // --- C. Data isolation between organisations ---
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgBId}`);
    record("isolation-1", "org-a-admin CANNOT read Organisation B", r.status === 403, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }
  {
    const r = await api(orgBAdminToken, `/api/platform/organisations/${orgAId}`);
    record("isolation-2", "org-b-admin CANNOT read Organisation A", r.status === 403, `status=${r.status} body=${JSON.stringify(r.json)}`);
  }

  // --- D. Merchant creation, editing, archive ---
  let merchantA1Id;
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/merchants`, { method: "POST", body: JSON.stringify({ name: "Merchant A1" }) });
    merchantA1Id = r.json?.merchant?.id;
    record("merchant-create-1", "organisation_owner creates Merchant A1 under Organisation A", r.status === 201 && Boolean(merchantA1Id), `status=${r.status} merchantId=${merchantA1Id}`);
  }
  {
    const r = await api(orgBAdminToken, `/api/platform/organisations/${orgAId}/merchants`, { method: "POST", body: JSON.stringify({ name: "Should Be Forbidden" }) });
    record("merchant-create-2", "org-b-admin CANNOT create a merchant under Organisation A", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}`, { method: "PATCH", body: JSON.stringify({ tradingName: "Merchant A1 (renamed)" }) });
    record("merchant-edit-1", "organisation admin edits Merchant A1 (inherited manage rights, no direct merchant membership needed)", r.status === 200 && r.json?.merchant?.trading_name === "Merchant A1 (renamed)", `status=${r.status}`);
  }
  {
    const r1 = await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
    const r2 = await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
    record("merchant-archive-1", "merchant can be archived then restored (status field, no hard delete)", r1.json?.merchant?.status === "archived" && r2.json?.merchant?.status === "active", `archived=${r1.json?.merchant?.status} restored=${r2.json?.merchant?.status}`);
  }
  {
    const r = await api(orgBAdminToken, `/api/platform/merchants/${merchantA1Id}`);
    record("isolation-3", "org-b-admin CANNOT read Merchant A1 (belongs to Organisation A)", r.status === 403, `status=${r.status}`);
  }

  // --- E. Memberships and role-based permissions ---
  let orgAViewerMembershipId;
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/memberships`, {
      method: "POST",
      body: JSON.stringify({ email: "org-a-viewer@example-test.dev", role: "organisation_viewer" }),
    });
    orgAViewerMembershipId = r.json?.membership?.id;
    record("membership-create-1", "organisation admin invites org-a-viewer as organisation_viewer", r.status === 201 && Boolean(orgAViewerMembershipId), `status=${r.status} status_field=${r.json?.membership?.status}`);
  }
  {
    const r = await api(orgAViewerToken, `/api/platform/organisations/${orgAId}/merchants`, { method: "POST", body: JSON.stringify({ name: "Should Be Forbidden (viewer)" }) });
    record("permission-1", "organisation_viewer role CANNOT create a merchant (read-only role enforced)", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAViewerToken, `/api/platform/organisations/${orgAId}`);
    record("permission-2", "organisation_viewer role CAN still read the organisation", r.status === 200, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisation-memberships/${orgAViewerMembershipId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "organisation_operator" }),
    });
    record("membership-role-change-1", "organisation admin changes org-a-viewer's role to organisation_operator", r.status === 200 && r.json?.membership?.role === "organisation_operator", `status=${r.status} newRole=${r.json?.membership?.role}`);
  }
  let merchantA1AdminMembershipId;
  {
    const r = await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}/memberships`, {
      method: "POST",
      body: JSON.stringify({ email: "merchant-a1-admin@example-test.dev", role: "merchant_owner" }),
    });
    merchantA1AdminMembershipId = r.json?.membership?.id;
    record("membership-create-2", "organisation admin invites merchant-a1-admin as merchant_owner on Merchant A1", r.status === 201 && Boolean(merchantA1AdminMembershipId), `status=${r.status}`);
  }
  {
    const r = await api(merchantA1AdminToken, `/api/platform/merchants/${merchantA1Id}`, { method: "PATCH", body: JSON.stringify({ tradingName: "Merchant A1 (edited by merchant owner)" }) });
    record("permission-3", "merchant_owner CAN edit their own merchant", r.status === 200, `status=${r.status}`);
  }
  {
    const r = await api(merchantA1AdminToken, `/api/platform/organisations/${orgAId}`, { method: "PATCH", body: JSON.stringify({ tradingName: "Should Be Forbidden" }) });
    record("permission-4", "merchant_owner CANNOT edit the parent organisation", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisation-memberships/${orgAViewerMembershipId}`, { method: "DELETE" });
    const r2 = await api(orgAViewerToken, `/api/platform/organisations/${orgAId}`);
    record("membership-remove-1", "organisation admin removes org-a-viewer's membership; they immediately lose access", r.status === 200 && r2.status === 403, `deleteStatus=${r.status} postRemovalAccessStatus=${r2.status}`);
  }

  // --- F. Working-as context switching (server-verified) ---
  {
    const r = await api(orgAAdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "organisation", id: orgAId }) });
    record("context-switch-1", "org-a-admin switches Working-as to Organisation A (a real membership)", r.status === 200 && r.json?.activeContext?.type === "organisation" && r.json?.activeContext?.id === orgAId, `status=${r.status} activeContext=${JSON.stringify(r.json?.activeContext)}`);
  }
  {
    const r = await api(orgAAdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "organisation", id: orgBId }) });
    const rejected = r.json?.activeContext?.type !== "organisation" || r.json?.activeContext?.id !== orgBId;
    record("context-switch-2", "SECURITY: org-a-admin CANNOT switch into Organisation B (not a member) - forged id is ignored server-side", r.status === 200 && rejected, `requestedOrgB=${orgBId} actualActiveContext=${JSON.stringify(r.json?.activeContext)}`);
  }
  {
    const r = await api(superAdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "organisation", id: orgBId }) });
    record("context-switch-3", "nexus_super_admin CAN switch into any organisation without an explicit membership row", r.status === 200 && r.json?.activeContext?.id === orgBId, `status=${r.status} activeContext=${JSON.stringify(r.json?.activeContext)}`);
  }

  // --- G. Branding inheritance ---
  {
    const r = await api(null, "/api/platform/branding");
    record("branding-1", "GET /api/platform/branding (no scope) returns Nexus it platform default, unauthenticated", r.status === 200 && r.json?.branding?.displayName === "Nexus it", `status=${r.status} branding=${JSON.stringify(r.json?.branding)}`);
  }
  {
    const r = await api(superAdminToken, "/api/platform/branding/profile?scope=platform", {
      method: "PATCH",
      body: JSON.stringify({ accentColour: "#FF00AA" }),
    });
    record("branding-2", "nexus_super_admin updates platform accent colour", r.status === 200 && r.json?.profile?.accent_colour === "#FF00AA", `status=${r.status} accentColour=${r.json?.profile?.accent_colour}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/branding/profile?scope=organisation&scopeId=${orgAId}`, {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Test Org A Brand" }),
    });
    record("branding-3", "organisation admin sets ONLY displayName at organisation scope (leaves colours unset)", r.status === 200 && r.json?.profile?.display_name === "Test Org A Brand", `status=${r.status} profile=${JSON.stringify(r.json?.profile)}`);
  }
  {
    const r = await api(null, `/api/platform/branding?organisationId=${orgAId}`);
    const b = r.json?.branding;
    const pass = b?.displayName === "Test Org A Brand" && b?.accentColour === "#FF00AA";
    record("branding-4", "INHERITANCE: Organisation A's resolved branding shows its OWN displayName + the PLATFORM's accent colour (not set at org level)", pass, `resolved=${JSON.stringify(b)}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/branding/profile?scope=organisation&scopeId=${orgAId}`, {
      method: "PATCH",
      body: JSON.stringify({ allowMerchantBranding: false }),
    });
    record("branding-5", "organisation admin disables merchant-level branding for Organisation A", r.status === 200 && r.json?.profile?.allow_merchant_branding === false, `status=${r.status}`);
  }
  {
    const r = await api(merchantA1AdminToken, `/api/platform/branding/profile?scope=merchant&scopeId=${merchantA1Id}`, {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Should Be Forbidden" }),
    });
    record("branding-6", "PERMISSION: merchant_owner CANNOT edit merchant branding while parent org has disabled it", r.status === 403, `status=${r.status}`);
  }
  {
    await api(orgAAdminToken, `/api/platform/branding/profile?scope=organisation&scopeId=${orgAId}`, {
      method: "PATCH",
      body: JSON.stringify({ allowMerchantBranding: true }),
    });
    const r = await api(merchantA1AdminToken, `/api/platform/branding/profile?scope=merchant&scopeId=${merchantA1Id}`, {
      method: "PATCH",
      body: JSON.stringify({ primaryColour: "#00AA55" }),
    });
    record("branding-7", "after re-enabling, merchant_owner CAN set merchant-level primary colour", r.status === 200 && r.json?.profile?.primary_colour === "#00AA55", `status=${r.status}`);
  }
  {
    const r = await api(null, `/api/platform/branding?merchantId=${merchantA1Id}`);
    const b = r.json?.branding;
    const pass = b?.primaryColour === "#00AA55" && b?.displayName === "Test Org A Brand" && b?.accentColour === "#FF00AA";
    record("branding-8", "INHERITANCE: Merchant A1 resolves its OWN colour + org's displayName + platform's accent colour, three layers at once", pass, `resolved=${JSON.stringify(b)}`);
  }

  // --- H. Audit event creation ---
  {
    const r = await api(orgAAdminToken, `/api/platform/audit-events?organisationId=${orgAId}&limit=50`);
    const actions = (r.json?.events ?? []).map((e) => e.action);
    const expected = ["organisation.created", "organisation.updated", "membership.created", "membership.role_changed", "membership.removed", "merchant.created", "merchant.updated", "branding.updated", "context.switched"];
    const missing = expected.filter((a) => !actions.includes(a));
    record("audit-1", "Audit it shows every action performed above for Organisation A", r.status === 200 && missing.length === 0, `eventCount=${actions.length} missingActions=${JSON.stringify(missing)}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/audit-events?organisationId=${orgAId}&limit=1`);
    const first = r.json?.events?.[0];
    record("audit-2", "Audit events resolve actor email (not just a raw user id)", Boolean(first?.actorEmail), `firstEvent=${JSON.stringify(first)}`);
  }
  {
    const r = await api(orgBAdminToken, `/api/platform/audit-events?organisationId=${orgAId}`);
    record("isolation-4", "org-b-admin CANNOT read Organisation A's audit trail", r.status === 403, `status=${r.status}`);
  }

  // --- Summary ---
  console.log("\n=== SUMMARY ===");
  const passCount = results.filter((r) => r.pass).length;
  console.log(`${passCount}/${results.length} assertions passed.`);
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  [${f.id}] ${f.description} — ${f.detail}`);
  }

  console.log("\n=== IDS FOR FOLLOW-UP QUERIES ===");
  console.log(JSON.stringify({ orgAId, orgBId, merchantA1Id }, null, 2));
}

main().catch((err) => {
  console.error("SUITE CRASHED:", err);
  process.exit(1);
});
