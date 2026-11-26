import { readFile } from "node:fs/promises";
import { count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { CourseFaq, CourseSlug, LandingSettings, TrackingPixel, TrackingProvider, WaysInItem, WeekBlock } from "@upscale/shared";
import {
  formatFeeLabel,
  formatMoney,
  isNigeria,
  isTrackingProvider,
  parseTrackingValue,
  TRACKING_PROVIDER_LABEL,
  TRACKING_PROVIDERS,
  boundedInt,
  COURSE_SLUGS,
  isIsoDate,
  sanitizePlain,
  sanitizeRich,
  WAYS_IN_MARKS,
} from "@upscale/shared";
import { seedCatalog } from "@upscale/shared/seed";
import { db } from "../db/client.ts";
import {
  adminUsers,
  auditLogs,
  cohorts,
  courses,
  instructors,
  paymentEvidence,
  settings,
  students,
} from "../db/schema.ts";
import { createSession, currentAdmin, destroyAllSessions, destroySession, requireAdmin } from "../lib/auth.ts";
import { accountLocked, clearPasswordFailures, clientIp, ipBlocked, noteIpFailure, recordPasswordFailure } from "../lib/access-guard.ts";
import { audit, loadCatalog, nextCohort } from "../lib/catalog.ts";
import { nid, nowIso, newToken, paymentTokenExpiry } from "../lib/ids.ts";
import { describeMailTransport, sendMail, sendMailSafe } from "../lib/mail.ts";
import {
  buildEnrolledEmail,
  buildRejectedEmail,
  buildWaitlistEmail,
  loadEmailTemplates,
  renderEmail,
  saveEmailTemplate,
} from "../lib/email-templates.ts";
import { hashPassword, sha256, verifyPassword } from "../lib/password.ts";
import { safeJoinUpload, saveBrandAsset, saveInstructorPhoto, mimeFromUploadKey, removeStudentUploadDir } from "../lib/storage.ts";
import { adminCss } from "../admin/styles.ts";
import { registrationEmailEditorPage } from "../admin/emails-page.ts";
import { layout, loginPage, pageHead, roleLabel } from "../admin/html.ts";
import { faqEditorBoot, faqEditorHtml } from "../admin/faq-editor.ts";
import { outlineEditorBoot, outlineEditorHtml } from "../admin/outline-editor.ts";
import { richEditorBoot, textareaValue } from "../admin/rich-editor.ts";
import {
  canDeleteStudents,
  canEditInstructors,
  canManageEmailTemplates,
  canManageSiteContent,
  canManageTeam,
  canReviewEvidence,
  canViewAudit,
  normalizeAdminRole,
  type AdminRole,
} from "../lib/roles.ts";
import { sampleRegistrationVars } from "@upscale/shared/email-templates";
import { publishSite } from "../lib/publish-site.ts";

export const adminRoutes = new Hono();

adminRoutes.get("/css", (c) => c.body(adminCss, 200, { "content-type": "text/css; charset=utf-8" }));

adminRoutes.get("/login", async (c) => {
  if (await currentAdmin(c)) return c.redirect("/admin");
  return c.html(loginPage());
});

adminRoutes.post("/login", async (c) => {
  const ip = clientIp(c);
  if (ipBlocked("login", ip)) {
    return c.html(loginPage("Too many attempts from this network. Try again later."), 429);
  }
  const body = await c.req.parseBody();
  const email = sanitizePlain(body.email, 180).toLowerCase();
  const password = String(body.password || "");
  if (email && (await accountLocked(email))) {
    return c.html(loginPage("This account is locked. Try again in 15 minutes."), 429);
  }
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  const user = rows[0];
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "00".repeat(16) + ":" + "00".repeat(64));
  if (!user || !passwordOk) {
    noteIpFailure("login", ip);
    if (user) await recordPasswordFailure(email);
    return c.html(loginPage("Those credentials are not right."));
  }
  await clearPasswordFailures(user.id);
  await createSession(c, user.id);
  await audit(user.email, "login", "admin", user.id);
  return c.redirect("/admin");
});

adminRoutes.post("/logout", async (c) => {
  const admin = await currentAdmin(c);
  await destroySession(c);
  if (admin) await audit(admin.email, "logout", "admin", admin.id);
  return c.redirect("/admin/login");
});

adminRoutes.use("*", requireAdmin);

type AdminUser = typeof adminUsers.$inferSelect;

function roleOf(admin: AdminUser): AdminRole {
  return normalizeAdminRole(admin.role);
}

function desk(admin: AdminUser, title: string, body: string, active: string) {
  return layout(title, admin.name, body, active, roleOf(admin));
}

function forbid(c: { html: (html: string, status?: number) => Response }, admin: AdminUser, message: string) {
  return c.html(desk(admin, "Forbidden", `<p class="err">${esc(message)}</p>`, "/admin"), 403);
}

function flashBanner(c: { req: { query: (k: string) => string | undefined } }) {
  const saved = c.req.query("saved");
  const published = c.req.query("published");
  const publishError = c.req.query("publishError");
  const deleted = c.req.query("deleted");
  const ok = c.req.query("ok");
  if (publishError) {
    return `<p class="banner bad">${esc(publishError)}</p>`;
  }
  if (deleted === "1") {
    return `<p class="banner ok">Student deleted permanently from the database.</p>`;
  }
  if (published === "1") {
    return `<p class="banner ok">Saved and published to the public site.</p>`;
  }
  if (saved === "1") {
    return `<p class="banner ok">Saved in the desk.</p>`;
  }
  if (ok) return `<p class="banner ok">${esc(ok)}</p>`;
  return "";
}

async function publishAndRedirect(path: string) {
  const result = await publishSite();
  const q = result.ok
    ? "saved=1&published=1"
    : `saved=1&publishError=${encodeURIComponent(result.message)}`;
  return `${path}${path.includes("?") ? "&" : "?"}${q}`;
}

function formActions(label: string) {
  return `<div class="form-actions">
    <button type="submit">${esc(label)}</button>
    <p class="hint">Saving also rebuilds the public website so visitors see your changes.</p>
  </div>`;
}

adminRoutes.get("/", async (c) => {
  const catalog = await loadCatalog();
  const allStudents = await db.select().from(students).orderBy(desc(students.createdAt));
  const pending = await db.select().from(paymentEvidence).where(eq(paymentEvidence.status, "pending"));
  const counts = countBy(allStudents.map((s) => s.status));
  const admin = c.get("admin");
  return c.html(
    desk(admin, "Desk", `
      ${pageHead("Desk", "Pipeline for the current intakes. Approve evidence before a seat is taken.")}
      ${flashBanner(c)}
      <div class="toolbar">
        <form method="post" action="/admin/publish">
          <button type="submit">Publish public site now</button>
        </form>
        <p class="hint">Use this if you edited content and the live site still looks stale.</p>
      </div>
      <ul class="stats">
        ${pipe("Registered", counts.registered)}
        ${pipe("Evidence", counts.evidence_submitted)}
        ${pipe("Pending files", pending.length)}
        ${pipe("Enrolled", counts.enrolled)}
        ${pipe("Waitlist", counts.waitlist)}
        ${pipe("Rejected", counts.rejected)}
      </ul>
      <div class="split">
        <section class="panel">
          <h2>Open intakes</h2>
          <div class="table-wrap">
          <table>
            <thead><tr><th>Course</th><th>Starts</th><th>Seats</th><th>Fee</th></tr></thead>
            <tbody>
              ${catalog.cohorts
                .map((co) => {
                  const course = catalog.courses.find((x) => x.slug === co.courseSlug);
                  return `<tr>
                    <td>${esc(course?.name || co.courseSlug)}</td>
                    <td>${esc(co.startDate)}</td>
                    <td>${co.seatsTaken} / ${co.seatCap}</td>
                    <td>${esc(formatFeeLabel(co.price, co.currency, co.priceNgn))}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
          </div>
        </section>
        <section class="panel">
          <h2>Latest students</h2>
          <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Ref</th><th>Status</th></tr></thead>
            <tbody>
              ${allStudents
                .slice(0, 8)
                .map(
                  (s) => `<tr>
                    <td><a href="/admin/students/${s.id}">${esc(s.name)}</a></td>
                    <td><code>${esc(s.referenceCode)}</code></td>
                    <td>${statusBadge(s.status)}</td>
                  </tr>`,
                )
                .join("") || `<tr><td colspan="3">No registrations yet.</td></tr>`}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    `, "/admin"),
  );
});

adminRoutes.get("/students", async (c) => {
  const admin = c.get("admin");
  const statuses = ["registered", "evidence_submitted", "verified", "rejected", "enrolled", "waitlist"];
  const statusQuery = c.req.query("status") || "";
  const status = statuses.includes(statusQuery) ? statusQuery : "";
  const rows = await db.select().from(students).orderBy(desc(students.createdAt));
  const filtered = status ? rows.filter((s) => s.status === status) : rows;
  const requested = requestedPage(c.req.query("page"));
  const bounds = pageBounds(filtered.length, requested);
  if (requested !== bounds.current) {
    return c.redirect(listHref("/admin/students", bounds.current, { status }));
  }
  const pageRows = filtered.slice(bounds.start, bounds.start + LIST_PAGE_SIZE);
  const catalog = await loadCatalog();
  return c.html(
    desk(admin, "Students", `
      ${pageHead("Students", "Filter by status or export the full list.")}
      ${flashBanner(c)}
      <div class="toolbar">
        <form class="filters" method="get">
          <select name="status" onchange="this.form.submit()">
            <option value="">All statuses</option>
            ${statuses
              .map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${s.replaceAll("_", " ")}</option>`)
              .join("")}
          </select>
        </form>
        <a class="text-link" href="/admin/students.csv">Export CSV</a>
      </div>
      <div class="panel table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Course</th><th>Ref</th><th>Status</th><th>When</th></tr></thead>
        <tbody>
          ${pageRows
            .map((s) => {
              const course = catalog.courses.find((x) => x.slug === s.courseSlug);
              return `<tr>
                <td><a href="/admin/students/${s.id}">${esc(s.name)}</a><div class="sub">${esc(s.email)}</div></td>
                <td>${esc(course?.name || s.courseSlug)}</td>
                <td><code>${esc(s.referenceCode)}</code></td>
                <td>${statusBadge(s.status)}</td>
                <td>${esc(s.createdAt.slice(0, 10))}</td>
              </tr>`;
            })
            .join("") || `<tr><td colspan="5">No students match this filter.</td></tr>`}
        </tbody>
      </table>
      </div>
      ${deskPager("Students", "/admin/students", { status }, bounds.current, bounds.pages, bounds.from, bounds.start + pageRows.length, filtered.length)}
    `, "/admin/students"),
  );
});

adminRoutes.get("/students.csv", async (c) => {
  const rows = await db.select().from(students).orderBy(desc(students.createdAt));
  const header = "name,email,phone,country,state,city,course,reference,status,motivation,created\n";
  const body = rows
    .map((s) =>
      [s.name, s.email, s.phone, s.country, s.state, s.city, s.courseSlug, s.referenceCode, s.status, s.motivation, s.createdAt]
        .map(csv)
        .join(","),
    )
    .join("\n");
  return c.body(header + body, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": "attachment; filename=upscale-students.csv",
  });
});

