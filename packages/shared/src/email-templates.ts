export type EmailTemplateKey =
  | "registration"
  | "evidence_received"
  | "enrolled"
  | "waitlist"
  | "rejected";

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type EmailTemplatesStore = Record<EmailTemplateKey, EmailTemplate>;

/** Site palette from apps/web (logo blue / red / ink). */
export const EMAIL_BRAND = {
  blue: "#1f5eff",
  blueInk: "#1638c7",
  red: "#e31c24",
  ink: "#111111",
  muted: "#3d3d3d",
  paper: "#f6f3ee",
  white: "#ffffff",
} as const;

export const EMAIL_MERGE_TAGS: { key: string; label: string; sample: string }[] = [
  { key: "name", label: "Full name", sample: "Ada Okonkwo" },
  { key: "email", label: "Email", sample: "ada@example.org" },
  { key: "courseName", label: "Course", sample: "Graphic Design" },
  { key: "startDate", label: "Cohort start", sample: "2026-09-14" },
  { key: "endDate", label: "Cohort end", sample: "2026-12-04" },
  { key: "daysLabel", label: "Class days", sample: "Mon & Wed" },
  { key: "timeLabel", label: "Class time", sample: "18:00–20:30" },
  { key: "timezone", label: "Timezone", sample: "GMT+1" },
  { key: "amount", label: "Fee", sample: "$450 · ₦675,000" },
  { key: "referenceCode", label: "Payment reference", sample: "UPS-GD-4821" },
  { key: "bankName", label: "Bank name", sample: "Example Bank" },
  { key: "accountName", label: "Account name", sample: "UPSCALE Training" },
  { key: "accountNumber", label: "Account number", sample: "0123456789" },
  { key: "bankInstructions", label: "Bank instructions", sample: "Transfer the exact cohort fee." },
  { key: "paymentUrl", label: "Payment / upload link", sample: "https://upscale.example/payment?token=…" },
  { key: "supportEmail", label: "Support email", sample: "frank.g@example.org" },
  { key: "rejectReason", label: "Rejection reason", sample: "The receipt image was too blurry to read." },
];

/** True when a stored registration template still pushes bank-transfer / upload CTAs. */
export function registrationTemplateHasPaymentCta(html: string, text = "") {
  const blob = `${html}\n${text}`;
  return (
    /Pay by bank transfer/i.test(blob) ||
    /Upload payment receipt/i.test(blob) ||
    /\{\{bankName\}\}/.test(blob) ||
    /\{\{accountNumber\}\}/.test(blob) ||
    /\{\{accountName\}\}/.test(blob)
  );
}

/** True when HTML is missing the site blue brand token (needs refresh to branded default). */
export function emailTemplateNeedsBrandRefresh(html: string) {
  return !html.includes(EMAIL_BRAND.blue);
}

