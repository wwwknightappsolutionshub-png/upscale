import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

let transporter: Transporter | null | undefined;

function mailFrom() {
  return (process.env.MAIL_FROM || "UPSCALE <frank.g@example.org>").trim();
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!smtpConfigured()) {
    transporter = null;
    return transporter;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureEnv === "1" || secureEnv === "true" || port === 465;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!,
    },
  });
  return transporter;
}

async function logMail(mail: Mail, note: string) {
  const htmlBlock = mail.html ? `\n[HTML]\n${mail.html}\n` : "";
  const line = `\n---\n${new Date().toISOString()}\n${note}\nTo: ${mail.to}\nSubject: ${mail.subject}${
    mail.replyTo ? `\nReply-To: ${mail.replyTo}` : ""
  }\n\n${mail.text}${htmlBlock}\n`;
  const dir = resolve("data");
  await mkdir(dir, { recursive: true });
  await appendFile(resolve(dir, "mail.log"), line, "utf8");
}

/** Log whether outbound mail will go over SMTP (call once at boot). */
export function describeMailTransport() {
  if (smtpConfigured()) {
    const port = process.env.SMTP_PORT || "587";
    return `smtp://${process.env.SMTP_HOST}:${port} as ${process.env.SMTP_USER}`;
  }
  return "file://data/mail.log (set SMTP_HOST, SMTP_USER, SMTP_PASS to send real email)";
}

/**
 * Deliver mail via SMTP when configured; otherwise append to data/mail.log.
 * Throws only on SMTP transport failure so callers can decide whether to fail the request.
 */
export async function sendMail(mail: Mail) {
  const transport = getTransporter();
  if (!transport) {
    console.warn(`[mail] SMTP not configured — logging only: ${mail.subject} -> ${mail.to}`);
    await logMail(mail, "MODE: log-only (SMTP not configured)");
    return { mode: "log" as const };
  }

  try {
    const info = await transport.sendMail({
      from: mailFrom(),
      to: mail.to,
      replyTo: mail.replyTo || undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html || undefined,
    });
    console.log(`[mail] sent ${mail.subject} -> ${mail.to} id=${info.messageId || "?"}`);
    await logMail(mail, `MODE: smtp ok id=${info.messageId || "?"}`);
    return { mode: "smtp" as const, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mail] FAILED ${mail.subject} -> ${mail.to}: ${message}`);
    await logMail(mail, `MODE: smtp FAILED: ${message}`);
    throw err;
  }
}

/** Best-effort send — never throws (registration / evidence flows stay available). */
export async function sendMailSafe(mail: Mail) {
  try {
    return await sendMail(mail);
  } catch (err) {
    console.error(`[mail] swallowed error for ${mail.to}:`, err);
    return { mode: "failed" as const };
  }
}
