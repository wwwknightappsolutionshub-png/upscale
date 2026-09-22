import { eq } from "drizzle-orm";
import { seedCatalog } from "@upscale/shared/seed";
import type { LandingSettings } from "@upscale/shared";
import { db } from "./client.ts";
import { adminUsers, cohorts, courses, instructors, settings, students } from "./schema.ts";
import { ensureEmailTemplates } from "../lib/email-templates.ts";
import { hashPassword } from "../lib/password.ts";
import { nid, nowIso } from "../lib/ids.ts";

export type CatalogEnsureReport = {
  instructorsAdded: string[];
  coursesAdded: string[];
  cohortsAdded: string[];
  proofUpdated: boolean;
};

async function ensureInstructor(i: (typeof seedCatalog.instructors)[number]) {
  const byId = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.id, i.id)).limit(1);
  if (byId.length) return false;
  const bySlug = await db.select({ id: instructors.id }).from(instructors).where(eq(instructors.slug, i.slug)).limit(1);
  if (bySlug.length) return false;
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
  return true;
}

async function ensureCourse(c: (typeof seedCatalog.courses)[number]) {
  const byId = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, c.id)).limit(1);
  if (byId.length) return false;
  const bySlug = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, c.slug)).limit(1);
  if (bySlug.length) return false;
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
  return true;
}

async function ensureCohort(co: (typeof seedCatalog.cohorts)[number]) {
  const byId = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.id, co.id)).limit(1);
  if (byId.length) return false;
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
    priceNgn: co.priceNgn && co.priceNgn > 0 ? co.priceNgn : 0,
  });
  return true;
}

async function ensureTrackCountInProof() {
  const row = (await db.select().from(settings).where(eq(settings.id, "main")).limit(1))[0];
  if (!row) return false;
  let parsed: LandingSettings;
  try {
    parsed = JSON.parse(row.json) as LandingSettings;
  } catch {
    return false;
  }
  if (!Array.isArray(parsed.proof)) return false;
  const trackStat = parsed.proof.find((p) => /career tracks/i.test(String(p.label || "")));
  if (!trackStat) return false;
  const expected = String(seedCatalog.courses.length);
  if (String(trackStat.value) === expected) return false;
  trackStat.value = expected;
  await db.update(settings).set({ json: JSON.stringify(parsed) }).where(eq(settings.id, "main"));
  return true;
}

/** Split legacy Photography / Videography into photo + CapCut video tracks on existing DBs. */
async function migratePhotographyVideographySplit(): Promise<string[]> {
  const changed: string[] = [];
  const pe = seedCatalog.courses.find((c) => c.slug === "professional-photo-editing");
  if (!pe) return changed;

  const legacy = await db.select().from(courses).where(eq(courses.slug, "photography-videography")).limit(1);
  const byId = await db.select().from(courses).where(eq(courses.id, "crs_pv")).limit(1);

  if (legacy[0] || (byId[0] && byId[0].slug === "photography-videography")) {
    const row = legacy[0] || byId[0]!;
    await db
      .update(courses)
      .set({
        slug: pe.slug,
        name: pe.name,
        shortPitch: pe.shortPitch,
        durationWeeks: pe.durationWeeks,
        weeklyHours: pe.weeklyHours,
        price: pe.price,
        currency: pe.currency,
        seatCap: pe.seatCap,
        registrationOpen: pe.registrationOpen ? 1 : 0,
        outcomesJson: JSON.stringify(pe.outcomes),
        outlineJson: JSON.stringify(pe.outline),
        toolsJson: JSON.stringify(pe.tools),
        prerequisites: pe.prerequisites,
        faqJson: JSON.stringify(pe.faq),
        ogDescription: pe.ogDescription,
        instructorIdsJson: JSON.stringify(pe.instructorIds),
        sortOrder: pe.sortOrder,
      })
      .where(eq(courses.id, row.id));
    changed.push("professional-photo-editing←photography-videography");
  }

  // Point legacy cohort / student rows at the photo track slug.
  const legacyCohorts = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.courseSlug, "photography-videography"));
  if (legacyCohorts.length) {
    await db
      .update(cohorts)
      .set({ courseSlug: "professional-photo-editing" })
      .where(eq(cohorts.courseSlug, "photography-videography"));
    changed.push(`cohorts:${legacyCohorts.length}`);
  }

  const legacyStudents = await db.select({ id: students.id }).from(students).where(eq(students.courseSlug, "photography-videography"));
  if (legacyStudents.length) {
    await db
      .update(students)
      .set({ courseSlug: "professional-photo-editing" })
      .where(eq(students.courseSlug, "photography-videography"));
    changed.push(`students:${legacyStudents.length}`);
  }

  // Keep Devon linked to both new tracks.
  const devon = seedCatalog.instructors.find((i) => i.id === "ins_devon");
  if (devon) {
    const row = (await db.select().from(instructors).where(eq(instructors.id, devon.id)).limit(1))[0];
    if (row) {
      const next = JSON.stringify(devon.courseSlugs);
      if (row.courseSlugsJson !== next || row.bio !== devon.bio) {
        await db
          .update(instructors)
          .set({ courseSlugsJson: next, bio: devon.bio })
          .where(eq(instructors.id, devon.id));
        changed.push("devon-hart");
      }
    }
  }

  return changed;
}