function brandedShell(opts: {
  title: string;
  eyebrow: string;
  headline: string;
  bodyHtml: string;
  footerNote: string;
  accent?: "blue" | "red";
}) {
  const { blue, blueInk, red, ink, muted, paper, white } = EMAIL_BRAND;
  const accent = opts.accent === "red" ? red : blue;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:${paper};font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${white};border:1px solid ${ink};">
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="70%" style="height:6px;background:${blue};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="30%" style="height:6px;background:${red};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 18px;border-bottom:1px solid ${ink};">
              <p style="margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:0.1em;color:${accent};text-transform:uppercase;">${opts.eyebrow}</p>
              <p style="margin:0 0 10px;font-size:13px;font-weight:800;letter-spacing:0.04em;color:${ink};">UPSCALE</p>
              <h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:900;letter-spacing:-0.03em;color:${ink};">${opts.headline}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;border-top:1px solid ${ink};background:${paper};">
              <p style="margin:0;font-size:12px;color:${muted};line-height:1.5;">
                <span style="color:${blueInk};font-weight:800;">learn today</span>
                <span style="color:${ink};"> · </span>
                <span style="color:${red};font-weight:800;">build tomorrow</span><br />
                ${opts.footerNote}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailsTable(rows: { label: string; value: string }[]) {
  const { ink } = EMAIL_BRAND;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${ink};border-collapse:collapse;">
${rows
  .map(
    (r, i) => `                <tr>
                  <td style="padding:12px 14px;${i < rows.length - 1 ? `border-bottom:1px solid ${ink};` : ""}font-size:14px;line-height:1.45;"><strong>${r.label}</strong><br />${r.value}</td>
                </tr>`,
  )
  .join("\n")}
              </table>`;
}

export const DEFAULT_REGISTRATION_EMAIL_TEXT = `Hello {{name}},

Thank you for registering with UPSCALE for {{courseName}}. Your seat on the upcoming cohort is reserved.

YOUR REGISTRATION
Course:     {{courseName}}
Cohort:     {{startDate}} → {{endDate}}
Schedule:   {{daysLabel}}, {{timeLabel}} ({{timezone}})
Fee:        {{amount}}
Reference:  {{referenceCode}}
Status:     Registered

Complete payment and upload your receipt on the registration page (bank details are shown there). If you already paid and uploaded your receipt, you are done for now — we will email you when it is verified.

If you closed the page and still need to upload later, use your private link:
{{paymentUrl}}

Do not share that link.

Questions? Write to {{supportEmail}}.

UPSCALE — learn today, build tomorrow`;

export const DEFAULT_REGISTRATION_EMAIL_HTML = brandedShell({
  title: "UPSCALE registration",
  eyebrow: "Admissions",
  headline: "Your seat is reserved.",
  accent: "blue",
  footerNote: "You registered with {{email}}.",
  bodyHtml: `
              <p style="margin:0 0 16px;line-height:1.55;font-size:15px;color:${EMAIL_BRAND.ink};">Hello <strong>{{name}}</strong>, thank you for registering for <strong>{{courseName}}</strong>.</p>

              ${detailsTable([
                {
                  label: "Reference",
                  value: `<span style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;">{{referenceCode}}</span>`,
                },
                {
                  label: "Cohort",
                  value: `{{startDate}} → {{endDate}}<br />{{daysLabel}}, {{timeLabel}} ({{timezone}})`,
                },
                {
                  label: "Fee",
                  value: `{{amount}} · Status: Registered`,
                },
              ])}

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">Bank details and receipt upload are on the registration page. <strong style="color:${EMAIL_BRAND.ink};">If you already paid and uploaded your receipt, you are done for now</strong> — we will email you when it is verified.</p>

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">Still need to upload? Keep this private link: <a href="{{paymentUrl}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">Open payment page</a></p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">Questions? <a href="mailto:{{supportEmail}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">{{supportEmail}}</a></p>
  `,
});

export const DEFAULT_EVIDENCE_RECEIVED_EMAIL_TEXT = `Hello {{name}},

We have your payment evidence for {{courseName}} ({{referenceCode}}).

Status: Receipt received — under review

Our team will verify the file (usually within 1–2 business days). You do not need to pay again or re-upload unless we write to ask for a clearer receipt.

Questions? {{supportEmail}}

UPSCALE — learn today, build tomorrow`;

export const DEFAULT_EVIDENCE_RECEIVED_EMAIL_HTML = brandedShell({
  title: "UPSCALE payment evidence",
  eyebrow: "Payments",
  headline: "We have your receipt.",
  accent: "blue",
  footerNote: "{{email}}",
  bodyHtml: `
              <p style="margin:0 0 16px;line-height:1.55;font-size:15px;color:${EMAIL_BRAND.ink};">Hello <strong>{{name}}</strong>, thank you — your payment evidence for <strong>{{courseName}}</strong> is in our review queue.</p>

              ${detailsTable([
                {
                  label: "Reference",
                  value: `<span style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;">{{referenceCode}}</span>`,
                },
                {
                  label: "Status",
                  value: `Receipt received — under review`,
                },
              ])}

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">You do <strong style="color:${EMAIL_BRAND.ink};">not</strong> need to transfer again or upload another file unless we ask for a clearer receipt. We usually review within 1–2 business days, then email you with the outcome.</p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">Questions? <a href="mailto:{{supportEmail}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">{{supportEmail}}</a></p>
  `,
});

export const DEFAULT_ENROLLED_EMAIL_TEXT = `Hello {{name}},

Congratulations — we have confirmed your payment and you are now fully registered for {{courseName}}.

YOUR ENROLMENT
Course:     {{courseName}}
Cohort:     {{startDate}} → {{endDate}}
Schedule:   {{daysLabel}}, {{timeLabel}} ({{timezone}})
Reference:  {{referenceCode}}
Status:     Enrolled

Join instructions and calendar notes will follow from {{supportEmail}}. Keep this email for your records.

Questions? Write to {{supportEmail}}.

UPSCALE — learn today, build tomorrow`;

export const DEFAULT_ENROLLED_EMAIL_HTML = brandedShell({
  title: "UPSCALE enrolment confirmed",
  eyebrow: "Enrolment",
  headline: "Congratulations — you are in.",
  accent: "red",
  footerNote: "{{email}}",
  bodyHtml: `
              <p style="margin:0 0 16px;line-height:1.55;font-size:15px;color:${EMAIL_BRAND.ink};">Hello <strong>{{name}}</strong>, we have confirmed your payment. You are now <strong>fully registered</strong> for <strong>{{courseName}}</strong>.</p>

              ${detailsTable([
                {
                  label: "Reference",
                  value: `<span style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;">{{referenceCode}}</span>`,
                },
                {
                  label: "Cohort",
                  value: `{{startDate}} → {{endDate}}<br />{{daysLabel}}, {{timeLabel}} ({{timezone}})`,
                },
                {
                  label: "Status",
                  value: `<strong style="color:${EMAIL_BRAND.red};">Enrolled — payment confirmed</strong>`,
                },
              ])}

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">Join instructions and calendar notes will follow from <a href="mailto:{{supportEmail}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">{{supportEmail}}</a>. Keep this email for your records.</p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">Welcome to UPSCALE — learn today, build tomorrow.</p>
  `,
});

export const DEFAULT_WAITLIST_EMAIL_TEXT = `Hello {{name}},

Your payment for {{courseName}} ({{referenceCode}}) is verified, but this cohort is at capacity. You are on the waitlist.

We will write if a seat opens. Questions? {{supportEmail}}

UPSCALE — learn today, build tomorrow`;

export const DEFAULT_WAITLIST_EMAIL_HTML = brandedShell({
  title: "UPSCALE waitlist",
  eyebrow: "Admissions",
  headline: "You are on the waitlist.",
  accent: "blue",
  footerNote: "{{email}}",
  bodyHtml: `
              <p style="margin:0 0 16px;line-height:1.55;font-size:15px;color:${EMAIL_BRAND.ink};">Hello <strong>{{name}}</strong>, your payment for <strong>{{courseName}}</strong> is verified, but this cohort is at capacity.</p>

              ${detailsTable([
                {
                  label: "Reference",
                  value: `<span style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;">{{referenceCode}}</span>`,
                },
                {
                  label: "Status",
                  value: `Waitlist — payment verified`,
                },
              ])}

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">We will email you if a seat opens. No further action is needed from you right now.</p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">Questions? <a href="mailto:{{supportEmail}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">{{supportEmail}}</a></p>
  `,
});

export const DEFAULT_REJECTED_EMAIL_TEXT = `Hello {{name}},

We could not verify the payment receipt for {{courseName}} ({{referenceCode}}).

Reason:
{{rejectReason}}

Please upload a clearer screenshot or PDF on your payment page:
{{paymentUrl}}

Questions? {{supportEmail}}

UPSCALE — learn today, build tomorrow`;

export const DEFAULT_REJECTED_EMAIL_HTML = brandedShell({
  title: "UPSCALE receipt not accepted",
  eyebrow: "Payments",
  headline: "We need another receipt.",
  accent: "red",
  footerNote: "{{email}}",
  bodyHtml: `
              <p style="margin:0 0 16px;line-height:1.55;font-size:15px;color:${EMAIL_BRAND.ink};">Hello <strong>{{name}}</strong>, we could not verify the payment receipt for <strong>{{courseName}}</strong>.</p>

              ${detailsTable([
                {
                  label: "Reference",
                  value: `<span style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;">{{referenceCode}}</span>`,
                },
                {
                  label: "Reason",
                  value: `{{rejectReason}}`,
                },
              ])}

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">Please upload a clearer screenshot or PDF: <a href="{{paymentUrl}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">Open payment page</a></p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">Questions? <a href="mailto:{{supportEmail}}" style="color:${EMAIL_BRAND.blueInk};font-weight:700;">{{supportEmail}}</a></p>
  `,
});

export const defaultEmailTemplates = (): EmailTemplatesStore => ({
  registration: {
    subject: "Your UPSCALE seat is reserved · {{referenceCode}}",
    html: DEFAULT_REGISTRATION_EMAIL_HTML,
    text: DEFAULT_REGISTRATION_EMAIL_TEXT,
  },
  evidence_received: {
    subject: "We have your UPSCALE receipt · {{referenceCode}}",
    html: DEFAULT_EVIDENCE_RECEIVED_EMAIL_HTML,
    text: DEFAULT_EVIDENCE_RECEIVED_EMAIL_TEXT,
  },
  enrolled: {
    subject: "Congratulations — you are enrolled · {{referenceCode}}",
    html: DEFAULT_ENROLLED_EMAIL_HTML,
    text: DEFAULT_ENROLLED_EMAIL_TEXT,
  },
  waitlist: {
    subject: "You are on the UPSCALE waitlist · {{referenceCode}}",
    html: DEFAULT_WAITLIST_EMAIL_HTML,
    text: DEFAULT_WAITLIST_EMAIL_TEXT,
  },
  rejected: {
    subject: "Receipt not accepted · {{referenceCode}}",
    html: DEFAULT_REJECTED_EMAIL_HTML,
    text: DEFAULT_REJECTED_EMAIL_TEXT,
  },
});

export function renderEmailTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function sampleRegistrationVars(): Record<string, string> {
  return Object.fromEntries(EMAIL_MERGE_TAGS.map((t) => [t.key, t.sample]));
}
