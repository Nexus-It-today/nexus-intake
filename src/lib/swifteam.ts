export const SWIFTEAM_MASTER_EMAIL = "swift@nexus.delivery";
export const SWIFTEAM_CIRCLELOOP_IDENTITY = "0113 479 0208";

export const SWIFTEAM_METERED_ACTIONS = [
  "email_sent",
  "email_received",
  "call_made",
  "call_received",
  "call_seconds",
  "tracking_query",
  "account_query",
] as const;

export type SwifteamMeteredAction = (typeof SWIFTEAM_METERED_ACTIONS)[number];

export function isSwifteamMaster(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SWIFTEAM_MASTER_EMAIL;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function warningLevel(percentageUsed: number): "none" | "75" | "90" | "100" {
  if (percentageUsed >= 100) return "100";
  if (percentageUsed >= 90) return "90";
  if (percentageUsed >= 75) return "75";
  return "none";
}
