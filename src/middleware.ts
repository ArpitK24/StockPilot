import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap edge guard: bounce obviously signed-out visitors away from app pages.
 * Real authentication and authorisation happen on the server for every page and
 * API call (src/server/page-auth.ts, src/server/http/handler.ts).
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("sp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/w/:path*", "/workspaces"] };