adminRoutes.get("/accounts", async (c) => {
  const admin = c.get("admin");
  const catalog = await loadCatalog();
  const rows = await db.select().from(students).orderBy(desc(students.createdAt));
  const evidence = await db.select().from(paymentEvidence).orderBy(desc(paymentEvidence.submittedAt));
  const byStudent = new Map<string, (typeof evidence)[number][]>();
  for (const ev of evidence) {
    const list = byStudent.get(ev.studentId) || [];
    list.push(ev);
    byStudent.set(ev.studentId, list);
  }

  return c.html(
    desk(admin, "Accounts", `
      ${pageHead("Accounts", "All registrants and their payment attachments for the current intakes.")}
      <div class="panel table-wrap">
      <table>
        <thead>
          <tr>
            <th>Registrant</th>
            <th>Location</th>
            <th>Course</th>
            <th>Reference</th>
            <th>Status</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="6">No registrations yet.</td></tr>` : ""}
          ${rows
            .map((s) => {
              const course = catalog.courses.find((x) => x.slug === s.courseSlug);
              const cohort = catalog.cohorts.find((x) => x.id === s.cohortId);
              const files = byStudent.get(s.id) || [];
              const latest = files.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
              const amount = cohort ? formatFeeLabel(cohort.price, cohort.currency, cohort.priceNgn) : "—";
              const attachment = latest
                ? `<a href="/admin/evidence/${latest.id}/file" target="_blank" rel="noopener">${esc(latest.mime)} · ${Math.round(latest.size / 1024)} KB</a>`
                : `<span class="sub">No attachment</span>`;
              return `<tr>
                <td>
                  <a href="/admin/students/${s.id}">${esc(s.name)}</a>
                  <div class="sub">${esc(s.email)} · ${esc(s.phone)}</div>
                </td>
                <td>${esc(s.country || "—")}${s.state ? `, ${esc(s.state)}` : ""}${s.city ? `, ${esc(s.city)}` : ""}</td>
                <td>${esc(course?.name || s.courseSlug)}</td>
                <td><code>${esc(s.referenceCode)}</code></td>
                <td>${statusBadge(s.status)}</td>
                <td>
                  <div>${esc(amount)}</div>
                  <div>${attachment}</div>
                  ${latest ? `<div class="sub">${statusBadge(latest.status)} · ${esc(latest.submittedAt.slice(0, 10))}</div>` : ""}
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      </div>
    `, "/admin/accounts"),
  );
});

adminRoutes.get("/students/:id", async (c) => {
  const admin = c.get("admin");
  const id = c.req.param("id");
  const rows = await db.select().from(students).where(eq(students.id, id)).limit(1);
  const student = rows[0];
  if (!student) return c.text("Not found", 404);
  const files = await db.select().from(paymentEvidence).where(eq(paymentEvidence.studentId, id));
  const catalog = await loadCatalog();
  const course = catalog.courses.find((x) => x.slug === student.courseSlug);
  const canDelete = canDeleteStudents(roleOf(admin));
  const deleteBlock = canDelete
    ? `<section class="panel danger-zone" style="margin-top:1.5rem">
        <h2>Delete student</h2>
        <p class="note">Permanently removes this registrant, payment evidence rows, and uploaded receipts from the database and disk. If they were enrolled, one seat is released on their cohort. This cannot be undone.</p>
        <form method="post" action="/admin/students/${esc(student.id)}/delete" data-confirm="Delete ${esc(student.name)} permanently? This cannot be undone." onsubmit="return confirm(this.getAttribute('data-confirm'));">
          <button type="submit" class="danger">Delete student permanently</button>
        </form>
      </section>`
    : "";
  return c.html(
    desk(admin, student.name, `
      ${pageHead(esc(student.name), `${esc(student.email)} · ${esc(student.phone)} · ${esc(student.country || "—")}${student.state ? `, ${esc(student.state)}` : ""}${student.city ? `, ${esc(student.city)}` : ""}`)}
      <div class="panel">
      <dl class="facts">
        <div><dt>Course</dt><dd>${esc(course?.name || student.courseSlug)}</dd></div>
        <div><dt>Reference</dt><dd><code>${esc(student.referenceCode)}</code></dd></div>
        <div><dt>Status</dt><dd>${statusBadge(student.status)}</dd></div>
        <div><dt>Motivation</dt><dd>${esc(student.motivation)}</dd></div>
      </dl>
      </div>
      <h2>Payment evidence</h2>
      ${files
        .map(
          (f) => `<article class="file-row">
            <div>${esc(f.submittedAt)} · ${esc(f.mime)} · ${Math.round(f.size / 1024)} KB · ${statusBadge(f.status)}</div>
            <a href="/admin/evidence/${f.id}/file" target="_blank" rel="noopener">Open file</a>
            ${f.reviewNotes ? `<p>${esc(f.reviewNotes)}</p>` : ""}
          </article>`,
        )
        .join("") || "<p>No files yet.</p>"}
      ${deleteBlock}
    `, "/admin/students"),
  );
});

adminRoutes.post("/students/:id/delete", async (c) => {
  const admin = c.get("admin");
  if (!canDeleteStudents(roleOf(admin))) return forbid(c, admin, "Only admins can delete students.");
  const id = c.req.param("id");
  const student = (await db.select().from(students).where(eq(students.id, id)).limit(1))[0];
  if (!student) return c.text("Not found", 404);

  const evidence = await db.select().from(paymentEvidence).where(eq(paymentEvidence.studentId, id));
  await db.delete(paymentEvidence).where(eq(paymentEvidence.studentId, id));
  await db.delete(students).where(eq(students.id, id));

  if (student.status === "enrolled" && student.cohortId) {
    const cohort = (await db.select().from(cohorts).where(eq(cohorts.id, student.cohortId)).limit(1))[0];
    if (cohort && cohort.seatsTaken > 0) {
      await db.update(cohorts).set({ seatsTaken: cohort.seatsTaken - 1 }).where(eq(cohorts.id, cohort.id));
    }
  }

  await removeStudentUploadDir(id).catch(() => undefined);
  await audit(admin.email, "student_delete", "student", id, {
    name: student.name,
    email: student.email,
    status: student.status,
    evidenceCount: evidence.length,
  });
  return c.redirect("/admin/students?deleted=1");
});

adminRoutes.get("/evidence", async (c) => {
  const admin = c.get("admin");
  const catalog = await loadCatalog();
  const pending = await db.select().from(paymentEvidence).where(eq(paymentEvidence.status, "pending")).orderBy(desc(paymentEvidence.submittedAt));
  const studentRows = await db.select().from(students);
  const byId = Object.fromEntries(studentRows.map((s) => [s.id, s]));
  return c.html(
    desk(admin, "Evidence", `
      ${pageHead("Evidence inbox", "Match amount, name, and the UPSCALE reference before you take a seat.")}
      ${pending
        .map((f) => {
          const s = byId[f.studentId];
          const cohort = catalog.cohorts.find((x) => x.id === s?.cohortId);
          const expected = cohort
            ? formatFeeLabel(cohort.price, cohort.currency, cohort.priceNgn)
            : "—";
          const claimedCurrency =
            s && isNigeria(s.country) && cohort?.priceNgn && cohort.priceNgn > 0
              ? "NGN"
              : cohort?.currency || "USD";
          const claimed = formatMoney(f.amount, claimedCurrency);
          return `<article class="evidence-card">
            <header>
              <strong>${esc(s?.name || "Unknown")}</strong>
              <code>${esc(s?.referenceCode || "")}</code>
            </header>
            <p>${esc(s?.email || "")} · ${esc(s?.country || "")} · expected ${esc(expected)} · claimed ${esc(claimed)} · ${esc(f.method)}</p>
            <p><a href="/admin/evidence/${f.id}/file" target="_blank" rel="noopener">Open receipt</a></p>
            <form method="post" action="/admin/evidence/${f.id}/approve" class="inline">
              <button type="submit">Approve &amp; enrol</button>
            </form>
            <form method="post" action="/admin/evidence/${f.id}/reject" class="reject">
              <input name="reason" required placeholder="Reason sent to the student" />
              <button type="submit" class="danger">Reject</button>
            </form>
          </article>`;
        })
        .join("") || "<p class=\"panel\">Inbox is clear.</p>"}
    `, "/admin/evidence"),
  );
});

adminRoutes.get("/evidence/:id/file", async (c) => {
  const id = c.req.param("id");
  const rows = await db.select().from(paymentEvidence).where(eq(paymentEvidence.id, id)).limit(1);
  const file = rows[0];
  if (!file) return c.text("Not found", 404);
  const path = safeJoinUpload(file.fileKey);
  const buf = await readFile(path);
  return c.body(buf, 200, {
    "content-type": file.mime,
    "content-disposition": `inline; filename="${file.fileKey.split("/").pop()}"`,
  });
});

adminRoutes.post("/evidence/:id/approve", async (c) => {
  const admin = c.get("admin");
  if (!canReviewEvidence(roleOf(admin))) return forbid(c, admin, "You cannot review evidence.");
  const id = c.req.param("id");
  const ev = (await db.select().from(paymentEvidence).where(eq(paymentEvidence.id, id)).limit(1))[0];
  if (!ev) return c.text("Not found", 404);
  const student = (await db.select().from(students).where(eq(students.id, ev.studentId)).limit(1))[0];
  if (!student) return c.text("Not found", 404);
  const cohort = (await db.select().from(cohorts).where(eq(cohorts.id, student.cohortId)).limit(1))[0];
  const ts = nowIso();
  const nextStatus = cohort && cohort.seatsTaken >= cohort.seatCap ? "waitlist" : "enrolled";
  await db.update(paymentEvidence).set({ status: "approved", reviewerId: admin.id, reviewedAt: ts }).where(eq(paymentEvidence.id, id));
  await db.update(students).set({ status: nextStatus, updatedAt: ts }).where(eq(students.id, student.id));
  if (nextStatus === "enrolled" && cohort) {
    await db.update(cohorts).set({ seatsTaken: cohort.seatsTaken + 1 }).where(eq(cohorts.id, cohort.id));
  }
  await audit(admin.email, "evidence_approve", "student", student.id, { nextStatus });
  const catalog = await loadCatalog();
  const course = catalog.courses.find((x) => x.slug === student.courseSlug);
  const courseName = course?.name || student.courseSlug;
  const supportEmail = catalog.settings.email;
  if (nextStatus === "enrolled") {
    const mail = await buildEnrolledEmail({
      name: student.name,
      email: student.email,
      courseName,
      startDate: cohort?.startDate || "",
      endDate: cohort?.endDate || "",
      daysLabel: cohort?.daysLabel || "",
      timeLabel: cohort?.timeLabel || "",
      timezone: cohort?.timezone || "",
      referenceCode: student.referenceCode,
      supportEmail,
    });
    await sendMailSafe({
      to: student.email,
      replyTo: supportEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } else {
    const mail = await buildWaitlistEmail({
      name: student.name,
      email: student.email,
      courseName,
      referenceCode: student.referenceCode,
      supportEmail,
    });
    await sendMailSafe({
      to: student.email,
      replyTo: supportEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }
  return c.redirect("/admin/evidence");
});

adminRoutes.post("/evidence/:id/reject", async (c) => {
  const admin = c.get("admin");
  if (!canReviewEvidence(roleOf(admin))) return forbid(c, admin, "You cannot review evidence.");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const reason = sanitizePlain(body.reason, 500);
  if (!reason) return c.text("Reason required", 400);
  const ev = (await db.select().from(paymentEvidence).where(eq(paymentEvidence.id, id)).limit(1))[0];
  if (!ev) return c.text("Not found", 404);
  const student = (await db.select().from(students).where(eq(students.id, ev.studentId)).limit(1))[0];
  if (!student) return c.text("Not found", 404);
  const ts = nowIso();
  const token = newToken();
  await db
    .update(paymentEvidence)
    .set({ status: "rejected", reviewerId: admin.id, reviewedAt: ts, reviewNotes: reason })
    .where(eq(paymentEvidence.id, id));
  await db
    .update(students)
    .set({ status: "rejected", updatedAt: ts, tokenHash: sha256(token), tokenExpiresAt: paymentTokenExpiry() })
    .where(eq(students.id, student.id));
  await audit(admin.email, "evidence_reject", "student", student.id, { reason });

  const catalog = await loadCatalog();
  const course = catalog.courses.find((x) => x.slug === student.courseSlug);
  const site = process.env.WEB_ORIGIN || "http://localhost:4321";
  const supportEmail = catalog.settings.email;
  const mail = await buildRejectedEmail({
    name: student.name,
    email: student.email,
    courseName: course?.name || student.courseSlug,
    referenceCode: student.referenceCode,
    rejectReason: reason,
    paymentUrl: `${site}/payment?token=${token}`,
    supportEmail,
  });
  await sendMailSafe({
    to: student.email,
    replyTo: supportEmail,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return c.redirect("/admin/evidence");
});

adminRoutes.get("/courses", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage courses.");
  const catalog = await loadCatalog();
  return c.html(
    desk(admin, "Courses", `
      ${pageHead("Courses", "Edit course copy, pricing, and outline for the public site.")}
      <ul class="course-grid">
        ${catalog.courses.map((co) => `<li><a href="/admin/courses/${co.id}">${esc(co.name)}</a></li>`).join("")}
      </ul>
    `, "/admin/courses"),
  );
});

adminRoutes.get("/courses/:id", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage courses.");
  const row = (await db.select().from(courses).where(eq(courses.id, c.req.param("id"))).limit(1))[0];
  if (!row) return c.text("Not found", 404);
  const catalog = await loadCatalog();
  const openCohort = nextCohort(catalog, row.slug as CourseSlug);
  const outline = JSON.parse(row.outlineJson) as WeekBlock[];
  let faqs: CourseFaq[] = [];
  try {
    const parsed = JSON.parse(row.faqJson || "[]");
    faqs = Array.isArray(parsed)
      ? parsed
          .filter((f): f is CourseFaq => f && typeof f === "object" && typeof (f as CourseFaq).q === "string")
          .map((f) => ({ q: String(f.q || "").trim(), a: String(f.a || "").trim() }))
          .filter((f) => f.q || f.a)
      : [];
  } catch {
    faqs = [];
  }
  return c.html(
    desk(admin, row.name, `
      ${pageHead(esc(row.name), "Update what appears on the public course page.")}
      ${flashBanner(c)}
      <div class="panel">
      <form id="course-form" method="post" class="stack">
        <div class="form-grid">
          <label class="full">Name<input name="name" value="${esc(row.name)}" required maxlength="120" /></label>
          <label>Price<input name="price" type="number" min="0" value="${row.price}" required /></label>
          <label>Currency<input name="currency" value="${esc(row.currency)}" required /></label>
          <label>NGN equivalent<input name="priceNgn" type="number" min="0" step="1" value="${openCohort?.priceNgn ?? ""}" placeholder="Optional" /></label>
          <label>Seat cap<input name="seatCap" type="number" min="1" value="${row.seatCap}" required /></label>
          <label>Duration (weeks)<input name="durationWeeks" type="number" min="1" value="${row.durationWeeks}" required /></label>
          <label>Weekly hours<input name="weeklyHours" type="number" min="1" value="${row.weeklyHours}" required /></label>
          <label class="check"><input type="checkbox" name="registrationOpen" ${row.registrationOpen ? "checked" : ""} /> Registration open</label>
        </div>
        <p class="note">NGN equivalent is saved on the open cohort for this course and shown on registration (e.g. $450 · ₦675,000). You can also edit it under <a href="/admin/cohorts">Calendar</a>.</p>
        <p class="note">Name, short pitch, duration, and outline also drive the homepage “The tracks” cards.</p>
        <label class="full">Short pitch<textarea id="course-short-pitch" name="shortPitch" rows="4" required>${textareaValue(row.shortPitch)}</textarea></label>
        <label class="full">Outcomes (one per line)<textarea name="outcomes" rows="6">${esc(JSON.parse(row.outcomesJson).join("\n"))}</textarea></label>
        <label class="full">Tools (one per line)<textarea name="tools" rows="4">${esc(JSON.parse(row.toolsJson).join("\n"))}</textarea></label>
        <label class="full">Prerequisites<textarea id="course-prerequisites" name="prerequisites" rows="4">${textareaValue(row.prerequisites)}</textarea></label>
        <label class="full">OG description<textarea name="ogDescription" rows="3">${esc(row.ogDescription)}</textarea></label>
        ${faqEditorHtml(faqs)}
        ${outlineEditorHtml(outline)}
        ${formActions("Save course")}
      </form>
      </div>
      ${richEditorBoot(
        [
          { id: "course-short-pitch", height: 220 },
          { id: "course-prerequisites", height: 260 },
        ],
        ["course-form"],
      )}
      ${faqEditorBoot()}
      ${outlineEditorBoot()}
    `, "/admin/courses"),
  );
});

adminRoutes.post("/courses/:id", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage courses.");
  const id = c.req.param("id");
  const row = (await db.select().from(courses).where(eq(courses.id, id)).limit(1))[0];
  if (!row) return c.text("Not found", 404);
  const body = await c.req.parseBody();
  const outlineJson = String(body.outlineJson || row.outlineJson);
  let faqJson = row.faqJson;
  try {
    const parsed = JSON.parse(String(body.faqJson ?? row.faqJson ?? "[]"));
    if (!Array.isArray(parsed)) return c.text("Course FAQ must be a list of questions.", 400);
    const faqs: CourseFaq[] = parsed
      .filter((f): f is CourseFaq => f && typeof f === "object")
      .map((f) => ({
        q: sanitizePlain((f as CourseFaq).q, 240),
        a: sanitizeRich((f as CourseFaq).a, 800),
      }))
      .filter((f) => f.q && f.a);
    faqJson = JSON.stringify(faqs);
  } catch {
    return c.text("Course FAQ JSON is not valid", 400);
  }
  const price = boundedInt(body.price, 0, 100_000_000);
  const currency = sanitizePlain(body.currency || "USD", 3).toUpperCase();
  const seatCap = boundedInt(body.seatCap, 1, 500);
  const durationWeeks = boundedInt(body.durationWeeks, 1, 52);
  const weeklyHours = boundedInt(body.weeklyHours, 1, 40);
  const rawNgn = String(body.priceNgn ?? "").trim();
  const priceNgn = rawNgn === "" ? 0 : boundedInt(rawNgn, 0, 100_000_000);
  if (price == null || seatCap == null || durationWeeks == null || weeklyHours == null || priceNgn == null || !/^[A-Z]{3}$/.test(currency)) {
    return c.text("Check the price, currency, seats, and duration.", 400);
  }
  let outline: unknown;
  try {
    outline = JSON.parse(outlineJson);
  } catch {
    return c.text("Outline JSON is not valid", 400);
  }
  const safeOutline = Array.isArray(outline)
    ? outline.slice(0, 40).map((week) => {
        const row = (week && typeof week === "object" ? week : {}) as Record<string, unknown>;
        const topics = Array.isArray(row.topics) ? row.topics.map((topic) => sanitizePlain(topic, 160)).filter(Boolean).slice(0, 20) : [];
        return {
          week: boundedInt(row.week, 1, 52) ?? 1,
          title: sanitizePlain(row.title, 120),
          hours: boundedInt(row.hours, 0, 40) ?? 0,
          topics,
          project: row.project ? sanitizePlain(row.project, 240) : null,
        };
      })
    : [];
  await db
    .update(courses)
    .set({
      name: sanitizePlain(body.name || row.name, 120) || row.name,
      shortPitch: sanitizeRich(body.shortPitch, 4000),
      price,
      currency,
      seatCap,
      durationWeeks,
      weeklyHours,
      registrationOpen: body.registrationOpen ? 1 : 0,
      outcomesJson: JSON.stringify(String(body.outcomes || "").split("\n").map((x) => sanitizePlain(x, 200)).filter(Boolean).slice(0, 30)),
      toolsJson: JSON.stringify(String(body.tools || "").split("\n").map((x) => sanitizePlain(x, 80)).filter(Boolean).slice(0, 30)),
      prerequisites: sanitizeRich(body.prerequisites, 4000),
      ogDescription: sanitizePlain(body.ogDescription, 300),
      faqJson,
      outlineJson: JSON.stringify(safeOutline),
    })
    .where(eq(courses.id, id));

  // Keep intake pricing in sync so registration shows NGN immediately.
  await db
    .update(cohorts)
    .set({
      price,
      currency,
      priceNgn: Number.isFinite(priceNgn) ? priceNgn : 0,
    })
    .where(eq(cohorts.courseSlug, row.slug));

  await audit(admin.email, "course_update", "course", id);
  return c.redirect(await publishAndRedirect(`/admin/courses/${id}`));
});

adminRoutes.get("/instructors", async (c) => {
  const admin = c.get("admin");
  const catalog = await loadCatalog();
  const s = catalog.settings;
  const canEditPage = canManageSiteContent(roleOf(admin));
  const webOrigin = process.env.WEB_ORIGIN?.split(",")[0] || "https://upscalecohort.com";
  const pageCopyForm = canEditPage
    ? `<form method="post" action="/admin/instructors/page" class="stack cardish" style="margin-bottom:1.25rem">
        <h2>Instructors page copy</h2>
        <p class="note">Header on the public <a href="${esc(webOrigin)}/instructors" target="_blank" rel="noopener">/instructors</a> page (“The room.”).</p>
        <div class="form-grid">
          <label>Kicker<input name="facultyKicker" value="${esc(s.facultyKicker)}" required maxlength="40" /></label>
          <label>Headline<input name="facultyTitle" value="${esc(s.facultyTitle)}" required maxlength="80" /></label>
        </div>
        <label class="full">Supporting line<textarea name="facultyLede" rows="3" required maxlength="400">${esc(s.facultyLede)}</textarea></label>
        ${formActions("Save page copy")}
      </form>`
    : "";
  const instructorForms = catalog.instructors
    .map((i) => {
      const photo = i.photoUrl
        ? `<img class="avatar photo" src="/admin/instructors/${i.id}/photo" alt="${esc(i.name)}" />`
        : `<div class="avatar ${esc(i.accent)}">${esc(i.initials)}</div>`;
      return `<form id="instructor-form-${i.id}" method="post" action="/admin/instructors/${i.id}" class="stack cardish instructor-card" enctype="multipart/form-data">
            ${photo}
            <p class="slug">${esc(i.slug)}</p>
            <label>Name<input name="name" value="${esc(i.name)}" required minlength="2" maxlength="120" /></label>
            <label>Role<input name="role" value="${esc(i.role)}" maxlength="120" placeholder="Optional" /></label>
            <label>Bio<textarea id="instructor-bio-${i.id}" name="bio" rows="5" placeholder="Optional">${textareaValue(i.bio)}</textarea></label>
            <label>Photo
              <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" />
              <span class="note">JPG, PNG, or WebP. Max 5 MB. Leave empty to keep the current photo.</span>
            </label>
            ${i.photoUrl ? `<label class="check"><input type="checkbox" name="removePhoto" /> Remove photo</label>` : ""}
            <label>Accent
              <select name="accent">
                <option value="blue" ${i.accent === "blue" ? "selected" : ""}>Blue</option>
                <option value="red" ${i.accent === "red" ? "selected" : ""}>Red</option>
              </select>
            </label>
            <p class="note">Show on courses (optional)</p>
            ${catalog.courses.map((co) => `<label class="check"><input type="checkbox" name="courses" value="${esc(co.slug)}" ${i.courseSlugs.includes(co.slug) ? "checked" : ""} /> ${esc(co.name)}</label>`).join("")}
            ${formActions("Save instructor")}
          </form>`;
    })
    .join("");
  return c.html(
    desk(admin, "Instructors", `
      ${pageHead("Instructors", "Edit the public /instructors page header, then each person’s name, role, bio, and photo.")}
      ${flashBanner(c)}
      ${pageCopyForm}
      <h2>People</h2>
      <p class="note">Role, bio, and photo can be left empty. People teaching multiple tracks appear once on the public list.</p>
      <div class="instructor-grid">
      ${instructorForms}
      </div>
      ${richEditorBoot(
        catalog.instructors.map((i) => ({ id: `instructor-bio-${i.id}`, height: 240 })),
        catalog.instructors.map((i) => `instructor-form-${i.id}`),
      )}
    `, "/admin/instructors"),
  );
});

adminRoutes.post("/instructors/page", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can edit instructors page copy.");
  const body = await c.req.parseBody();
  const current = await loadCatalog();
  const next: LandingSettings = {
    ...current.settings,
    facultyKicker: sanitizePlain(body.facultyKicker, 40) || "Faculty",
    facultyTitle: sanitizePlain(body.facultyTitle, 80) || "The room.",
    facultyLede:
      sanitizePlain(body.facultyLede, 400) ||
      "Not a grid of stock portraits. A cast list — who teaches which track, and the proof they bring into the live session.",
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "faculty_page_update", "settings", "main");
  return c.redirect(await publishAndRedirect("/admin/instructors"));
});

adminRoutes.get("/instructors/:id/photo", async (c) => {
  const admin = c.get("admin");
  if (!admin) return c.text("Unauthorized", 401);
  const row = (await db.select().from(instructors).where(eq(instructors.id, c.req.param("id"))).limit(1))[0];
  if (!row?.photoKey) return c.text("Not found", 404);
  const buf = await readFile(safeJoinUpload(row.photoKey));
  return c.body(buf, 200, {
    "content-type": mimeFromUploadKey(row.photoKey),
    "cache-control": "private, max-age=60",
  });
});

adminRoutes.post("/instructors/:id", async (c) => {
  const admin = c.get("admin");
  if (!canEditInstructors(roleOf(admin))) return forbid(c, admin, "You cannot edit instructors.");
  const id = c.req.param("id");
  const row = (await db.select().from(instructors).where(eq(instructors.id, id)).limit(1))[0];
  if (!row) return c.text("Not found", 404);
  const body = await c.req.parseBody({ all: true });
  const name = sanitizePlain(body.name, 120);
  if (name.length < 2) return c.text("Instructor name must be at least 2 characters.", 400);
  let photoKey = row.photoKey || "";
  if (body.removePhoto) photoKey = "";
  const photo = body.photo;
  if (photo instanceof File && photo.size > 0) {
    try {
      const saved = await saveInstructorPhoto(photo, id);
      photoKey = saved.fileKey;
    } catch (err) {
      return c.text(err instanceof Error ? err.message : "Could not save photo.", 400);
    }
  }
  const rawCourses = body.courses;
  const selectedCourses = (Array.isArray(rawCourses) ? rawCourses : rawCourses ? [rawCourses] : [])
    .map((value) => sanitizePlain(value, 80))
    .filter((slug): slug is CourseSlug => (COURSE_SLUGS as readonly string[]).includes(slug));
  await db
    .update(instructors)
    .set({
      name,
      initials: initialsFromName(name),
      role: sanitizePlain(body.role, 120),
      bio: sanitizeRich(body.bio, 8000),
      accent: body.accent === "red" ? "red" : "blue",
      photoKey,
      courseSlugsJson: JSON.stringify(selectedCourses),
    })
    .where(eq(instructors.id, id));
  const courseRows = await db.select().from(courses);
  for (const course of courseRows) {
    const ids = JSON.parse(course.instructorIdsJson) as string[];
    const want = selectedCourses.includes(course.slug as CourseSlug);
    const has = ids.includes(id);
    if (want === has) continue;
    const next = want ? [...ids, id] : ids.filter((existing) => existing !== id);
    await db.update(courses).set({ instructorIdsJson: JSON.stringify(next) }).where(eq(courses.id, course.id));
  }
  await audit(admin.email, "instructor_update", "instructor", id, { name });
  return c.redirect(await publishAndRedirect("/admin/instructors"));
});

adminRoutes.get("/cohorts", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage the calendar.");
  const catalog = await loadCatalog();
  const s = catalog.settings;
  const openCount = catalog.courses.filter((course) => catalog.cohorts.some((co) => co.courseSlug === course.slug)).length;
  return c.html(
    desk(admin, "Calendar", `
      ${pageHead(
        "Calendar",
        "This desk section powers the public <strong>/schedule</strong> page (“When we meet”). Edit the page header here, then each track’s intake card below.",
      )}
      ${flashBanner(c)}
      <p class="note">Live page: <a href="${esc(process.env.WEB_ORIGIN?.split(",")[0] || "https://upscalecohort.com")}/schedule" target="_blank" rel="noopener">Open /schedule</a> · ${openCount} open track${openCount === 1 ? "" : "s"} · timezone from Landing (${esc(s.timezone)}).</p>

      <form method="post" action="/admin/cohorts/page" class="stack cardish" style="margin-bottom:1.25rem">
        <h2>Schedule page copy</h2>
        <p class="note">Header and legend on /schedule. Use <code>{timezone}</code> in the supporting line to insert the site timezone automatically.</p>
        <div class="form-grid">
          <label>Kicker<input name="scheduleKicker" value="${esc(s.scheduleKicker)}" required maxlength="40" /></label>
          <label>Headline<input name="scheduleTitle" value="${esc(s.scheduleTitle)}" required maxlength="80" /></label>
          <label>Sessions / week label<input name="scheduleSessionsLabel" value="${esc(s.scheduleSessionsLabel)}" required maxlength="12" placeholder="2×" /></label>
        </div>
        <label class="full">Supporting line<textarea name="scheduleLede" rows="3" required maxlength="320">${esc(s.scheduleLede)}</textarea></label>
        ${formActions("Save page copy")}
      </form>

      <h2>Intake cards</h2>
      <p class="note">Each card on /schedule: dates, class days, time, fee, and seat cap. Course title comes from <a href="/admin/courses">Courses</a>.</p>
      <div class="cohort-grid">
      ${catalog.cohorts
        .map((co) => {
          const course = catalog.courses.find((x) => x.slug === co.courseSlug);
          return `<form method="post" action="/admin/cohorts/${co.id}" class="stack cardish">
            <h2>${esc(course?.name || co.courseSlug)}</h2>
            <p class="course-name">${esc(co.courseSlug)}</p>
            <div class="form-grid">
              <label>Start<input type="date" name="startDate" value="${esc(co.startDate)}" required /></label>
              <label>End<input type="date" name="endDate" value="${esc(co.endDate)}" required /></label>
              <label>Days<input name="daysLabel" value="${esc(co.daysLabel)}" required placeholder="Mon &amp; Wed" /></label>
              <label>Time<input name="timeLabel" value="${esc(co.timeLabel)}" required placeholder="18:00–20:30" /></label>
              <label>Timezone<input name="timezone" value="${esc(co.timezone)}" required /></label>
              <label>Seat cap<input type="number" name="seatCap" value="${co.seatCap}" required /></label>
              <label>Price<input type="number" name="price" value="${co.price}" required /></label>
              <label>Currency<input name="currency" value="${esc(co.currency)}" required /></label>
              <label>NGN equivalent<input type="number" name="priceNgn" min="0" step="1" value="${co.priceNgn ?? ""}" placeholder="Optional" /></label>
            </div>
            <p class="note">NGN equivalent is shown next to the USD fee (e.g. $450 · ₦675,000). Leave blank to hide.</p>
            <p class="sub">Seats taken: ${co.seatsTaken} (updated when you enrol students — not edited here)</p>
            ${formActions("Save intake card")}
          </form>`;
        })
        .join("")}
      </div>
    `, "/admin/cohorts"),
  );
});

adminRoutes.post("/cohorts/page", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage the calendar.");
  const body = await c.req.parseBody();
  const current = await loadCatalog();
  const next: LandingSettings = {
    ...current.settings,
    scheduleKicker: sanitizePlain(body.scheduleKicker, 40) || "Calendar",
    scheduleTitle: sanitizePlain(body.scheduleTitle, 80) || "When we meet.",
    scheduleLede: sanitizePlain(body.scheduleLede, 400) || "Live online in {timezone}. Recordings same day. Studio work still due.",
    scheduleSessionsLabel: sanitizePlain(body.scheduleSessionsLabel, 20) || "2×",
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "schedule_page_update", "settings", "main");
  return c.redirect(await publishAndRedirect("/admin/cohorts"));
});

adminRoutes.post("/cohorts/:id", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage the calendar.");
  const body = await c.req.parseBody();
  const startDate = sanitizePlain(body.startDate, 10);
  const endDate = sanitizePlain(body.endDate, 10);
  const seatCap = boundedInt(body.seatCap, 1, 500);
  const price = boundedInt(body.price, 0, 100_000_000);
  const currency = sanitizePlain(body.currency, 3).toUpperCase();
  const rawNgn = String(body.priceNgn ?? "").trim();
  const priceNgn = rawNgn === "" ? 0 : boundedInt(rawNgn, 0, 100_000_000);
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate || seatCap == null || price == null || priceNgn == null || !/^[A-Z]{3}$/.test(currency)) {
    return c.text("Check the dates, price, currency, and seat count.", 400);
  }
  await db
    .update(cohorts)
    .set({
      startDate,
      endDate,
      daysLabel: sanitizePlain(body.daysLabel, 80),
      timeLabel: sanitizePlain(body.timeLabel, 80),
      timezone: sanitizePlain(body.timezone, 40),
      seatCap,
      price,
      currency,
      priceNgn,
    })
    .where(eq(cohorts.id, c.req.param("id")));
  await audit(admin.email, "cohort_update", "cohort", c.req.param("id"));
  return c.redirect(await publishAndRedirect("/admin/cohorts"));
});

