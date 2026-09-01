import { readFile } from "node:fs/promises";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { LandingSettings } from "@upscale/shared";
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
import { createSession, currentAdmin, destroySession, requireAdmin } from "../lib/auth.ts";
import { audit, loadCatalog } from "../lib/catalog.ts";
import { nowIso } from "../lib/ids.ts";
import { sendMail } from "../lib/mail.ts";
import { verifyPassword } from "../lib/password.ts";
import { safeJoinUpload } from "../lib/storage.ts";
import { adminCss } from "../admin/styles.ts";
import { registrationEmailEditorPage } from "../admin/emails-page.ts";
import { layout, loginPage, pageHead, roleLabel } from "../admin/html.ts";
import { richEditorBoot, textareaValue } from "../admin/rich-editor.ts";
import {
  canEditInstructors,
  canManageEmailTemplates,
  canManageSiteContent,
  canManageTeam,
  canReviewEvidence,
  canViewAudit,
  normalizeAdminRole,
  type AdminRole,
} from "../lib/roles.ts";
import { hashPassword } from "../lib/password.ts";
import { loadEmailTemplates, renderEmail, saveEmailTemplate } from "../lib/email-templates.ts";
import { sampleRegistrationVars } from "@upscale/shared/email-templates";
import { publishSite } from "../lib/publish-site.ts";

export const adminRoutes = new Hono();

adminRoutes.get("/css", (c) => c.body(adminCss, 200, { "content-type": "text/css; charset=utf-8" }));

adminRoutes.get("/login", async (c) => {
  if (await currentAdmin(c)) return c.redirect("/admin");
  return c.html(loginPage());
});

adminRoutes.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");
  const rows = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.html(loginPage("Those credentials are not right."));
  }
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
  const ok = c.req.query("ok");
  if (publishError) {
    return `<p class="banner bad">${esc(publishError)}</p>`;
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
          <h2>Open cohorts</h2>
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
                    <td>${co.currency} ${co.price}</td>
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
  const status = c.req.query("status") || "";
  const rows = await db.select().from(students).orderBy(desc(students.createdAt));
  const filtered = status ? rows.filter((s) => s.status === status) : rows;
  const catalog = await loadCatalog();
  return c.html(
    desk(admin, "Students", `
      ${pageHead("Students", "Filter by status or export the full list.")}
      <div class="toolbar">
        <form class="filters" method="get">
          <select name="status" onchange="this.form.submit()">
            <option value="">All statuses</option>
            ${["registered", "evidence_submitted", "verified", "rejected", "enrolled", "waitlist"]
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
          ${filtered
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
              const amount = cohort ? `${cohort.currency} ${cohort.price}` : "—";
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
    `, "/admin/students"),
  );
});

