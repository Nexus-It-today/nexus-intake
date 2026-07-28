import type { Metadata } from "next";
import PlatformProvider from "@/components/platform/PlatformProvider";
import AppShellChrome from "@/components/platform/AppShellChrome";

export const metadata: Metadata = {
  title: "Nexus it",
  description: "Nexus it platform foundation - organisations, merchants, users and branding.",
};

/**
 * Root of the Sprint 1 "Foundation it" application shell. This layout is
 * intentionally NOT gated by the legacy AuthGate (see src/components/AuthGate.tsx,
 * which excludes /app) - PlatformProvider performs its own session check and
 * redirects to /login, and every /api/platform/* route independently
 * re-verifies the bearer token server-side. No page here trusts client state
 * alone for access decisions.
 */
export default function AppFoundationLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlatformProvider>
      <AppShellChrome>{children}</AppShellChrome>
    </PlatformProvider>
  );
}
