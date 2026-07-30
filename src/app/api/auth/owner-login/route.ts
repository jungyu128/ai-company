import { NextResponse } from "next/server";
import { getOwnerToken, isOwnerTokenValid, OWNER_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (!getOwnerToken()) {
    return NextResponse.json(
      { ok: false, error: "AI_COMPANY_OWNER_TOKEN is not configured" },
      { status: 503 }
    );
  }
  if (!isOwnerTokenValid(token)) {
    return NextResponse.json({ ok: false, error: "Invalid owner token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