adminRoutes.get("/landing", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can edit landing copy.");
  const catalog = await loadCatalog();
  const s = catalog.settings;
  const logoPreview = s.logoUrl || "/brand/upscale-logo.png";
  const heroBluePreview = s.heroMarkBlueUrl || "/brand/upscale-hero-mark-blue.png";
  const heroRedPreview = s.heroMarkRedUrl || "/brand/upscale-hero-mark-red.png";
  const waysCards = [0, 1, 2].map((i) => {
    const card = s.waysIn[i] || seedCatalog.settings.waysIn[i];
    const markOptions = WAYS_IN_MARKS.map(
      (m) => `<option value="${m}" ${card.mark === m ? "selected" : ""}>${m === "switch" ? "Switching path" : m === "newbie" ? "New to IT" : "Upscaling"}</option>`,
    ).join("");
    return `
      <fieldset class="ways-card">
        <legend>Card ${i + 1}</legend>
        <div class="form-grid">
          <label>Icon
            <select name="waysMark${i}" required>${markOptions}</select>
          </label>
          <label>Title<input name="waysTitle${i}" value="${esc(card.title)}" required maxlength="80" /></label>
        </div>
        <label class="full">Copy<textarea name="waysCopy${i}" rows="4" required maxlength="600">${esc(card.copy)}</textarea></label>
      </fieldset>`;
  }).join("");
  return c.html(
    desk(admin, "Landing", `
      ${pageHead("Landing copy", "Site-wide messaging, brand images, Ways in, bank details, FAQs, and proof stats.")}
      ${flashBanner(c)}
      <div class="panel">
      <form method="post" class="stack" enctype="multipart/form-data">
        <h2>Brand images</h2>
        <p class="note">Header logo and homepage hero marks. JPG, PNG, or WebP · max 5 MB. Leave a file empty to keep the current image. Reset restores the bundled default.</p>
        <div class="brand-upload-grid">
          <div class="cardish brand-upload">
            <p class="sub">Site logo (header + share image)</p>
            <img class="brand-preview brand-preview--logo" src="${esc(logoPreview)}" alt="Current site logo" />
            <label>Upload logo<input type="file" name="logo" accept="image/jpeg,image/png,image/webp" /></label>
            ${s.logoUrl ? `<label class="check"><input type="checkbox" name="removeLogo" /> Reset to default logo</label>` : ""}
          </div>
          <div class="cardish brand-upload">
            <p class="sub">Hero mark · blue</p>
            <img class="brand-preview" src="${esc(heroBluePreview)}" alt="Current blue hero mark" />
            <label>Upload blue mark<input type="file" name="heroBlue" accept="image/jpeg,image/png,image/webp" /></label>
            ${s.heroMarkBlueUrl ? `<label class="check"><input type="checkbox" name="removeHeroBlue" /> Reset blue mark</label>` : ""}
          </div>
          <div class="cardish brand-upload">
            <p class="sub">Hero mark · red</p>
            <img class="brand-preview" src="${esc(heroRedPreview)}" alt="Current red hero mark" />
            <label>Upload red mark<input type="file" name="heroRed" accept="image/jpeg,image/png,image/webp" /></label>
            ${s.heroMarkRedUrl ? `<label class="check"><input type="checkbox" name="removeHeroRed" /> Reset red mark</label>` : ""}
          </div>
        </div>

        <div class="form-grid">
          <label>Tagline<input name="tagline" value="${esc(s.tagline)}" required /></label>
          <label>Contact email<input name="email" value="${esc(s.email)}" required /></label>
          <label>WhatsApp<input name="whatsapp" value="${esc(s.whatsapp)}" /></label>
          <label>Timezone<input name="timezone" value="${esc(s.timezone)}" required /></label>
          <label class="check full"><input type="checkbox" name="registrationOpen" ${s.registrationOpen ? "checked" : ""} /> Site-wide registration open</label>
        </div>
        <label class="full">Hero line<textarea name="heroLine" rows="4" required>${esc(s.heroLine)}</textarea></label>
        <label class="full">Closed message<textarea name="closedMessage" rows="3">${esc(s.closedMessage)}</textarea></label>

        <h2>Ways in</h2>
        <p class="note">Homepage audience band — three cards under the black header.</p>
        <label>Section title<input name="waysInTitle" value="${esc(s.waysInTitle)}" required maxlength="60" /></label>
        ${waysCards}

        <h2>The tracks</h2>
        <p class="note">Section heading only. Track cards (pitch, duration, schedule, price, outline) come from
          <a href="/admin/courses">Courses</a> and <a href="/admin/cohorts">Calendar</a> (public /schedule page).</p>
        <label>Section title<input name="tracksTitle" value="${esc(s.tracksTitle)}" required maxlength="60" /></label>

        <h2>NGN bank details</h2>
        <p class="note">Shown to registrants whose country is Nigeria.</p>
        <div class="form-grid">
          <label>Bank name<input name="bankName" value="${esc(s.bank.bankName)}" required /></label>
          <label>Account name<input name="accountName" value="${esc(s.bank.accountName)}" required /></label>
          <label>Account number<input name="accountNumber" value="${esc(s.bank.accountNumber)}" required /></label>
        </div>
        <label class="full">Instructions<textarea name="instructions" rows="4">${esc(s.bank.instructions)}</textarea></label>

        <h2>USD bank details</h2>
        <p class="note">Shown to registrants whose country is not Nigeria. Leave blank to keep using NGN bank details until configured.</p>
        <div class="form-grid">
          <label>Bank name<input name="bankUsdName" value="${esc(s.bankUsd.bankName)}" /></label>
          <label>Account name<input name="bankUsdAccountName" value="${esc(s.bankUsd.accountName)}" /></label>
          <label>Account number<input name="bankUsdAccountNumber" value="${esc(s.bankUsd.accountNumber)}" /></label>
        </div>
        <label class="full">Instructions<textarea name="bankUsdInstructions" rows="4">${esc(s.bankUsd.instructions)}</textarea></label>
        <h2>FAQs (JSON)</h2>
        <label class="full"><textarea name="faqs" rows="14" required>${esc(JSON.stringify(s.faqs, null, 2))}</textarea></label>
        <h2>Proof stats (JSON)</h2>
        <label class="full"><textarea name="proof" rows="8" required>${esc(JSON.stringify(s.proof, null, 2))}</textarea></label>
        ${formActions("Save landing")}
      </form>
      </div>
    `, "/admin/landing"),
  );
});

