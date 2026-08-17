import { randomBytes } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function nid(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function newToken() {
  return randomBytes(24).toString("hex");
}
