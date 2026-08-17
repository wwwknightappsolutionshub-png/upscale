export type EmailTemplateKey = "registration";

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type EmailTemplatesStore = Record<EmailTemplateKey, EmailTemplate>;

export const EMAIL_MERGE_TAGS: { key: string; label: string; sample: string }[] = [
  { key: "name", label: "Full name", sample: "Ada Okonkwo" },
  { key: "email", label: "Email", sample: "ada@example.org" },
  { key: "courseName", label: "Course", sample: "Graphic Design" },
  { key: "startDate", label: "Cohort start", sample: "2026-09-14" },
  { key: "endDate", label: "Cohort end", sample: "2026-12-04" },
  { key: "daysLabel", label: "Class days", sample: "Mon & Wed" },
  { key: "timeLabel", label: "Class time", sample: "18:00–20:30" },
  { key: "timezone", label: "Timezone", sample: "GMT+1" },
  { key: "amount", label: "Fee", sample: "$450" },
  { key: "referenceCode", label: "Payment reference", sample: "UPS-GD-4821" },
  { key: "bankName", label: "Bank name", sample: "Example Bank" },
  { key: "accountName", label: "Account name", sample: "UPSCALE Training" },
  { key: "accountNumber", label: "Account number", sample: "0123456789" },
  { key: "bankInstructions", label: "Bank instructions", sample: "Transfer the exact cohort fee." },
  { key: "paymentUrl", label: "Upload link", sample: "https://upscale.example/register" },
  { key: "supportEmail", label: "Support email", sample: "frank.g@example.org" },
];

export const DEFAULT_REGISTRATION_EMAIL_TEXT = `Hello {{name}},

Thank you for registering with UPSCALE. Your seat on the upcoming cohort is reserved — enrolment is confirmed once we verify your payment.

YOUR REGISTRATION
Course:     {{courseName}}
Cohort:     {{startDate}} → {{endDate}}
Schedule:   {{daysLabel}}, {{timeLabel}} ({{timezone}})
Fee:        {{amount}}
Reference:  {{referenceCode}}
Status:     Registered — payment pending

Keep this reference. You must include it in your bank transfer narration.

PAY BY BANK TRANSFER
Bank:            {{bankName}}
Account name:    {{accountName}}
Account number:  {{accountNumber}}

Amount to pay:   {{amount}} (exact cohort fee)
Narration:       {{referenceCode}}

{{bankInstructions}}

UPLOAD YOUR RECEIPT
After you pay, upload a clear screenshot or PDF of your transfer receipt:

{{paymentUrl}}

This link is private. Do not share it.

WHAT HAPPENS NEXT
1. Transfer {{amount}} using reference {{referenceCode}}.
2. Upload payment evidence at the link above.
3. Our team verifies your receipt (usually 1–2 business days).
4. If approved and seats remain, you receive an enrolment email with join instructions.

Questions? Write to {{supportEmail}}.

UPSCALE
learn today, build tomorrow`;

export const DEFAULT_REGISTRATION_EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UPSCALE registration</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #111111;">
          <tr>
            <td style="padding:28px 24px 20px;border-bottom:1px solid #111111;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.08em;color:#1a56db;text-transform:uppercase;">Admissions</p>
              <h1 style="margin:0;font-size:28px;line-height:1.1;font-weight:900;letter-spacing:-0.03em;">Your seat is reserved.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;line-height:1.55;font-size:15px;">Hello <strong>{{name}}</strong>, thank you for registering for <strong>{{courseName}}</strong>. Enrolment is confirmed once we verify your payment.</p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #111111;border-collapse:collapse;">
                <tr>
                  <td style="padding:12px 14px;border-bottom:1px solid #111111;font-size:14px;"><strong>Reference</strong><br /><span style="font-family:ui-monospace,monospace;font-size:18px;font-weight:700;">{{referenceCode}}</span></td>
                </tr>
                <tr>
                  <td style="padding:12px 14px;border-bottom:1px solid #111111;font-size:14px;line-height:1.45;"><strong>Cohort</strong><br />{{startDate}} → {{endDate}}<br />{{daysLabel}}, {{timeLabel}} ({{timezone}})</td>
                </tr>
                <tr>
                  <td style="padding:12px 14px;font-size:14px;"><strong>Fee</strong><br />{{amount}} · Status: Registered — payment pending</td>
                </tr>
              </table>

              <h2 style="margin:0 0 8px;font-size:16px;font-weight:800;">Pay by bank transfer</h2>
              <p style="margin:0 0 16px;line-height:1.55;font-size:14px;color:#555555;">
                <strong>{{bankName}}</strong><br />
                {{accountName}} · {{accountNumber}}<br />
                Put <strong>{{referenceCode}}</strong> in the narration.<br />
                {{bankInstructions}}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td style="background:#111111;border-radius:0;">
                    <a href="{{paymentUrl}}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;">Upload payment receipt</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#555555;">This link is private. Do not share it. We review submissions manually — usually within 1–2 business days.</p>

              <p style="margin:0;font-size:13px;line-height:1.5;color:#777777;">Questions? <a href="mailto:{{supportEmail}}" style="color:#1a56db;font-weight:700;">{{supportEmail}}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #111111;">
              <p style="margin:0;font-size:12px;color:#999999;line-height:1.45;">UPSCALE — learn today, build tomorrow<br />You registered with {{email}}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const defaultEmailTemplates = (): EmailTemplatesStore => ({
  registration: {
    subject: "Your UPSCALE seat is reserved · {{referenceCode}}",
    html: DEFAULT_REGISTRATION_EMAIL_HTML,
    text: DEFAULT_REGISTRATION_EMAIL_TEXT,
  },
});

export function renderEmailTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function sampleRegistrationVars(): Record<string, string> {
  return Object.fromEntries(EMAIL_MERGE_TAGS.map((t) => [t.key, t.sample]));
}
