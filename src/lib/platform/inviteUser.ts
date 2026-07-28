import type { SupabaseClient } from "@supabase/supabase-js";

export type FindOrInviteResult = { userId: string; invited: boolean } | { error: string };

/**
 * Invites a user by email (creating their auth.users row if needed) or, if
 * they are already registered, resolves their existing user id. Requires the
 * privileged (service-role) client since auth.admin.* is not available to
 * anon/authenticated clients.
 */
export async function findOrInviteUser(client: SupabaseClient, email: string): Promise<FindOrInviteResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { error: "A valid email address is required." };
  }

  const { data: inviteData, error: inviteError } = await client.auth.admin.inviteUserByEmail(normalizedEmail);
  if (!inviteError && inviteData.user) {
    return { userId: inviteData.user.id, invited: true };
  }

  const { data: listData, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return { error: inviteError?.message ?? listError.message };
  }

  const existing = listData.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
  if (!existing) {
    return { error: inviteError?.message ?? "Unable to find or invite this user." };
  }

  return { userId: existing.id, invited: false };
}