adminRoutes.post("/landing", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can edit landing copy.");
  const body = await c.req.parseBody({ all: true });
  let faqs;
  let proof;
  try {
    faqs = JSON.parse(String(body.faqs));
    proof = JSON.parse(String(body.proof));
    if (!Array.isArray(faqs) || !Array.isArray(proof)) throw new Error("shape");
    faqs = faqs.slice(0, 40).map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { q: sanitizePlain(row.q, 240), a: sanitizePlain(row.a, 800) };
    }).filter((item) => item.q && item.a);
    proof = proof.slice(0, 8).map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { value: sanitizePlain(row.value, 40), label: sanitizePlain(row.label, 80) };
    }).filter((item) => item.value && item.label);
  } catch {
    return c.text("FAQ or proof JSON is invalid", 400);
  }
  const waysIn = [0, 1, 2].map((i) => {
    const markRaw = String(body[`waysMark${i}`] || "switch");
    const mark = (WAYS_IN_MARKS as readonly string[]).includes(markRaw)
      ? (markRaw as WaysInItem["mark"])
      : ("switch" as WaysInItem["mark"]);
    return {
      mark,
      title: sanitizePlain(body[`waysTitle${i}`], 80),
      copy: sanitizePlain(body[`waysCopy${i}`], 600),
    };
  });
  if (waysIn.some((w) => !w.title || !w.copy)) {
    return c.text("Each Ways in card needs a title and copy.", 400);
  }
  const current = await loadCatalog();
  let logoUrl = current.settings.logoUrl;
  let heroMarkBlueUrl = current.settings.heroMarkBlueUrl;
  let heroMarkRedUrl = current.settings.heroMarkRedUrl;
  if (body.removeLogo) logoUrl = null;
  if (body.removeHeroBlue) heroMarkBlueUrl = null;
  if (body.removeHeroRed) heroMarkRedUrl = null;
  try {
    const logo = body.logo;
    if (logo instanceof File && logo.size > 0) {
      logoUrl = (await saveBrandAsset(logo, "logo")).publicUrl;
    }
    const heroBlue = body.heroBlue;
    if (heroBlue instanceof File && heroBlue.size > 0) {
      heroMarkBlueUrl = (await saveBrandAsset(heroBlue, "hero-blue")).publicUrl;
    }
    const heroRed = body.heroRed;
    if (heroRed instanceof File && heroRed.size > 0) {
      heroMarkRedUrl = (await saveBrandAsset(heroRed, "hero-red")).publicUrl;
    }
  } catch (err) {
    return c.text(err instanceof Error ? err.message : "Could not save brand image.", 400);
  }
  const next: LandingSettings = {
    ...current.settings,
    tagline: sanitizePlain(body.tagline, 160),
    heroLine: sanitizePlain(body.heroLine, 500),
    email: sanitizePlain(body.email, 180).toLowerCase(),
    whatsapp: sanitizePlain(body.whatsapp, 40),
    timezone: sanitizePlain(body.timezone, 40),
    registrationOpen: Boolean(body.registrationOpen),
    closedMessage: sanitizePlain(body.closedMessage, 500),
    waysInTitle: sanitizePlain(body.waysInTitle, 60) || "Ways in",
    tracksTitle: sanitizePlain(body.tracksTitle, 60) || "The tracks",
    waysIn,
    logoUrl,
    heroMarkBlueUrl,
    heroMarkRedUrl,
    bank: {
      bankName: sanitizePlain(body.bankName, 120),
      accountName: sanitizePlain(body.accountName, 160),
      accountNumber: sanitizePlain(body.accountNumber, 40),
      instructions: sanitizePlain(body.instructions, 800),
    },
    bankUsd: {
      bankName: sanitizePlain(body.bankUsdName, 120),
      accountName: sanitizePlain(body.bankUsdAccountName, 160),
      accountNumber: sanitizePlain(body.bankUsdAccountNumber, 40),
      instructions: sanitizePlain(body.bankUsdInstructions, 800),
    },
    faqs,
    proof,
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "landing_update", "settings", "main");
  return c.redirect(await publishAndRedirect("/admin/landing"));
});

