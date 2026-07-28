"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchProfileByUserId, resolvePostSignInPath } from "@/lib/authOnboarding";
import AccessSetupIssueView from "@/components/AccessSetupIssueView";
import { syncManageItSession } from "@/lib/manageIt";
import { getSupabaseProjectRefFromUrl, supabase } from "@/lib/supabaseClient";

const PUBLIC_PATHS = new Set(["/signin", "/signup", "/login", "/forgot-password", "/reset-password"]);

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname === "/manage-it/search-it" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/order-input") ||
    pathname === "/booking-forms" ||
    // The Sprint 1 "Foundation it" application shell (/app/*) manages its own
    // auth guard (see src/app/app/layout.tsx) against the new organisation /
    // merchant membership model, independently of this legacy profile-based
    // gate - so it is intentionally excluded here rather than adapted.
    pathname.startsWith("/app")
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [checking, setChecking] = useState(true);
  const [guardError, setGuardError] = useState<string | null>(null);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function completeCheck() {
      if (!cancelled) {
        setChecking(false);
      }
    }

    function redirectOnce(target: string, reason: string) {
      if (hasRedirectedRef.current || cancelled) {
        return;
      }
      hasRedirectedRef.current = true;
      console.info("[AuthGate] redirect", { route: pathname, target, reason });
      router.replace(target);
    }

    async function guard() {
      try {
        setChecking(true);
        setGuardError(null);

        if (!supabase) {
          console.warn("[AuthGate] Supabase unavailable; skipping auth guard", {
            route: pathname,
            supabaseProjectRef: getSupabaseProjectRefFromUrl(),
          });
          completeCheck();
          return;
        }

        const isPublic = isPublicRoute(pathname);
        const isAuthEntry = pathname === "/signin" || pathname === "/signup";
        const isAuthCallback = pathname === "/auth/callback";

        const [{ data: userData }, { data: sessionData }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.auth.getSession(),
        ]);
        if (userData.user?.id && sessionData.session?.user && userData.user.id !== sessionData.session.user.id) {
          console.warn("[AuthGate] auth state mismatch between getUser and getSession", {
            route: pathname,
            getUserId: userData.user.id,
            getSessionId: sessionData.session.user.id,
          });
        }
        let user = userData.user ?? sessionData.session?.user ?? null;
        let accessToken = sessionData.session?.access_token ?? null;

        console.info("[AuthGate] session check", {
          route: pathname,
          sessionUserId: sessionData.session?.user?.id ?? null,
          resolvedUserId: user?.id ?? null,
          supabaseProjectRef: getSupabaseProjectRefFromUrl(),
        });

        if (!user) {
          // Avoid redirect loops on valid sessions during hydration by retrying session read once.
          const recovered = await supabase.auth.getSession();
          if (recovered.data.session?.user) {
            user = recovered.data.session.user;
            accessToken = recovered.data.session.access_token ?? null;
          }
        }

        if (!user) {
          try {
            await syncManageItSession(null);
          } catch (syncError) {
            console.error("[AuthGate] session clear failed", {
              route: pathname,
              error: syncError instanceof Error ? syncError.message : String(syncError),
            });
          }

          if (!isPublic) {
            redirectOnce("/signin", "no active session");
            return;
          }
          completeCheck();
          return;
        }

        try {
          await syncManageItSession(accessToken);
        } catch (syncError) {
          console.error("[AuthGate] session sync failed; continuing with active client session", {
            route: pathname,
            sessionUserId: user.id,
            error: syncError instanceof Error ? syncError.message : String(syncError),
          });
        }

        if (isAuthEntry || isAuthCallback) {
          const destination = await resolvePostSignInPath(user.id);
          console.info("[AuthGate] profile fetch result", {
            route: pathname,
            sessionUserId: user.id,
            profileDestination: destination,
          });
          redirectOnce(destination, "authenticated user on auth entry route");
          return;
        }

        if (!isPublic) {
          try {
            const profile = await fetchProfileByUserId(user.id);
            const profileExists = Boolean(profile);
            const profileRole = (profile?.role ?? "").trim().toLowerCase();
            console.info("[AuthGate] profile fetch result", {
              route: pathname,
              sessionUserId: user.id,
              profileExists,
              profileRole,
              profileId: profile?.id ?? null,
            });

            if (!profileExists && pathname !== "/onboarding") {
              redirectOnce("/onboarding", "active session without profile");
              return;
            }

            if (profileExists && pathname === "/onboarding") {
              redirectOnce(profileRole === "customer" ? "/customer" : "/", "profile already exists");
              return;
            }

            if (pathname.startsWith("/customer") && profileRole !== "customer") {
              redirectOnce("/", "customer portal requires customer role");
              return;
            }
          } catch (profileError) {
            const message = profileError instanceof Error ? profileError.message : String(profileError);
            console.error("[AuthGate] profile fetch result", {
              route: pathname,
              sessionUserId: user.id,
              profileExists: false,
              error: message,
            });
            if (pathname !== "/") {
              redirectOnce("/", "profile fetch failed; show access setup issue");
              return;
            }
            if (!cancelled) {
              setGuardError(message);
            }
          }
        }

        completeCheck();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[AuthGate] guard failed; not redirecting due to indeterminate auth state", {
          route: pathname,
          error: message,
        });
        if (!cancelled) {
          setGuardError(message);
        }
        completeCheck();
      }
    }

    void guard();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (checking && !isPublicRoute(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111827] px-4 text-sm text-slate-300">
        Checking session...
      </div>
    );
  }

  if (guardError && !isPublicRoute(pathname)) {
    return (
      <AccessSetupIssueView
        heading="We could not verify your session state."
        details={guardError}
      />
    );
  }

  return <>{children}</>;
}
