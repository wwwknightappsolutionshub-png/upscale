import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { db } from "../db/client.ts";
import { adminUsers, sessions } from "../db/schema.ts";
import { nowIso } from "./ids.ts";

const COOKIE = "upscale_admin";
/** Staff sessions expire after 8 hours. A new sign-in is required after that. */
const SESSION_MS = 8 * 60 * 60 * 1000;

function cookieSecure(c: Context) {
  return c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https";
}

export async function createSession(c: Context, adminUserId: string) {
  const id = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MS);
  await db.insert(sessions).values({
    id,
    adminUserId,
    expiresAt: expires.toISOString(),
  });
  setCookie(c, COOKIE, id, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: cookieSecure(c),
    expires,
  });
}

/** Drop every desk session for this user, including other browsers. */
export async function destroyAllSessions(adminUserId: string) {
  await db.delete(sessions).where(eq(sessions.adminUserId, adminUserId));
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
  const user = users[0];
  if (!user) return null;
  if (user.lockedUntil && user.lockedUntil > nowIso()) {
    await db.delete(sessions).where(eq(sessions.adminUserId, user.id));
    return null;
  }
  return user;
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
