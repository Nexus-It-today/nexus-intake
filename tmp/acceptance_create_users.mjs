import { createClient } from "@supabase/supabase-js";

const url = "http://127.0.0.1:54321";
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const users = [
  { email: "office@nexus.delivery", password: "TestPass123!", label: "platform-super-admin" },
  { email: "org-a-admin@example-test.dev", password: "TestPass123!", label: "org-a-admin" },
  { email: "org-a-viewer@example-test.dev", password: "TestPass123!", label: "org-a-viewer" },
  { email: "org-b-admin@example-test.dev", password: "TestPass123!", label: "org-b-admin (isolation test)" },
  { email: "merchant-a1-admin@example-test.dev", password: "TestPass123!", label: "merchant-a1-admin" },
];

for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });
  if (error) {
    console.log(`FAILED  ${u.label} (${u.email}): ${error.message}`);
  } else {
    console.log(`CREATED ${u.label} (${u.email}) -> ${data.user.id}`);
  }
}
