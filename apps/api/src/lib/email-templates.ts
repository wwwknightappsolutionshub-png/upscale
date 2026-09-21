import {
  defaultEmailTemplates,
  emailTemplateNeedsBrandRefresh,
  registrationTemplateHasPaymentCta,
  renderEmailTemplate,
  type EmailTemplate,
  type EmailTemplateKey,
  type EmailTemplatesStore,
} from "@upscale/shared/email-templates";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { settings } from "../db/schema.ts";

const SETTINGS_ID = "email_templates";

export type RegistrationEmailVars = {
  name: string;
  email: string;
  courseName: string;
  startDate: string;
  endDate: string;
  daysLabel: string;
  timeLabel: string;
  timezone: string;
  amount: string;
  referenceCode: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  bankInstructions: string;
  paymentUrl: string;
  supportEmail: string;
};

export type EvidenceReceivedEmailVars = {
  name: string;
  email: string;
  courseName: string;
  referenceCode: string;
  supportEmail: string;
};

export type EnrolledEmailVars = {
  name: string;
  email: string;
  courseName: string;
  startDate: string;
  endDate: string;
  daysLabel: string;
  timeLabel: string;
  timezone: string;
  referenceCode: string;
  supportEmail: string;
};

export type WaitlistEmailVars = {
  name: string;
  email: string;
  courseName: string;
  referenceCode: string;
  supportEmail: string;
};

export type RejectedEmailVars = {
  name: string;
  email: string;
  courseName: string;
  referenceCode: string;
  rejectReason: string;
  paymentUrl: string;
  supportEmail: string;
};

function mergeStore(parsed: Partial<EmailTemplatesStore> | null | undefined): EmailTemplatesStore {
  const defaults = defaultEmailTemplates();
  return {
    registration: { ...defaults.registration, ...(parsed?.registration || {}) },
    evidence_received: { ...defaults.evidence_received, ...(parsed?.evidence_received || {}) },
    enrolled: { ...defaults.enrolled, ...(parsed?.enrolled || {}) },
    waitlist: { ...defaults.waitlist, ...(parsed?.waitlist || {}) },
    rejected: { ...defaults.rejected, ...(parsed?.rejected || {}) },
  };
}

export async function loadEmailTemplates(): Promise<EmailTemplatesStore> {
  const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
  if (!rows[0]?.json) return defaultEmailTemplates();
  try {
    return mergeStore(JSON.parse(rows[0].json) as Partial<EmailTemplatesStore>);
  } catch {
    return defaultEmailTemplates();
  }
}

export async function saveEmailTemplate(key: EmailTemplateKey, template: EmailTemplate) {
  const current = await loadEmailTemplates();
  current[key] = template;
  const existing = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
  if (existing.length === 0) {
    await db.insert(settings).values({ id: SETTINGS_ID, json: JSON.stringify(current) });
  } else {
    await db.update(settings).set({ json: JSON.stringify(current) }).where(eq(settings.id, SETTINGS_ID));
  }
}

export async function ensureEmailTemplates() {
  const defaults = defaultEmailTemplates();
  const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
  if (rows.length === 0) {
    await db.insert(settings).values({ id: SETTINGS_ID, json: JSON.stringify(defaults) });
    return;
  }

  let parsed: Partial<EmailTemplatesStore> = {};
  try {
    parsed = JSON.parse(rows[0]!.json) as Partial<EmailTemplatesStore>;
  } catch {
    await db.update(settings).set({ json: JSON.stringify(defaults) }).where(eq(settings.id, SETTINGS_ID));
    return;
  }

  const next = mergeStore(parsed);
  let changed = false;

  if (registrationTemplateHasPaymentCta(next.registration.html, next.registration.text)) {
    next.registration = defaults.registration;
    changed = true;
    console.log("[email] refreshed registration template (removed pay/upload CTA)");
  }

  const keys = Object.keys(defaults) as EmailTemplateKey[];
  for (const key of keys) {
    if (!parsed[key]) {
      next[key] = defaults[key];
      changed = true;
      console.log(`[email] added ${key} template`);
      continue;
    }
    if (emailTemplateNeedsBrandRefresh(next[key].html)) {
      next[key] = defaults[key];
      changed = true;
      console.log(`[email] refreshed ${key} template (brand palette)`);
    }
  }

  if (changed) {
    await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, SETTINGS_ID));
  }
}

export function renderEmail(template: EmailTemplate, vars: Record<string, string>) {
  const subject = renderEmailTemplate(template.subject, vars);
  const html = renderEmailTemplate(template.html, vars);
  const text = template.text.trim()
    ? renderEmailTemplate(template.text, vars)
    : htmlToText(html);
  return { subject, html, text };
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<\/a>/gi, "")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, "$1 ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function buildRegistrationEmail(vars: RegistrationEmailVars) {
  const templates = await loadEmailTemplates();
  return renderEmail(templates.registration, vars);
}

export async function buildEvidenceReceivedEmail(vars: EvidenceReceivedEmailVars) {
  const templates = await loadEmailTemplates();
  return renderEmail(templates.evidence_received, vars);
}

export async function buildEnrolledEmail(vars: EnrolledEmailVars) {
  const templates = await loadEmailTemplates();
  return renderEmail(templates.enrolled, vars);
}

export async function buildWaitlistEmail(vars: WaitlistEmailVars) {
  const templates = await loadEmailTemplates();
  return renderEmail(templates.waitlist, vars);
}

export async function buildRejectedEmail(vars: RejectedEmailVars) {
  const templates = await loadEmailTemplates();
  return renderEmail(templates.rejected, vars);
}