adminRoutes.get("/legal", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can edit legal pages.");
  const catalog = await loadCatalog();
  const s = catalog.settings;
  const webOrigin = process.env.WEB_ORIGIN?.split(",")[0] || "https://upscalecohort.com";
  return c.html(
    desk(
      admin,
      "Legal",
      `
      ${pageHead("Legal pages", "Edit the public Privacy and Terms pages. Saves rebuild the live site.")}
      ${flashBanner(c)}
      <div class="panel">
      <form id="legal-form" method="post" class="stack">
        <section class="stack cardish">
          <h2>Privacy policy</h2>
          <p class="note">Public page: <a href="${esc(webOrigin)}/privacy" target="_blank" rel="noopener">/privacy</a>. Use <code>{{email}}</code> in the body to insert the support address (${esc(s.email)}).</p>
          <div class="form-grid">
            <label>Kicker<input name="privacyKicker" value="${esc(s.privacyKicker)}" required maxlength="40" /></label>
            <label>Headline<input name="privacyTitle" value="${esc(s.privacyTitle)}" required maxlength="80" /></label>
            <label class="full">Meta description<input name="privacyDescription" value="${esc(s.privacyDescription)}" required maxlength="200" /></label>
          </div>
          <label class="full">Body<textarea id="privacy-body" name="privacyBody" rows="12">${textareaValue(s.privacyBody)}</textarea></label>
        </section>
        <section class="stack cardish">
          <h2>Terms and conditions</h2>
          <p class="note">Public page: <a href="${esc(webOrigin)}/terms" target="_blank" rel="noopener">/terms</a>.</p>
          <div class="form-grid">
            <label>Kicker<input name="termsKicker" value="${esc(s.termsKicker)}" required maxlength="40" /></label>
            <label>Headline<input name="termsTitle" value="${esc(s.termsTitle)}" required maxlength="80" /></label>
            <label class="full">Meta description<input name="termsDescription" value="${esc(s.termsDescription)}" required maxlength="200" /></label>
          </div>
          <label class="full">Body<textarea id="terms-body" name="termsBody" rows="12">${textareaValue(s.termsBody)}</textarea></label>
        </section>
        ${formActions("Save legal pages")}
      </form>
      </div>
      ${richEditorBoot(
        [
          { id: "privacy-body", height: 360 },
          { id: "terms-body", height: 360 },
        ],
        ["legal-form"],
      )}
    `,
      "/admin/legal",
    ),
  );
});

