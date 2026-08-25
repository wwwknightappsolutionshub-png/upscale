import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  COURSE_PREFIX,
  formatMoney,
  formatNgPhone,
  isNigeria,
  normalizeNgPhone,
  registerSchema,
  type CourseSlug,
} from "@upscale/shared";
import { db } from "../db/client.ts";
import { cohorts, paymentEvidence, students } from "../db/schema.ts";
import { audit, courseBySlug, loadCatalog, nextCohort } from "../lib/catalog.ts";
import { nid, newToken, nowIso } from "../lib/ids.ts";
import { buildRegistrationEmail } from "../lib/email-templates.ts";
import { sendMail } from "../lib/mail.ts";
import { sha256 } from "../lib/password.ts";
import { rateLimit } from "../lib/rate-limit.ts";
import { saveEvidenceFile } from "../lib/storage.ts";

export const publicRoutes = new Hono();

function normalizePhoneForCompare(country: string, raw: string) {
  if (isNigeria(country)) return normalizeNgPhone(raw);
  return raw.replace(/\D/g, "");
}

function formatPhoneForStorage(country: string, raw: string) {
  if (isNigeria(country)) return formatNgPhone(raw);
  return raw.trim();
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
}

publicRoutes.get("/catalog", async (c) => {
  const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.BUILD_TOKEN || "dev-build-token";
  if (token !== expected) return c.json({ error: "Unauthorized" }, 401);
  return c.json(await loadCatalog());
});

publicRoutes.post("/register", async (c) => {
  if (!rateLimit(`reg:${clientIp(c)}`, 8, 60 * 60 * 1000)) {
    return c.json({ error: "Too many registrations from this network. Try later." }, 429);
  }

  const body = await c.req.parseBody();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const first =
      fieldErrors.name?.[0] ||
      fieldErrors.email?.[0] ||
      fieldErrors.phone?.[0] ||
      fieldErrors.country?.[0] ||
      fieldErrors.state?.[0] ||
      fieldErrors.city?.[0] ||
      fieldErrors.courseSlug?.[0] ||
      fieldErrors.motivation?.[0] ||
      fieldErrors.consent?.[0];
    return c.json({ error: first || "Check the form and try again.", details: parsed.error.flatten() }, 400);
  }

  const catalog = await loadCatalog();
  if (!catalog.settings.registrationOpen) {
    return c.json({ error: catalog.settings.closedMessage }, 403);
  }

  const course = courseBySlug(catalog, parsed.data.courseSlug);
  if (!course || !course.registrationOpen) {
    return c.json({ error: "That course is not open for this intake." }, 400);
  }

  const cohort = nextCohort(catalog, parsed.data.courseSlug);
  if (!cohort) return c.json({ error: "No open cohort for that course." }, 400);

  const email = parsed.data.email.toLowerCase();
  const phone = formatPhoneForStorage(parsed.data.country, parsed.data.phone);
  const phoneNorm = normalizePhoneForCompare(parsed.data.country, parsed.data.phone);
  const cohortStudents = await db.select().from(students).where(eq(students.cohortId, cohort.id));
  const dupEmail = cohortStudents.find((s) => s.email === email);
  const dupPhone = cohortStudents.find(
    (s) => normalizePhoneForCompare(s.country, s.phone) === phoneNorm,
  );

  if (dupEmail && dupPhone) {
    return c.json(
      { error: "This email and phone number are already registered for this cohort." },
      409,
    );
  }
  if (dupEmail) {
    return c.json({ error: "This email is already registered for this cohort." }, 409);
  }
  if (dupPhone) {
    return c.json({ error: "This phone number is already registered for this cohort." }, 409);
  }

  const site = process.env.WEB_ORIGIN || "http://localhost:4321";
  const token = newToken();
  const prefix = COURSE_PREFIX[parsed.data.courseSlug as CourseSlug];
  let referenceCode = "";
  for (let i = 0; i < 8; i++) {
    const n = 1000 + Math.floor(Math.random() * 9000);
    const code = `UPS-${prefix}-${n}`;
    const clash = await db.select({ id: students.id }).from(students).where(eq(students.referenceCode, code)).limit(1);
    if (clash.length === 0) {
      referenceCode = code;
      break;
    }
  }
  if (!referenceCode) return c.json({ error: "Could not allocate a reference. Retry." }, 500);

  const id = nid("stu");
  const ts = nowIso();
  await db.insert(students).values({
    id,
    name: parsed.data.name,
    email,
    phone,
    country: parsed.data.country,
    state: isNigeria(parsed.data.country) ? parsed.data.state || "" : "",
    city: isNigeria(parsed.data.country) ? parsed.data.city || "" : "",
    courseSlug: parsed.data.courseSlug,
    cohortId: cohort.id,
    motivation: parsed.data.motivation,
    referenceCode,
    tokenHash: sha256(token),
    status: "registered",
    createdAt: ts,
    updatedAt: ts,
  });

  await audit("public", "register", "student", id, { course: parsed.data.courseSlug, email });

  const payUrl = `${site}/payment?token=${token}`;
  const amount = formatMoney(cohort.price, cohort.currency);
  const rendered = await buildRegistrationEmail({
    name: parsed.data.name,
    email,
    courseName: course.name,
    startDate: cohort.startDate,
    endDate: cohort.endDate,
    daysLabel: cohort.daysLabel,
    timeLabel: cohort.timeLabel,
    timezone: cohort.timezone,
    amount,
    referenceCode,
    bankName: catalog.settings.bank.bankName,
    accountName: catalog.settings.bank.accountName,
    accountNumber: catalog.settings.bank.accountNumber,
    bankInstructions: catalog.settings.bank.instructions,
    paymentUrl: payUrl,
    supportEmail: catalog.settings.email,
  });
  await sendMail({
    to: email,
    replyTo: catalog.settings.email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });

  return c.json({
    ok: true,
    referenceCode,
    status: "registered",
    amount,
    course: course.name,
    uploadToken: token,
    cohort: {
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      daysLabel: cohort.daysLabel,
      timeLabel: cohort.timeLabel,
    },
    bank: catalog.settings.bank,
    paymentUrl: payUrl,
  });
});

