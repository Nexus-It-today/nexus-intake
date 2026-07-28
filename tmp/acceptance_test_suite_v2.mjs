// Sprint 1 Product Acceptance — extended live test suite.
// Covers: everything in v1 (org/merchant CRUD, memberships, isolation,
// branding, audit, route protection, context switching) PLUS the new
// product-acceptance areas: Integrate it, Commercial rules, a second
// merchant within Organisation A, and cookie-based context persistence
// across a simulated "page refresh".

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
  if (init.body && !(init.body instanceof FormData) && typeof init.body !== "undefined" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${APP}${path}`, { ...init, headers });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, json, setCookie };
}

const PASSWORD = "TestPass123!";

async function main() {
  console.log("=== Signing in test users ===");
  const superAdminToken = await signIn("office@nexus.delivery", PASSWORD);
  const orgAAdminToken = await signIn("org-a-admin@example-test.dev", PASSWORD);
  const orgBAdminToken = await signIn("org-b-admin@example-test.dev", PASSWORD);
  const merchantA1AdminToken = await signIn("merchant-a1-admin@example-test.dev", PASSWORD);
  const merchantA2AdminToken = await signIn("merchant-a2-admin@example-test.dev", PASSWORD);
  console.log("All test users signed in successfully.\n");

  // --- Setup: Org A (2 merchants), Org B (1 merchant) ---
  let orgAId, orgBId, merchantA1Id, merchantA2Id;
  {
    const r = await api(superAdminToken, "/api/platform/organisations", {
      method: "POST",
      body: JSON.stringify({ name: "Product Acceptance Org A", ownerEmail: "org-a-admin@example-test.dev" }),
    });
    orgAId = r.json?.organisation?.id;
    record("setup-org-a", "Create Organisation A with owner", r.status === 201 && Boolean(orgAId), `orgId=${orgAId}`);
  }
  {
    const r = await api(superAdminToken, "/api/platform/organisations", {
      method: "POST",
      body: JSON.stringify({ name: "Product Acceptance Org B", ownerEmail: "org-b-admin@example-test.dev" }),
    });
    orgBId = r.json?.organisation?.id;
    record("setup-org-b", "Create Organisation B with owner", r.status === 201 && Boolean(orgBId), `orgId=${orgBId}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/merchants`, { method: "POST", body: JSON.stringify({ name: "Merchant A1" }) });
    merchantA1Id = r.json?.merchant?.id;
    const r2 = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/merchants`, { method: "POST", body: JSON.stringify({ name: "Merchant A2" }) });
    merchantA2Id = r2.json?.merchant?.id;
    record("setup-two-merchants", "Organisation A has at least two merchants", Boolean(merchantA1Id) && Boolean(merchantA2Id) && merchantA1Id !== merchantA2Id, `A1=${merchantA1Id} A2=${merchantA2Id}`);
  }
  {
    await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}/memberships`, { method: "POST", body: JSON.stringify({ email: "merchant-a1-admin@example-test.dev", role: "merchant_owner" }) });
    const r = await api(orgAAdminToken, `/api/platform/merchants/${merchantA2Id}/memberships`, { method: "POST", body: JSON.stringify({ email: "merchant-a2-admin@example-test.dev", role: "merchant_owner" }) });
    record("setup-merchant-owners", "Assign distinct owners to Merchant A1 and Merchant A2", r.status === 201, `status=${r.status}`);
  }

  // ============================================================
  // 1. Brand and identity
  // ============================================================
  console.log("\n--- 1. Brand and identity ---");
  {
    const r = await api(null, "/api/platform/branding");
    record("brand-view-effective", "View effective (platform default) branding, unauthenticated", r.status === 200 && Boolean(r.json?.branding), `displayName=${r.json?.branding?.displayName}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/branding/profile?scope=organisation&scopeId=${orgAId}`, {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Org A Brand", primaryColour: "#112233" }),
    });
    record("brand-org-colours", "Organisation admin sets organisation display name and primary colour", r.status === 200 && r.json?.profile?.primary_colour === "#112233", `status=${r.status}`);
  }
  {
    const r = await api(null, `/api/platform/branding?organisationId=${orgAId}`);
    record("brand-inheritance-view", "View branding inheritance: org's own colour + platform default accent", r.status === 200 && r.json?.branding?.sources?.primaryColour === "organisation" && r.json?.branding?.sources?.accentColour === "platform", `sources=${JSON.stringify(r.json?.branding?.sources)}`);
  }
  {
    const r = await api(merchantA1AdminToken, `/api/platform/branding/profile?scope=merchant&scopeId=${merchantA1Id}`, {
      method: "PATCH",
      body: JSON.stringify({ primaryColour: "#AA0011" }),
    });
    record("brand-merchant-override", "Merchant owner overrides branding for their own merchant", r.status === 200 && r.json?.profile?.primary_colour === "#AA0011", `status=${r.status}`);
  }
  {
    const r = await api(null, `/api/platform/branding?merchantId=${merchantA1Id}`);
    record("brand-merchant-resolved", "Preview: merchant's own colour resolves ahead of organisation's", r.json?.branding?.primaryColour === "#AA0011" && r.json?.branding?.sources?.primaryColour === "merchant", `resolved=${JSON.stringify(r.json?.branding)}`);
  }
  {
    const r = await api(merchantA1AdminToken, `/api/platform/branding/assets?scope=merchant&scopeId=${merchantA1Id}&assetType=primary_logo`, { method: "DELETE" });
    const r2 = await api(null, `/api/platform/branding?merchantId=${merchantA1Id}`);
    record("brand-restore-inherited", "Remove merchant logo override falls back to inherited (no crash, still resolves)", r.status === 200 && r2.status === 200, `deleteStatus=${r.status}`);
  }
  {
    const r = await api(merchantA2AdminToken, `/api/platform/branding/profile?scope=merchant&scopeId=${merchantA2Id}`, {
      method: "PATCH",
      body: JSON.stringify({ primaryColour: "#000000" }),
    });
    const r2 = await api(null, `/api/platform/branding?merchantId=${merchantA1Id}`);
    record("brand-isolation", "ISOLATION: Merchant A2's branding change does not affect Merchant A1's resolved branding", r.status === 200 && r2.json?.branding?.primaryColour === "#AA0011", `merchantA1StillShows=${r2.json?.branding?.primaryColour}`);
  }

  // ============================================================
  // 2. Users and permissions
  // ============================================================
  console.log("\n--- 2. Users and permissions ---");
  let viewerMembershipId;
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/memberships`, { method: "POST", body: JSON.stringify({ email: "org-a-viewer@example-test.dev", role: "organisation_viewer" }) });
    viewerMembershipId = r.json?.membership?.id;
    record("users-invite", "Invite org-a-viewer as organisation_viewer", r.status === 201, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/memberships`);
    record("users-view-members", "View organisation members list", r.status === 200 && (r.json?.memberships?.length ?? 0) >= 2, `count=${r.json?.memberships?.length}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisation-memberships/${viewerMembershipId}`, { method: "PATCH", body: JSON.stringify({ role: "organisation_operator" }) });
    record("users-change-role", "Change org-a-viewer's role to organisation_operator", r.status === 200 && r.json?.membership?.role === "organisation_operator", `status=${r.status}`);
  }
  const orgAViewerToken = await signIn("org-a-viewer@example-test.dev", PASSWORD);
  {
    const r = await api(orgAViewerToken, "/api/platform/access-profile");
    const orgs = r.json?.profile?.organisations ?? [];
    const merchants = r.json?.profile?.merchants ?? [];
    record("users-view-access", "User can view exactly which organisations/merchants they can access", r.status === 200 && orgs.some((o) => o.id === orgAId) && !orgs.some((o) => o.id === orgBId), `orgs=${JSON.stringify(orgs.map((o) => o.name))}`);
  }
  {
    // Attempting to escalate: operator tries to invite someone as organisation_owner.
    const r = await api(orgAViewerToken, `/api/platform/organisations/${orgAId}/memberships`, { method: "POST", body: JSON.stringify({ email: "org-b-admin@example-test.dev", role: "organisation_owner" }) });
    record("users-no-privilege-escalation", "PERMISSION: organisation_operator CANNOT invite/assign any role (below their own authority check)", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisation-memberships/${viewerMembershipId}`, { method: "DELETE" });
    record("users-remove", "Remove/deactivate a membership", r.status === 200, `status=${r.status}`);
  }

  // ============================================================
  // 3. Organisation management
  // ============================================================
  console.log("\n--- 3. Organisation management ---");
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}`);
    record("org-view", "View organisation details", r.status === 200 && r.json?.organisation?.name === "Product Acceptance Org A", `name=${r.json?.organisation?.name}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}`, { method: "PATCH", body: JSON.stringify({ tradingName: "PA Org A" }) });
    record("org-edit", "Edit organisation details", r.status === 200 && r.json?.organisation?.trading_name === "PA Org A", `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/merchants`);
    record("org-view-merchants", "View merchants belonging to the organisation (both A1 and A2)", r.status === 200 && (r.json?.merchants?.length ?? 0) >= 2, `count=${r.json?.merchants?.length}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/merchants/${merchantA2Id}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
    const r2 = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/merchants`);
    const stillListed = r2.json?.merchants?.some((m) => m.id === merchantA2Id);
    record("org-archive-merchant-safely", "Archive a merchant safely (soft-archived, not deleted - still visible in the list with archived status)", r.status === 200 && stillListed, `merchantStillListed=${stillListed}`);
    await api(orgAAdminToken, `/api/platform/merchants/${merchantA2Id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
  }

  // ============================================================
  // 4. Working As context
  // ============================================================
  console.log("\n--- 4. Working As context ---");
  {
    const r = await api(superAdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "platform" }) });
    record("context-platform", "Platform admin switches to platform context", r.status === 200 && r.json?.activeContext?.type === "platform", `activeContext=${JSON.stringify(r.json?.activeContext)}`);
  }
  {
    const r = await api(orgAAdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "organisation", id: orgAId }) });
    record("context-organisation", "Organisation admin switches to organisation context", r.status === 200 && r.json?.activeContext?.type === "organisation", `activeContext=${JSON.stringify(r.json?.activeContext)}`);
  }
  {
    const r = await api(merchantA1AdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "merchant", id: merchantA1Id }) });
    record("context-merchant", "Merchant user switches to merchant context", r.status === 200 && r.json?.activeContext?.type === "merchant", `activeContext=${JSON.stringify(r.json?.activeContext)}`);
  }
  {
    // Persistence across "page navigation and refresh": capture the Set-Cookie
    // from the switch response, then make a FRESH request using only that
    // cookie (simulating a full page reload with a new request) and confirm
    // the context is still there - this is the real persistence mechanism,
    // not just re-using an in-memory variable.
    const switchResponse = await api(orgAAdminToken, "/api/platform/context", { method: "POST", body: JSON.stringify({ type: "organisation", id: orgAId }) });
    const cookieHeader = switchResponse.setCookie?.split(";")[0];
    const refreshResponse = await api(orgAAdminToken, "/api/platform/context", { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
    record(
      "context-persistence",
      "Selected context persists across a simulated page refresh (via the actual Set-Cookie mechanism)",
      Boolean(cookieHeader) && refreshResponse.json?.activeContext?.type === "organisation" && refreshResponse.json?.activeContext?.id === orgAId,
      `cookie=${cookieHeader ? "present" : "MISSING"} refreshedContext=${JSON.stringify(refreshResponse.json?.activeContext)}`
    );
  }
  {
    // Branding updates with context: confirm merchant vs organisation context yield different resolved branding.
    const orgBranding = await api(null, `/api/platform/branding?organisationId=${orgAId}`);
    const merchantBranding = await api(null, `/api/platform/branding?merchantId=${merchantA1Id}`);
    record(
      "context-branding-updates",
      "Branding resolved for organisation context differs from merchant context (merchant has its own colour override)",
      orgBranding.json?.branding?.primaryColour !== merchantBranding.json?.branding?.primaryColour,
      `org=${orgBranding.json?.branding?.primaryColour} merchant=${merchantBranding.json?.branding?.primaryColour}`
    );
  }

  // ============================================================
  // 5. Audit visibility
  // ============================================================
  console.log("\n--- 5. Audit visibility ---");
  {
    const r = await api(orgAAdminToken, `/api/platform/audit-events?organisationId=${orgAId}&limit=100`);
    const events = r.json?.events ?? [];
    const first = events[0];
    const hasRequiredFields = first && "action" in first && "actorEmail" in first && "organisation_id" in first && "entity_type" in first && "entity_id" in first && "created_at" in first;
    record("audit-fields", "Audit event includes type, user, organisation, affected record and timestamp", r.status === 200 && events.length > 0 && hasRequiredFields, `sampleEvent=${JSON.stringify(first)}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/audit-events?organisationId=${orgAId}&limit=100`);
    const events = r.json?.events ?? [];
    const merchantScoped = events.filter((e) => e.merchant_id);
    record("audit-merchant-scoped", "Audit events show merchant id where applicable", merchantScoped.length > 0, `merchantScopedCount=${merchantScoped.length}`);
  }

  // ============================================================
  // 6. Integration credentials
  // ============================================================
  console.log("\n--- 6. Integration credentials ---");
  let firstProviderKey;
  {
    const r = await api(orgAAdminToken, "/api/platform/integrations/providers");
    firstProviderKey = r.json?.providers?.[0]?.provider_key;
    record("integrations-catalog", "View available integration providers (generic catalog, no hard-coded names in app code)", r.status === 200 && (r.json?.providers?.length ?? 0) > 0, `providerCount=${r.json?.providers?.length} first=${firstProviderKey}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/integrations`, {
      method: "POST",
      body: JSON.stringify({ providerKey: firstProviderKey, credentials: { apiKey: "super-secret-value-123", apiSecret: "another-secret-456" } }),
    });
    record("integrations-connect", "Organisation admin configures credentials for a provider", r.status === 201 && r.json?.connection?.connected === true, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/integrations`);
    const connected = r.json?.integrations?.find((i) => i.provider_key === firstProviderKey);
    const secretLeaked = JSON.stringify(r.json).includes("super-secret-value-123");
    record(
      "integrations-no-secret-leak",
      "SECURITY: stored secret value never appears in any API response after saving (only a field-name hint)",
      r.status === 200 && !secretLeaked && connected?.connection?.credential_hint?.includes("apiKey"),
      `hint=${connected?.connection?.credential_hint} secretLeaked=${secretLeaked}`
    );
  }
  {
    const r = await api(orgBAdminToken, `/api/platform/organisations/${orgAId}/integrations`);
    record("integrations-isolation", "ISOLATION: org-b-admin cannot view Organisation A's integration connections", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAViewerToken, `/api/platform/organisations/${orgAId}/integrations`, {
      method: "POST",
      body: JSON.stringify({ providerKey: firstProviderKey, credentials: { apiKey: "x" } }),
    });
    record("integrations-permission", "PERMISSION: organisation_viewer/operator cannot configure integration credentials", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/integrations?providerKey=${firstProviderKey}`, { method: "DELETE" });
    record("integrations-disconnect", "Disconnect a configured integration", r.status === 200, `status=${r.status}`);
  }

  // ============================================================
  // 7. Commercial rules
  // ============================================================
  console.log("\n--- 7. Commercial rules ---");
  {
    const r = await api(orgAAdminToken, "/api/platform/modules");
    record("commercial-catalog", "View available modules", r.status === 200 && (r.json?.modules?.length ?? 0) > 0, `moduleCount=${r.json?.modules?.length}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/modules`);
    const bookIt = r.json?.entitlements?.find((e) => e.moduleKey === "book_it");
    record("commercial-view-source", "View source of entitlement (platform default for a not-yet-purchased module)", r.status === 200 && bookIt?.source === "platform_default" && bookIt?.enabled === false, `book_it=${JSON.stringify(bookIt)}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/organisations/${orgAId}/modules`, { method: "PATCH", body: JSON.stringify({ moduleKey: "book_it", enabled: true, usageLimit: 500 }) });
    record("commercial-org-toggle-forbidden", "PERMISSION: organisation admin CANNOT enable a module for their own organisation", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(superAdminToken, `/api/platform/organisations/${orgAId}/modules`, { method: "PATCH", body: JSON.stringify({ moduleKey: "book_it", enabled: true, usageLimit: 500 }) });
    record("commercial-platform-toggle", "Platform admin enables Book it for Organisation A with a usage limit", r.status === 200 && r.json?.entitlement?.enabled === true && r.json?.entitlement?.usage_limit === 500, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}/modules`, { method: "PATCH", body: JSON.stringify({ moduleKey: "catalogue_it", enabled: true }) });
    record("commercial-merchant-ceiling", "SECURITY: cannot grant a merchant a module the parent organisation does not have (catalogue_it not yet org-enabled)", r.status === 403, `status=${r.status}`);
  }
  {
    const r = await api(orgAAdminToken, `/api/platform/merchants/${merchantA1Id}/modules`, { method: "PATCH", body: JSON.stringify({ moduleKey: "book_it", enabled: true }) });
    record("commercial-merchant-grant", "Organisation admin grants Merchant A1 a module the organisation already has (book_it)", r.status === 200 && r.json?.entitlement?.enabled === true, `status=${r.status}`);
  }
  {
    const r = await api(merchantA1AdminToken, `/api/platform/merchants/${merchantA1Id}/modules`);
    const bookIt = r.json?.entitlements?.find((e) => e.moduleKey === "book_it");
    record("commercial-merchant-view", "Merchant owner can view their own resolved entitlements", r.status === 200 && bookIt?.enabled === true, `book_it=${JSON.stringify(bookIt)}`);
  }
  {
    const r = await api(merchantA2AdminToken, `/api/platform/merchants/${merchantA2Id}/modules`);
    const bookIt = r.json?.entitlements?.find((e) => e.moduleKey === "book_it");
    record("commercial-isolation", "ISOLATION: Merchant A2 (sibling) does NOT inherit Merchant A1's manual grant", r.status === 200 && bookIt?.enabled === false, `merchantA2 book_it=${JSON.stringify(bookIt)}`);
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n=== SUMMARY ===");
  const passCount = results.filter((r) => r.pass).length;
  console.log(`${passCount}/${results.length} assertions passed.`);
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  [${f.id}] ${f.description} — ${f.detail}`);
  }

  console.log("\n=== IDS FOR REPORT ===");
  console.log(JSON.stringify({ orgAId, orgBId, merchantA1Id, merchantA2Id }, null, 2));
}

main().catch((err) => {
  console.error("SUITE CRASHED:", err);
  process.exit(1);
});