adminRoutes.post("/legal", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can edit legal pages.");
  const body = await c.req.parseBody();
  const current = await loadCatalog();
  const privacyBody = sanitizeRich(body.privacyBody, 50000);
  const termsBody = sanitizeRich(body.termsBody, 50000);
  if (!privacyBody || !termsBody) return c.text("Privacy and Terms bodies are required.", 400);
  const next: LandingSettings = {
    ...current.settings,
    privacyKicker: sanitizePlain(body.privacyKicker, 40) || current.settings.privacyKicker,
    privacyTitle: sanitizePlain(body.privacyTitle, 80) || current.settings.privacyTitle,
    privacyDescription: sanitizePlain(body.privacyDescription, 200) || current.settings.privacyDescription,
    privacyBody,
    termsKicker: sanitizePlain(body.termsKicker, 40) || current.settings.termsKicker,
    termsTitle: sanitizePlain(body.termsTitle, 80) || current.settings.termsTitle,
    termsDescription: sanitizePlain(body.termsDescription, 200) || current.settings.termsDescription,
    termsBody,
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "legal_update", "settings", "main");
  return c.redirect(await publishAndRedirect("/admin/legal"));
});

function providerOptions(selected: TrackingProvider) {
  return TRACKING_PROVIDERS.map(
    (provider) =>
      `<option value="${provider}" ${provider === selected ? "selected" : ""}>${esc(TRACKING_PROVIDER_LABEL[provider])}</option>`,
  ).join("");
}

function trackingFields(entry: TrackingPixel | null) {
  const provider = entry?.provider || "facebook";
  const name = entry?.name || "";
  const value = entry?.value || "";
  const enabled = entry ? entry.enabled : true;
  return `
    <div class="form-grid">
      <label>Name<input name="name" value="${esc(name)}" maxlength="80" placeholder="Main site pixel" /></label>
      <label>Provider
        <select name="provider" required>${providerOptions(provider)}</select>
      </label>
    </div>
    <label class="full">Pixel ID or snippet
      <textarea name="value" rows="5" required placeholder="Facebook: 123456789012345&#10;Analytics: G-XXXXXXXX&#10;Tag Manager: GTM-XXXX&#10;Custom: paste the vendor snippet">${esc(value)}</textarea>
    </label>
    <label class="check"><input type="checkbox" name="enabled" value="1" ${enabled ? "checked" : ""} /> Enabled on the public site</label>`;
}