adminRoutes.get("/evidence", async (c) => {
  const admin = c.get("admin");
  const pending = await db.select().from(paymentEvidence).where(eq(paymentEvidence.status, "pending")).orderBy(desc(paymentEvidence.submittedAt));
  const studentRows = await db.select().from(students);
  const byId = Object.fromEntries(studentRows.map((s) => [s.id, s]));
  return c.html(
    desk(admin, "Evidence", `
      ${pageHead("Evidence inbox", "Match amount, name, and the UPSCALE reference before you take a seat.")}
      ${pending
        .map((f) => {
          const s = byId[f.studentId];
          return `<article class="evidence-card">
            <header>
              <strong>${esc(s?.name || "Unknown")}</strong>
              <code>${esc(s?.referenceCode || "")}</code>
            </header>
            <p>${esc(s?.email || "")} · claimed ${f.amount} · ${esc(f.method)}</p>
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
  await sendMail({
    to: student.email,
    subject: nextStatus === "enrolled" ? `Enrolled · ${student.referenceCode}` : `Waitlist · ${student.referenceCode}`,
    text:
      nextStatus === "enrolled"
        ? `Hello ${student.name},\n\nYour payment is verified. You are enrolled in ${course?.name}. Join instructions and calendar notes will follow from ${catalog.settings.email}.\n\nUPSCALE — learn today, build tomorrow`
        : `Hello ${student.name},\n\nYour payment is verified but this cohort is at cap. You are on the waitlist. We will write if a seat opens.\n\nUPSCALE`,
  });
  return c.redirect("/admin/evidence");
});

adminRoutes.post("/evidence/:id/reject", async (c) => {
  const admin = c.get("admin");
  if (!canReviewEvidence(roleOf(admin))) return forbid(c, admin, "You cannot review evidence.");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const reason = String(body.reason || "").trim();
  if (!reason) return c.text("Reason required", 400);
  const ev = (await db.select().from(paymentEvidence).where(eq(paymentEvidence.id, id)).limit(1))[0];
  if (!ev) return c.text("Not found", 404);
  const student = (await db.select().from(students).where(eq(students.id, ev.studentId)).limit(1))[0];
  const ts = nowIso();
  await db
    .update(paymentEvidence)
    .set({ status: "rejected", reviewerId: admin.id, reviewedAt: ts, reviewNotes: reason })
    .where(eq(paymentEvidence.id, id));
  await db.update(students).set({ status: "rejected", updatedAt: ts }).where(eq(students.id, student.id));
  await audit(admin.email, "evidence_reject", "student", student.id, { reason });
  await sendMail({
    to: student.email,
    subject: `Receipt not accepted · ${student.referenceCode}`,
    text: `Hello ${student.name},\n\nWe could not verify that receipt.\n\n${reason}\n\nUpload a clearer file on your payment page.\n\nUPSCALE`,
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
  return c.html(
    desk(admin, row.name, `
      ${pageHead(esc(row.name), "Update what appears on the public course page.")}
      ${flashBanner(c)}
      <div class="panel">
      <form id="course-form" method="post" class="stack">
        <div class="form-grid">
          <label>Price<input name="price" type="number" min="0" value="${row.price}" required /></label>
          <label>Currency<input name="currency" value="${esc(row.currency)}" required /></label>
          <label>Seat cap<input name="seatCap" type="number" min="1" value="${row.seatCap}" required /></label>
          <label>Duration (weeks)<input name="durationWeeks" type="number" min="1" value="${row.durationWeeks}" required /></label>
          <label>Weekly hours<input name="weeklyHours" type="number" min="1" value="${row.weeklyHours}" required /></label>
          <label class="check"><input type="checkbox" name="registrationOpen" ${row.registrationOpen ? "checked" : ""} /> Registration open</label>
        </div>
        <label class="full">Short pitch<textarea id="course-short-pitch" name="shortPitch" rows="4" required>${textareaValue(row.shortPitch)}</textarea></label>
        <label class="full">Outcomes (one per line)<textarea name="outcomes" rows="6">${esc(JSON.parse(row.outcomesJson).join("\n"))}</textarea></label>
        <label class="full">Tools (one per line)<textarea name="tools" rows="4">${esc(JSON.parse(row.toolsJson).join("\n"))}</textarea></label>
        <label class="full">Prerequisites<textarea id="course-prerequisites" name="prerequisites" rows="4">${textareaValue(row.prerequisites)}</textarea></label>
        <label class="full">OG description<textarea name="ogDescription" rows="3">${esc(row.ogDescription)}</textarea></label>
        <label class="full">Outline JSON<textarea name="outlineJson" rows="12" required>${esc(JSON.stringify(JSON.parse(row.outlineJson), null, 2))}</textarea></label>
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
  let outlineJson = String(body.outlineJson || row.outlineJson);
  try {
    JSON.parse(outlineJson);
  } catch {
    return c.text("Outline JSON is not valid", 400);
  }
  await db
    .update(courses)
    .set({
      shortPitch: String(body.shortPitch || ""),
      price: Number(body.price),
      currency: String(body.currency || "USD"),
      seatCap: Number(body.seatCap),
      durationWeeks: Number(body.durationWeeks),
      weeklyHours: Number(body.weeklyHours),
      registrationOpen: body.registrationOpen ? 1 : 0,
      outcomesJson: JSON.stringify(String(body.outcomes || "").split("\n").map((x) => x.trim()).filter(Boolean)),
      toolsJson: JSON.stringify(String(body.tools || "").split("\n").map((x) => x.trim()).filter(Boolean)),
      prerequisites: String(body.prerequisites || ""),
      ogDescription: String(body.ogDescription || ""),
      outlineJson,
    })
    .where(eq(courses.id, id));
  await audit(admin.email, "course_update", "course", id);
  return c.redirect(await publishAndRedirect(`/admin/courses/${id}`));
});

adminRoutes.get("/instructors", async (c) => {
  const admin = c.get("admin");
  const catalog = await loadCatalog();
  const instructorForms = catalog.instructors
    .map(
      (i) => `<form id="instructor-form-${i.id}" method="post" action="/admin/instructors/${i.id}" class="stack cardish instructor-card">
            <div class="avatar ${esc(i.accent)}">${esc(i.initials)}</div>
            <p class="slug">${esc(i.slug)}</p>
            <label>Name<input name="name" value="${esc(i.name)}" required minlength="2" maxlength="120" /></label>
            <label>Role<input name="role" value="${esc(i.role)}" required /></label>
            <label>Bio<textarea id="instructor-bio-${i.id}" name="bio" rows="5" required>${textareaValue(i.bio)}</textarea></label>
            <label>Accent
              <select name="accent">
                <option value="blue" ${i.accent === "blue" ? "selected" : ""}>Blue</option>
                <option value="red" ${i.accent === "red" ? "selected" : ""}>Red</option>
              </select>
            </label>
            ${formActions("Save instructor")}
          </form>`,
    )
    .join("");
  return c.html(
    desk(admin, "Instructors", `
      ${pageHead("Instructors", "Update instructor names, roles, and bios shown on the public site.")}
      ${flashBanner(c)}
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

adminRoutes.post("/instructors/:id", async (c) => {
  const admin = c.get("admin");
  if (!canEditInstructors(roleOf(admin))) return forbid(c, admin, "You cannot edit instructors.");
  const body = await c.req.parseBody();
  const name = String(body.name || "").trim();
  if (name.length < 2) return c.text("Instructor name must be at least 2 characters.", 400);
  await db
    .update(instructors)
    .set({
      name,
      initials: initialsFromName(name),
      role: String(body.role || ""),
      bio: String(body.bio || ""),
      accent: String(body.accent || "blue"),
    })
    .where(eq(instructors.id, c.req.param("id")));
  await audit(admin.email, "instructor_update", "instructor", c.req.param("id"), { name });
  return c.redirect(await publishAndRedirect("/admin/instructors"));
});

adminRoutes.get("/cohorts", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage cohorts.");
  const catalog = await loadCatalog();
  return c.html(
    desk(admin, "Cohorts", `
      ${pageHead("Cohorts", "Edit dates, capacity, and pricing for each open intake.")}
      ${flashBanner(c)}
      <div class="cohort-grid">
      ${catalog.cohorts
        .map((co) => {
          const course = catalog.courses.find((x) => x.slug === co.courseSlug);
          return `<form method="post" action="/admin/cohorts/${co.id}" class="stack cardish">
            <h2>${esc(co.courseSlug.replaceAll("-", " "))}</h2>
            <p class="course-name">${esc(course?.name || co.courseSlug)}</p>
            <div class="form-grid">
              <label>Start<input type="date" name="startDate" value="${esc(co.startDate)}" required /></label>
              <label>End<input type="date" name="endDate" value="${esc(co.endDate)}" required /></label>
              <label>Days<input name="daysLabel" value="${esc(co.daysLabel)}" required /></label>
              <label>Time<input name="timeLabel" value="${esc(co.timeLabel)}" required /></label>
              <label>Timezone<input name="timezone" value="${esc(co.timezone)}" required /></label>
              <label>Seat cap<input type="number" name="seatCap" value="${co.seatCap}" required /></label>
              <label>Price<input type="number" name="price" value="${co.price}" required /></label>
              <label>Currency<input name="currency" value="${esc(co.currency)}" required /></label>
            </div>
            <p class="sub">Seats taken: ${co.seatsTaken} (not edited here)</p>
            ${formActions("Save cohort")}
          </form>`;
        })
        .join("")}
      </div>
    `, "/admin/cohorts"),
  );
});

adminRoutes.post("/cohorts/:id", async (c) => {
  const admin = c.get("admin");
  if (!canManageSiteContent(roleOf(admin))) return forbid(c, admin, "Only admins can manage cohorts.");
  const body = await c.req.parseBody();
  await db
    .update(cohorts)
    .set({
      startDate: String(body.startDate),
      endDate: String(body.endDate),
      daysLabel: String(body.daysLabel),
      timeLabel: String(body.timeLabel),
      timezone: String(body.timezone),
      seatCap: Number(body.seatCap),
      price: Number(body.price),
      currency: String(body.currency),
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
  return c.html(
    desk(admin, "Landing", `
      ${pageHead("Landing copy", "Site-wide messaging, bank details, FAQs, and proof stats.")}
      ${flashBanner(c)}
      <div class="panel">
      <form method="post" class="stack">
        <div class="form-grid">
          <label>Tagline<input name="tagline" value="${esc(s.tagline)}" required /></label>
          <label>Contact email<input name="email" value="${esc(s.email)}" required /></label>
          <label>WhatsApp<input name="whatsapp" value="${esc(s.whatsapp)}" /></label>
          <label>Timezone<input name="timezone" value="${esc(s.timezone)}" required /></label>
          <label class="check full"><input type="checkbox" name="registrationOpen" ${s.registrationOpen ? "checked" : ""} /> Site-wide registration open</label>
        </div>
        <label class="full">Hero line<textarea name="heroLine" rows="4" required>${esc(s.heroLine)}</textarea></label>
        <label class="full">Closed message<textarea name="closedMessage" rows="3">${esc(s.closedMessage)}</textarea></label>
        <h2>Bank</h2>
        <div class="form-grid">
          <label>Bank name<input name="bankName" value="${esc(s.bank.bankName)}" required /></label>
          <label>Account name<input name="accountName" value="${esc(s.bank.accountName)}" required /></label>
          <label>Account number<input name="accountNumber" value="${esc(s.bank.accountNumber)}" required /></label>
        </div>
        <label class="full">Instructions<textarea name="instructions" rows="4">${esc(s.bank.instructions)}</textarea></label>
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
  const body = await c.req.parseBody();
  let faqs;
  let proof;
  try {
    faqs = JSON.parse(String(body.faqs));
    proof = JSON.parse(String(body.proof));
  } catch {
    return c.text("FAQ or proof JSON is invalid", 400);
  }
  const current = await loadCatalog();
  const next: LandingSettings = {
    ...current.settings,
    tagline: String(body.tagline),
    heroLine: String(body.heroLine),
    email: String(body.email),
    whatsapp: String(body.whatsapp || ""),
    timezone: String(body.timezone),
    registrationOpen: Boolean(body.registrationOpen),
    closedMessage: String(body.closedMessage || ""),
    bank: {
      bankName: String(body.bankName),
      accountName: String(body.accountName),
      accountNumber: String(body.accountNumber),
      instructions: String(body.instructions),
    },
    faqs,
    proof,
  };
  await db.update(settings).set({ json: JSON.stringify(next) }).where(eq(settings.id, "main"));
  await audit(admin.email, "landing_update", "settings", "main");
  return c.redirect(await publishAndRedirect("/admin/landing"));
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
  return c.html(
    desk(
      admin,
      "Emails",
      `
      ${pageHead("Registration email", "Sent immediately when someone reserves a seat. Use merge tags for dynamic fields.")}
      ${registrationEmailEditorPage(templates.registration)}
    `,
      "/admin/emails",
    ),
  );
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
  const subject = String(body.subject || "").trim();
  const html = String(body.html || "").trim();
  const text = String(body.text || "").trim();
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
      <p class="sub" style="margin-top:1rem">
        <strong>Super admin</strong> — full access, including team management.<br />
        <strong>Admin</strong> — manage courses, cohorts, landing, evidence, and instructors.<br />
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
  const name = String(body.name || "").trim();
  const email = String(body.email || "").toLowerCase().trim();
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

adminRoutes.get("/audit", async (c) => {
  const admin = c.get("admin");
  if (!canViewAudit(roleOf(admin))) return forbid(c, admin, "Only admins can view the audit log.");
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(80);
  return c.html(
    desk(admin, "Audit", `
      ${pageHead("Audit", "Recent admin actions across the desk.")}
      <div class="panel table-wrap">
      <table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td>${esc(r.createdAt.replace("T", " ").slice(0, 19))}</td>
                <td>${esc(r.actor)}</td>
                <td>${esc(r.action)}</td>
                <td>${esc(r.entity)} ${esc(r.entityId)}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      </div>
    `, "/admin/audit"),
  );
});

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