/** Insert any seed courses / instructors / cohorts missing from an already-populated DB. */
export async function ensureCatalogAdditions(): Promise<CatalogEnsureReport> {
  const report: CatalogEnsureReport = {
    instructorsAdded: [],
    coursesAdded: [],
    cohortsAdded: [],
    proofUpdated: false,
  };

  try {
    const migrated = await migratePhotographyVideographySplit();
    if (migrated.length) console.log(`[catalog] photography split: ${migrated.join(", ")}`);
  } catch (err) {
    console.error("[catalog] failed photography/videography split:", err);
  }

  // Courses first so a failing instructor migration cannot block new tracks.
  for (const c of seedCatalog.courses) {
    try {
      if (await ensureCourse(c)) report.coursesAdded.push(c.slug);
    } catch (err) {
      console.error(`[catalog] failed to ensure course ${c.slug}:`, err);
    }
  }
  for (const i of seedCatalog.instructors) {
    try {
      if (await ensureInstructor(i)) report.instructorsAdded.push(i.slug);
    } catch (err) {
      console.error(`[catalog] failed to ensure instructor ${i.slug}:`, err);
    }
  }
  for (const co of seedCatalog.cohorts) {
    try {
      if (await ensureCohort(co)) report.cohortsAdded.push(co.id);
    } catch (err) {
      console.error(`[catalog] failed to ensure cohort ${co.id}:`, err);
    }
  }
  try {
    report.proofUpdated = await ensureTrackCountInProof();
  } catch (err) {
    console.error("[catalog] failed to update proof track count:", err);
  }

  const added =
    report.instructorsAdded.length + report.coursesAdded.length + report.cohortsAdded.length;
  if (added || report.proofUpdated) {
    console.log(
      `[catalog] ensured +${report.instructorsAdded.length} instructors, +${report.coursesAdded.length} courses, +${report.cohortsAdded.length} cohorts` +
        (report.proofUpdated ? `, proof→${seedCatalog.courses.length} tracks` : ""),
    );
    if (report.coursesAdded.length) console.log(`[catalog] courses: ${report.coursesAdded.join(", ")}`);
    if (report.instructorsAdded.length) console.log(`[catalog] instructors: ${report.instructorsAdded.join(", ")}`);
  }

  return report;
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
        priceNgn: co.priceNgn && co.priceNgn > 0 ? co.priceNgn : 0,
      });
    }
    await db.insert(settings).values({
      id: "main",
      json: JSON.stringify(seedCatalog.settings),
    });
    console.log(`[catalog] fresh seed: ${seedCatalog.courses.length} courses, ${seedCatalog.instructors.length} instructors`);
  }

  await ensureCatalogAdditions();
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