function readTrackingForm(body: Record<string, unknown>, id: string): TrackingPixel {
  const providerRaw = String(body.provider || "");
  if (!isTrackingProvider(providerRaw)) throw new Error("Choose a provider.");
  const provider = providerRaw;
  const name = sanitizePlain(body.name, 80) || TRACKING_PROVIDER_LABEL[provider];
  return {
    id,
    name,
    provider,
    value: parseTrackingValue(provider, String(body.value || "")),
    enabled: body.enabled === "1" || body.enabled === "on",
  };
}

adminRoutes.get("/tracking", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage tracking.");
  const catalog = await loadCatalog();
  const pixels = catalog.settings.tracking;
  const error = c.req.query("error");
  const cards = pixels
    .map(
      (entry) => `
      <article class="cardish">
        <p class="sub">${esc(TRACKING_PROVIDER_LABEL[entry.provider])} · ${entry.enabled ? "On" : "Off"}</p>
        <form method="post" action="/admin/tracking/${esc(entry.id)}" class="stack">
          ${trackingFields(entry)}
          <div class="form-actions">
            <button type="submit">Save pixel</button>
          </div>
        </form>
        <form method="post" action="/admin/tracking/${esc(entry.id)}/delete" style="margin-top:0.75rem" data-confirm="Remove ${esc(entry.name)}? The public site will be rebuilt without it." onsubmit="return confirm(this.getAttribute('data-confirm'));">
          <button class="danger" type="submit">Remove</button>
        </form>
      </article>`,
    )
    .join("");
  return c.html(
    desk(
      admin,
      "Tracking",
      `
      ${pageHead("Tracking", "Add a Facebook Pixel, Google Analytics, Tag Manager, or another vendor snippet. Enabled entries load on every public page after you save.")}
      ${flashBanner(c)}
      ${error ? `<p class="banner bad">${esc(error)}</p>` : ""}
      <div class="panel">
        <h2>Add an entry</h2>
        <p class="note">Facebook Pixel ID is the number in Events Manager → Data sources. Saving rebuilds the public site. Mention an active pixel on the Privacy page. If Tag Manager already loads Analytics, do not add a separate Analytics entry.</p>
        <form method="post" action="/admin/tracking" class="stack">
          ${trackingFields(null)}
          ${formActions("Add pixel")}
        </form>
      </div>
      <div class="panel">
        <h2>Installed</h2>
        ${cards ? `<div class="stack">${cards}</div>` : `<p class="note">Nothing installed yet.</p>`}
      </div>
    `,
      "/admin/tracking",
    ),
  );
});

adminRoutes.post("/tracking", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage tracking.");
  const body = await c.req.parseBody();
  const current = await loadCatalog();
  if (current.settings.tracking.length >= 20) {
    return c.redirect("/admin/tracking?error=" + encodeURIComponent("You can store up to 20 tracking entries."));
  }
  let entry: TrackingPixel;
  try {
    entry = readTrackingForm(body as Record<string, unknown>, nid("trk"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save that pixel.";
    return c.redirect("/admin/tracking?error=" + encodeURIComponent(message));
  }
  const next: LandingSettings = {
    ...current.settings,
    tracking: [...current.settings.tracking, entry],
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "tracking_create", "tracking", entry.id, { provider: entry.provider, name: entry.name });
  return c.redirect(await publishAndRedirect("/admin/tracking"));
});

adminRoutes.post("/tracking/:id", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage tracking.");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const current = await loadCatalog();
  if (!current.settings.tracking.some((entry) => entry.id === id)) {
    return c.redirect("/admin/tracking?error=" + encodeURIComponent("That tracking entry is gone."));
  }
  let entry: TrackingPixel;
  try {
    entry = readTrackingForm(body as Record<string, unknown>, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save that pixel.";
    return c.redirect("/admin/tracking?error=" + encodeURIComponent(message));
  }
  const next: LandingSettings = {
    ...current.settings,
    tracking: current.settings.tracking.map((row) => (row.id === id ? entry : row)),
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "tracking_update", "tracking", id, { provider: entry.provider, enabled: entry.enabled });
  return c.redirect(await publishAndRedirect("/admin/tracking"));
});

adminRoutes.post("/tracking/:id/delete", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage tracking.");
  const id = c.req.param("id");
  const current = await loadCatalog();
  const next: LandingSettings = {
    ...current.settings,
    tracking: current.settings.tracking.filter((entry) => entry.id !== id),
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "tracking_delete", "tracking", id);
  return c.redirect(await publishAndRedirect("/admin/tracking"));
});

adminRoutes.post("/publish", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can publish the site.");
  const result = await publishSite();
  await audit(admin.email, "site_publish", "site", "public", { ok: result.ok });
  if (result.ok) return c.redirect("/admin?published=1");
  return c.redirect(`/admin?publishError=${encodeURIComponent(result.message)}`);
});

adminRoutes.get("/emails", async (c) => {
  const admin = c.get("admin");
  if (!canManageEmailTemplates(roleOf(admin))) return forbid(c, admin, "Only super admins can edit email templates.");
  return c.redirect("/admin/emails/registration");
});

adminRoutes.get("/emails/registration", async (c) => {
  const admin = c.get("admin");
  if (!canManageEmailTemplates(roleOf(admin))) return forbid(c, admin, "Only super admins can edit email templates.");
  const templates = await loadEmailTemplates();
  const mailNote = describeMailTransport();
  const testOk = c.req.query("test") || "";
  const testErr = c.req.query("testerr") || "";
  return c.html(
    desk(
      admin,
      "Emails",
      `
      ${pageHead(
        "Registration email",
        "Sent when someone reserves a seat. All student emails use the UPSCALE blue/red brand bar. Do not put bank details or an upload button here — payment is on the registration page.",
      )}
      <p class="note"><strong>Outbound mail:</strong> ${esc(mailNote)}</p>
      <p class="note">Lifecycle: <strong>registration</strong> → <strong>evidence received</strong> (after upload) → <strong>enrolled</strong> (Approve &amp; enrol) or <strong>waitlist</strong> / <strong>rejected</strong>. Restarting the API refreshes unbranded or outdated stored templates.</p>
      ${testOk ? `<p class="banner ok">${esc(testOk)}</p>` : ""}
      ${testErr ? `<p class="err">${esc(testErr)}</p>` : ""}
      <form method="post" action="/admin/emails/test" class="stack cardish" style="margin-bottom:1rem;max-width:28rem">
        <label>Send test email to
          <input type="email" name="to" value="${esc(admin.email)}" required maxlength="180" />
        </label>
        <button type="submit">Send test email</button>
      </form>
      ${registrationEmailEditorPage(templates.registration)}
    `,
      "/admin/emails",
    ),
  );
});

