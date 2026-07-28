import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MANAGE_IT_ACCESS_COOKIE, MANAGE_IT_SESSION_COOKIE } from "@/lib/manageIt";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/manage-it/search-it" || pathname === "/app/manage-it/search-it") {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/manage-it") && !pathname.startsWith("/app/manage-it")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(MANAGE_IT_SESSION_COOKIE)?.value;
  const canAccessManageIt = request.cookies.get(MANAGE_IT_ACCESS_COOKIE)?.value === "1";

  if (!sessionToken) {
    console.info("[proxy] redirect", {
      route: pathname,
      target: "/signin",
      reason: "missing manage-it session cookie",
    });
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  if (!canAccessManageIt) {
    console.info("[proxy] redirect", {
      route: pathname,
      target: "/",
      reason: "manage-it access cookie not granted",
    });
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/manage-it", "/manage-it/:path*", "/app/manage-it", "/app/manage-it/:path*"],
};
