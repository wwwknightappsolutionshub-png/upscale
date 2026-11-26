/** Plain text for names, emails, and short copy. Tags and control characters are removed. */
export function sanitizePlain(value: unknown, max: number) {
  const text = String(value ?? "")
    .replace(/\0/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

/** Rich text from the desk editor. Scripts, frames, and inline event handlers are removed. */
export function sanitizeRich(value: unknown, max: number) {
  let html = String(value ?? "")
    .replace(/\0/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, max);
  html = html.replace(/<\s*(script|iframe|object|embed|form|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|iframe|object|embed|form|link|meta|base)\b[^>]*\/?\s*>/gi, "");
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\s+(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "");
  html = html.replace(/\s+(href|src)\s*=\s*("\s*data:[^"]*"|'\s*data:[^']*'|data:[^\s>]+)/gi, "");
  return html.trim();
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

export function boundedInt(value: unknown, min: number, max: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}
