import { NextResponse, type NextRequest } from "next/server";

/**
 * Handheld user agents. Matched case-insensitively; `iPad` also covers iPadOS
 * reporting a desktop browser, which still carries `Mobile` or a touch hint.
 */
const HANDHELD =
  /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle|PlayBook/i;

/** True when the request comes from a phone or a tablet. */
function isHandheld(request: NextRequest): boolean {
  const headers = request.headers;

  // Chromium sends these even when the user agent is reduced.
  if (headers.get("sec-ch-ua-mobile") === "?1") return true;

  const platform = headers.get("sec-ch-ua-platform") ?? "";

  if (/"(Android|iOS|iPadOS)"/i.test(platform)) return true;

  return HANDHELD.test(headers.get("user-agent") ?? "");
}

/**
 * The admin dashboard is a laptop screen: a phone that opens `/admin` is sent to
 * the notice page instead, so it never renders a table it cannot use.
 */
export function proxy(request: NextRequest) {
  if (!isHandheld(request)) return NextResponse.next();

  return NextResponse.redirect(new URL("/desktop-only", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
