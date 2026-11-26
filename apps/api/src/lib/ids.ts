import { randomBytes } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function nid(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

/** Payment and status links stay valid for 24 hours, then must be reissued. */
export function paymentTokenExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
