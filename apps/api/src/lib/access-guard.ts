import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { adminUsers } from "../db/schema.ts";
import { isRateLimited, rateLimit } from "./rate-limit.ts";

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 8;
const ACCOUNT_LIMIT = 5;

export function clientIp(c: { req: { header: (name: string) => string | undefined } }) {
  const real = c.req.header("x-real-ip")?.trim();
  if (real) return real;
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function ipBlocked(scope: string, ip: string) {
  return isRateLimited(`${scope}:${ip}`, IP_LIMIT, WINDOW_MS);
}

export function noteIpFailure(scope: string, ip: string) {
  return rateLimit(`${scope}:${ip}`, IP_LIMIT, WINDOW_MS);
}

export async function accountLocked(email: string) {
  const user = await findAdmin(email);
  if (!user?.lockedUntil) return false;
  return user.lockedUntil > new Date().toISOString();
}

export async function recordPasswordFailure(email: string) {
  const user = await findAdmin(email);
  if (!user) return;
  const fails = (user.failedAttempts || 0) + 1;
  const lockedUntil = fails >= ACCOUNT_LIMIT ? new Date(Date.now() + WINDOW_MS).toISOString() : user.lockedUntil || "";
  await db
    .update(adminUsers)
    .set({ failedAttempts: fails, lockedUntil })
    .where(eq(adminUsers.id, user.id));
}

export async function clearPasswordFailures(userId: string) {
  await db.update(adminUsers).set({ failedAttempts: 0, lockedUntil: "" }).where(eq(adminUsers.id, userId));
}

async function findAdmin(email: string) {
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  return rows[0];
}