adminRoutes.post("/emails/test", async (c) => {
  const admin = c.get("admin");
  if (!canManageEmailTemplates(roleOf(admin))) return forbid(c, admin, "Only super admins can send test email.");
  const body = await c.req.parseBody();
  const to = sanitizePlain(body.to || admin.email, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return c.redirect(`/admin/emails/registration?testerr=${encodeURIComponent("Enter a valid email address.")}`);
  }
  try {
    const result = await sendMail({
      to,
      subject: "UPSCALE test email",
      text: `This is a test from the UPSCALE desk.\n\nTransport: ${describeMailTransport()}\nSent at: ${new Date().toISOString()}\n`,
      html: `<p>This is a test from the UPSCALE desk.</p><p><strong>Transport:</strong> ${esc(describeMailTransport())}</p><p>Sent at ${esc(new Date().toISOString())}</p>`,
    });
    const msg =
      result.mode === "log"
        ? `Logged only (SMTP not configured) → check apps/api/data/mail.log. Add SMTP_* to .env for real delivery.`
        : `Test email sent to ${to}.`;
    await audit(admin.email, "email_test", "email", to, { mode: result.mode });
    return c.redirect(`/admin/emails/registration?test=${encodeURIComponent(msg)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.redirect(`/admin/emails/registration?testerr=${encodeURIComponent(`SMTP failed: ${message}`)}`);
  }
});

adminRoutes.get("/emails/registration/preview", async (c) => {
  const admin = c.get("admin");
  if (!canManageEmailTemplates(roleOf(admin))) return forbid(c, admin, "Only super admins can preview email templates.");
  const templates = await loadEmailTemplates();
  const rendered = renderEmail(templates.registration, sampleRegistrationVars());
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Preview · ${esc(rendered.subject)}</title>
  <link rel="stylesheet" href="/admin/css" />
</head>
<body style="margin:0;background:var(--paper,#f5f0e8);">
  <div class="pad" style="max-width:720px;margin:0 auto;">
    <p class="email-preview-meta"><strong>Subject:</strong> ${esc(rendered.subject)}</p>
    <div class="email-preview-wrap">${rendered.html}</div>
  </div>
</body>
</html>`);
});

adminRoutes.post("/emails/registration", async (c) => {
  const admin = c.get("admin");
  if (!canManageEmailTemplates(roleOf(admin))) return forbid(c, admin, "Only super admins can edit email templates.");
  const body = await c.req.parseBody();
  const subject = sanitizePlain(body.subject, 180);
  const html = sanitizeRich(body.html, 50000);
  const text = sanitizePlain(body.text, 20000);
  if (!subject || !html) return c.text("Subject and HTML body are required.", 400);
  await saveEmailTemplate("registration", { subject, html, text });
  await audit(admin.email, "email_template_update", "email_template", "registration");
  return c.redirect("/admin/emails/registration");
});

adminRoutes.get("/team", async (c) => {
  const admin = c.get("admin");
  if (!canManageTeam(roleOf(admin))) return forbid(c, admin, "Only super admins can manage desk users.");
  const users = await db.select().from(adminUsers).orderBy(desc(adminUsers.createdAt));
  const error = c.req.query("error") || "";
  const ok = c.req.query("ok") || "";
  return c.html(
    desk(
      admin,
      "Team",
      `
      ${pageHead("Team", "Create admin and editor accounts for the UPSCALE desk.")}
      ${error ? `<p class="err">${esc(error)}</p>` : ""}
      ${ok ? `<p class="banner ok">${esc(ok)}</p>` : ""}
      <div class="split">
        <section class="panel">
          <h2>Create desk user</h2>
          <form method="post" action="/admin/team" class="stack">
            <label>Name<input name="name" required minlength="2" maxlength="120" autocomplete="name" /></label>
            <label>Email<input type="email" name="email" required maxlength="180" autocomplete="off" /></label>
            <label>Password<input type="password" name="password" required minlength="8" autocomplete="new-password" /></label>
            <label>Role
              <select name="role" required>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="super_admin">Super admin</option>
              </select>
            </label>
            <button type="submit">Create user</button>
          </form>
        </section>
        <section class="panel table-wrap">
          <h2>Desk users</h2>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th></tr></thead>
            <tbody>
              ${users
                .map(
                  (u) => `<tr>
                    <td>${esc(u.name)}${u.id === admin.id ? ` <span class="sub">(you)</span>` : ""}</td>
                    <td>${esc(u.email)}</td>
                    <td>${statusBadge(roleOf(u))}</td>
                    <td>${esc(u.createdAt.slice(0, 10))}</td>
                  </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </section>
      </div>
      <section class="panel" style="margin-top:1rem">
        <h2>Set a new password</h2>
        <p class="note">Saving a new password signs that person out of every browser.</p>
        <form method="post" action="/admin/team/password" class="stack">
          <label>Email<input type="email" name="email" required maxlength="180" autocomplete="off" /></label>
          <label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password" /></label>
          <button type="submit">Update password</button>
        </form>
      </section>
      <p class="sub" style="margin-top:1rem">
        <strong>Super admin</strong> — full access, including team management.<br />
        <strong>Admin</strong> — manage courses, cohorts, landing, legal pages, evidence, instructors, and delete students.<br />
        <strong>Editor</strong> — review evidence and edit instructors only.
      </p>
    `,
      "/admin/team",
    ),
  );
});

adminRoutes.post("/team", async (c) => {
  const admin = c.get("admin");
  if (!canManageTeam(roleOf(admin))) return forbid(c, admin, "Only super admins can manage desk users.");
  const body = await c.req.parseBody();
  const name = sanitizePlain(body.name, 120);
  const email = sanitizePlain(body.email, 180).toLowerCase();
  const password = String(body.password || "");
  const roleRaw = String(body.role || "editor");
  const role: AdminRole =
    roleRaw === "super_admin" || roleRaw === "admin" || roleRaw === "editor" ? roleRaw : "editor";

  if (name.length < 2) return c.redirect("/admin/team?error=Enter+a+valid+name.");
  if (!email.includes("@")) return c.redirect("/admin/team?error=Enter+a+valid+email.");
  if (password.length < 8) return c.redirect("/admin/team?error=Password+must+be+at+least+8+characters.");

  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  if (existing.length > 0) return c.redirect("/admin/team?error=That+email+is+already+in+use.");

  const id = nid("adm");
  await db.insert(adminUsers).values({
    id,
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    createdAt: nowIso(),
  });
  await audit(admin.email, "team_create", "admin", id, { email, role });
  return c.redirect(`/admin/team?ok=${encodeURIComponent(`${roleLabel(role)} ${name} created.`)}`);
});

adminRoutes.post("/team/password", async (c) => {
  const admin = c.get("admin");
  if (!canManageTeam(roleOf(admin))) return forbid(c, admin, "Only super admins can manage desk users.");
  const ip = clientIp(c);
  if (ipBlocked("password", ip) || !noteIpFailure("password", ip)) {
    return c.redirect("/admin/team?error=Too+many+password+changes.+Try+again+later.");
  }
  const body = await c.req.parseBody();
  const email = sanitizePlain(body.email, 180).toLowerCase();
  const password = String(body.password || "");
  if (password.length < 8) return c.redirect("/admin/team?error=Password+must+be+at+least+8+characters.");
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  const user = rows[0];
  if (!user) return c.redirect("/admin/team?error=No+desk+user+uses+that+email.");
  await db.update(adminUsers).set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: "" }).where(eq(adminUsers.id, user.id));
  await destroyAllSessions(user.id);
  await audit(admin.email, "password_reset", "admin", user.id);
  if (user.id === admin.id) {
    await destroySession(c);
    return c.redirect("/admin/login");
  }
  return c.redirect(`/admin/team?ok=${encodeURIComponent(`Password updated. ${user.name} was signed out everywhere.`)}`);
});

adminRoutes.get("/account", async (c) => {
  const admin = c.get("admin");
  const error = c.req.query("error") || "";
  return c.html(
    desk(
      admin,
      "Account",
      `
      ${pageHead("Account", "A new password signs you out of every device. Sign in again on this one.")}
      ${error ? `<p class="err">${esc(error)}</p>` : ""}
      <div class="panel">
        <form method="post" action="/admin/account/password" class="stack">
          <label>Current password<input type="password" name="current" required autocomplete="current-password" /></label>
          <label>New password<input type="password" name="password" required minlength="8" autocomplete="new-password" /></label>
          <button type="submit">Change password</button>
        </form>
      </div>
    `,
      "/admin/account",
    ),
  );
});

adminRoutes.post("/account/password", async (c) => {
  const admin = c.get("admin");
  const ip = clientIp(c);
  if (ipBlocked("password", ip)) {
    return c.redirect("/admin/account?error=Too+many+attempts.+Try+again+later.");
  }
  const body = await c.req.parseBody();
  const current = String(body.current || "");
  const password = String(body.password || "");
  if (password.length < 8) return c.redirect("/admin/account?error=Password+must+be+at+least+8+characters.");
  const ok = await verifyPassword(current, admin.passwordHash);
  if (!ok) {
    noteIpFailure("password", ip);
    await recordPasswordFailure(admin.email);
    if (await accountLocked(admin.email)) {
      await destroyAllSessions(admin.id);
      await destroySession(c);
      return c.redirect("/admin/login");
    }
    return c.redirect("/admin/account?error=Current+password+is+not+right.");
  }
  await db.update(adminUsers).set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: "" }).where(eq(adminUsers.id, admin.id));
  await destroyAllSessions(admin.id);
  await destroySession(c);
  await audit(admin.email, "password_change", "admin", admin.id);
  return c.redirect("/admin/login");
});

const LIST_PAGE_SIZE = 20;

adminRoutes.get("/audit", async (c) => {
  const admin = c.get("admin");
  if (!canViewAudit(roleOf(admin))) return forbid(c, admin, "Only admins can view the audit log.");
  const requested = requestedPage(c.req.query("page"));
  const [{ total: totalRaw }] = await db.select({ total: count() }).from(auditLogs);
  const total = Number(totalRaw) || 0;
  const bounds = pageBounds(total, requested);
  if (requested !== bounds.current) return c.redirect(listHref("/admin/audit", bounds.current, {}));
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(LIST_PAGE_SIZE)
    .offset(bounds.start);
  const to = bounds.start + rows.length;
  return c.html(
    desk(admin, "Audit", `
      ${pageHead("Audit", "Admin actions across the desk.")}
      <div class="panel table-wrap">
      <table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th></tr></thead>
        <tbody>
          ${
            rows
              .map(
                (r) => `<tr>
                <td>${esc(r.createdAt.replace("T", " ").slice(0, 19))}</td>
                <td>${esc(r.actor)}</td>
                <td>${esc(r.action)}</td>
                <td>${esc(r.entity)} ${esc(r.entityId)}</td>
              </tr>`,
              )
              .join("") || `<tr><td colspan="4">No audit entries yet.</td></tr>`
          }
        </tbody>
      </table>
      </div>
      ${deskPager("Audit", "/admin/audit", {}, bounds.current, bounds.pages, bounds.from, to, total)}
    `, "/admin/audit"),
  );
});

function requestedPage(raw: string | undefined) {
  const n = Number(raw || "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function pageBounds(total: number, requested: number) {
  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const current = Math.min(pages, requested);
  const start = total === 0 ? 0 : (current - 1) * LIST_PAGE_SIZE;
  return { pages, current, start, from: total === 0 ? 0 : start + 1 };
}

function listHref(path: string, page: number, extra: Record<string, string>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value) q.set(key, value);
  }
  if (page > 1) q.set("page", String(page));
  const search = q.toString();
  return search ? `${path}?${search}` : path;
}

function deskPager(
  label: string,
  path: string,
  extra: Record<string, string>,
  current: number,
  pages: number,
  from: number,
  to: number,
  total: number,
) {
  const window = pageWindow(current, pages);
  const prev =
    current > 1
      ? `<a href="${listHref(path, current - 1, extra)}">Previous</a>`
      : `<span class="is-disabled">Previous</span>`;
  const next =
    current < pages
      ? `<a href="${listHref(path, current + 1, extra)}">Next</a>`
      : `<span class="is-disabled">Next</span>`;
  const nums = window
    .map((item) => {
      if (item === "…") return `<span class="gap">…</span>`;
      if (item === current) return `<span class="is-current" aria-current="page">${item}</span>`;
      return `<a href="${listHref(path, item, extra)}">${item}</a>`;
    })
    .join("");
  return `<nav class="pager" aria-label="${esc(label)} pages">
    <p class="pager-meta">${total === 0 ? "No entries" : `${from}–${to} of ${total}`}</p>
    <div class="pager-pages">${prev}${nums}${next}</div>
  </nav>`;
}

function pageWindow(current: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("…");
    out.push(n);
  }
  return out;
}

function pipe(label: string, n: number | undefined) {
  return `<li><span class="num">${n ?? 0}</span><span class="label">${esc(label)}</span></li>`;
}

function statusBadge(status: string) {
  const safe = status.replace(/[^a-z_]/gi, "");
  const label = status.replaceAll("_", " ");
  return `<span class="badge ${esc(safe)}">${esc(label)}</span>`;
}

function initialsFromName(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

function countBy(values: string[]) {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] || 0) + 1;
  return out;
}

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
