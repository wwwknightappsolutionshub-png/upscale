import { eq } from "drizzle-orm";
import { seedCatalog } from "@upscale/shared/seed";
import { db } from "./client.ts";
import { adminUsers, cohorts, courses, instructors, settings } from "./schema.ts";
import { ensureEmailTemplates } from "../lib/email-templates.ts";
import { hashPassword } from "../lib/password.ts";
import { nid, nowIso } from "../lib/ids.ts";

const FIFTH_INSTRUCTOR = {
  id: "ins_faculty",
  slug: "faculty",
  name: "Faculty",
  role: "",
  bio: "",
  initials: "F",
  accent: "blue",
  courseSlugsJson: "[]",
  photoKey: "",
};

async function ensureFifthInstructor() {
  const byId = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.id, FIFTH_INSTRUCTOR.id)).limit(1);
  if (byId.length) return;
  const bySlug = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.slug, FIFTH_INSTRUCTOR.slug)).limit(1);
  if (bySlug.length) return;
  await db.insert(instructors).values(FIFTH_INSTRUCTOR);
}

export async function seedIfEmpty() {
  const existing = await db.select({ id: courses.id }).from(courses).limit(1);
  if (existing.length === 0) {
    for (const c of seedCatalog.courses) {
      await db.insert(courses).values({
        id: c.id,
        slug: c.slug,
        name: c.name,
        shortPitch: c.shortPitch,
        durationWeeks: c.durationWeeks,
        weeklyHours: c.weeklyHours,
        price: c.price,
        currency: c.currency,
        seatCap: c.seatCap,
        registrationOpen: c.registrationOpen ? 1 : 0,
        outcomesJson: JSON.stringify(c.outcomes),
        outlineJson: JSON.stringify(c.outline),
        toolsJson: JSON.stringify(c.tools),
        prerequisites: c.prerequisites,
        faqJson: JSON.stringify(c.faq),
        ogDescription: c.ogDescription,
        instructorIdsJson: JSON.stringify(c.instructorIds),
        sortOrder: c.sortOrder,
      });
    }
    for (const i of seedCatalog.instructors) {
      await db.insert(instructors).values({
        id: i.id,
        slug: i.slug,
        name: i.name,
        role: i.role,
        bio: i.bio,
        initials: i.initials,
        accent: i.accent,
        courseSlugsJson: JSON.stringify(i.courseSlugs),
        photoKey: "",
      });
    }
    for (const co of seedCatalog.cohorts) {
      await db.insert(cohorts).values({
        id: co.id,
        courseSlug: co.courseSlug,
        startDate: co.startDate,
        endDate: co.endDate,
        daysLabel: co.daysLabel,
        timeLabel: co.timeLabel,
        timezone: co.timezone,
        seatCap: co.seatCap,
        seatsTaken: co.seatsTaken,
        price: co.price,
        currency: co.currency,
      });
    }
    await db.insert(settings).values({
      id: "main",
      json: JSON.stringify(seedCatalog.settings),
    });
  }

  await ensureFifthInstructor();
  await ensureEmailTemplates();

  const email = (process.env.ADMIN_EMAIL || "leo.a@example.org").toLowerCase();
  const admins = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  if (admins.length === 0) {
    await db.insert(adminUsers).values({
      id: nid("adm"),
      email,
      passwordHash: await hashPassword(process.env.ADMIN_PASSWORD || "ChangeMe_UPSCALE1"),
      name: process.env.ADMIN_NAME || "UPSCALE Admin",
      role: "super_admin",
      createdAt: nowIso(),
    });
  }
}
