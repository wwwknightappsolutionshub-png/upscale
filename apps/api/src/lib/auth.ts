import { eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { db } from "../db/client.ts";
import { adminUsers, sessions } from "../db/schema.ts";
import { nid, nowIso } from "./ids.ts";

const COOKIE = "upscale_admin";
const DAYS = 7;

export async function createSession(c: Context, adminUserId: string) {
  const id = nid("ses");
  const expires = new Date(Date.now() + DAYS * 864e5);
  await db.insert(sessions).values({
    id,
    adminUserId,
    expiresAt: expires.toISOString(),
  });
  setCookie(c, COOKIE, id, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

export async function destroySession(c: Context) {
  const id = getCookie(c, COOKIE);
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function currentAdmin(c: Context) {
  const id = getCookie(c, COOKIE);
  if (!id) return null;
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const ses = rows[0];
  if (!ses || ses.expiresAt < nowIso()) {
    if (ses) await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  const users = await db.select().from(adminUsers).where(eq(adminUsers.id, ses.adminUserId)).limit(1);
  return users[0] ?? null;
}

export async function requireAdmin(c: Context, next: Next) {
  const path = c.req.path;
  if (path.endsWith("/login") || path.endsWith("/css")) return next();
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect("/admin/login");
  c.set("admin", admin);
  return next();
}

declare module "hono" {
  interface ContextVariableMap {
    admin: typeof adminUsers.$inferSelect;
  }
}