publicRoutes.get("/status", async (c) => {
  const token = c.req.query("token") || "";
  if (token.length < 16) return c.json({ error: "Missing token" }, 400);
  const rows = await db.select().from(students).where(eq(students.tokenHash, sha256(token))).limit(1);
  const student = rows[0];
  if (!student) return c.json({ error: "Unknown or expired link" }, 404);

  const catalog = await loadCatalog();
  const course = courseBySlug(catalog, student.courseSlug);
  const cohort = catalog.cohorts.find((x) => x.id === student.cohortId);
  const evidence = await db.select().from(paymentEvidence).where(eq(paymentEvidence.studentId, student.id));
  const latest = evidence.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];

  return c.json({
    name: student.name,
    referenceCode: student.referenceCode,
    status: student.status,
    course: course?.name,
    courseSlug: student.courseSlug,
    amount: cohort ? formatMoney(cohort.price, cohort.currency) : null,
    price: cohort?.price ?? 0,
    currency: cohort?.currency ?? "USD",
    bank: catalog.settings.bank,
    cohort,
    evidenceStatus: latest?.status ?? null,
    reviewNotes: student.status === "rejected" ? latest?.reviewNotes ?? "" : "",
  });
});

publicRoutes.post("/evidence", async (c) => {
  if (!rateLimit(`ev:${clientIp(c)}`, 12, 60 * 60 * 1000)) {
    return c.json({ error: "Too many uploads. Try later." }, 429);
  }

  const body = await c.req.parseBody({ all: true });
  const token = String(body.token || "");
  const method = body.method === "other" ? "other" : "transfer";
  if (token.length < 16) return c.json({ error: "Missing token" }, 400);

  const rows = await db.select().from(students).where(eq(students.tokenHash, sha256(token))).limit(1);
  const student = rows[0];
  if (!student) return c.json({ error: "Unknown or expired link" }, 404);
  if (student.status === "enrolled" || student.status === "verified") {
    return c.json({ error: "This registration is already verified." }, 409);
  }

  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "Attach a receipt image or PDF." }, 400);

  try {
    const saved = await saveEvidenceFile(file, student.id);
    const catalog = await loadCatalog();
    const cohort = catalog.cohorts.find((x) => x.id === student.cohortId);
    const id = nid("evd");
    const ts = nowIso();
    await db.insert(paymentEvidence).values({
      id,
      studentId: student.id,
      amount: cohort?.price ?? 0,
      method,
      fileKey: saved.fileKey,
      mime: saved.mime,
      size: saved.size,
      status: "pending",
      submittedAt: ts,
    });
    await db
      .update(students)
      .set({ status: "evidence_submitted", updatedAt: ts })
      .where(eq(students.id, student.id));
    await audit("public", "evidence_submit", "student", student.id, { evidenceId: id });

    await sendMail({
      to: process.env.ADMIN_EMAIL || "leo.a@example.org",
      subject: `Payment evidence ${student.referenceCode}`,
      text: `${student.name} uploaded evidence for ${student.referenceCode}. Review it in admin.`,
    });
    await sendMail({
      to: student.email,
      subject: `We have your UPSCALE receipt ${student.referenceCode}`,
      text: `Hello ${student.name},\n\nYour payment evidence is in the review queue. We will email you when it is approved or if we need another file.\n\nUPSCALE`,
    });

    return c.json({ ok: true, status: "evidence_submitted" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return c.json({ error: message }, 400);
  }
});
