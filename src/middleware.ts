import { NextResponse, type NextRequest } from "next/server";

const OWNER_COOKIE = "ai_company_owner";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_next/")
  );
}

export function middleware(request: NextRequest) {
  if (process.env.AI_COMPANY_DEV_BYPASS_AUTH === "1") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const expected = process.env.AI_COMPANY_OWNER_TOKEN?.trim();
  if (!expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Owner token not configured (AI_COMPANY_OWNER_TOKEN)" },
        { status: 503 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url);
  }

  const cookieToken = request.cookies.get(OWNER_COOKIE)?.value;
  const headerToken = request.headers.get("x-ai-company-owner-token");
  const ok = cookieToken === expected || headerToken === expected;

  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
