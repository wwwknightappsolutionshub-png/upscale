export function normalizeNgPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

export function isValidNgPhone(raw: string) {
  const n = normalizeNgPhone(raw);
  return /^234[789]\d{9}$/.test(n);
}

export function formatNgPhone(raw: string) {
  const n = normalizeNgPhone(raw);
  if (!/^234[789]\d{9}$/.test(n)) return raw.trim();
  return `0${n.slice(3)}`;
}
