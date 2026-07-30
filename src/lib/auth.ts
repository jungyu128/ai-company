/**
 * AI Company auth — owner-only access guard (no WorkPilot Supabase/Prisma).
 * Cookie `ai_company_owner` or header `x-ai-company-owner-token` must match
 * AI_COMPANY_OWNER_TOKEN. Dev bypass: AI_COMPANY_DEV_BYPASS_AUTH=1.
 */

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER";
};

export type AuthContext = {
  user: AuthUser;
  companyId: string;
  role: "OWNER";
};

const OWNER_COOKIE = "ai_company_owner";

function ownerFromEnv(): AuthContext {
  return {
    user: {
      id: process.env.AI_COMPANY_OWNER_ID?.trim() || "owner",
      email: process.env.AI_COMPANY_OWNER_EMAIL?.trim() || "owner@ai-company.local",
      name: process.env.AI_COMPANY_OWNER_NAME?.trim() || "CEO Owner",
      role: "OWNER",
    },
    companyId: "ai-company",
    role: "OWNER",
  };
}

export function getOwnerToken(): string {
  return process.env.AI_COMPANY_OWNER_TOKEN?.trim() || "";
}

export function isOwnerTokenValid(token: string | null | undefined): boolean {
  const expected = getOwnerToken();
  if (!expected) return false;
  return Boolean(token && token === expected);
}

export async function getAuthContext(): Promise<AuthContext | null> {
  if (process.env.AI_COMPANY_DEV_BYPASS_AUTH === "1") {
    return ownerFromEnv();
  }

  const expected = getOwnerToken();
  if (!expected) return null;

  const h = await headers();
  const headerToken = h.get("x-ai-company-owner-token");
  if (isOwnerTokenValid(headerToken)) return ownerFromEnv();

  const jar = await cookies();
  const cookieToken = jar.get(OWNER_COOKIE)?.value;
  if (isOwnerTokenValid(cookieToken)) return ownerFromEnv();

  return null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message = "Internal server error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export { OWNER_COOKIE };
