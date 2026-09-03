import { asc, eq } from "drizzle-orm";
import type { Catalog, Course, CourseSlug, Instructor, LandingSettings } from "@upscale/shared";
import { db } from "../db/client.ts";
import { auditLogs, cohorts, courses, instructors, settings } from "../db/schema.ts";
import { instructorPhotoPublicUrl } from "./storage.ts";
import { nid, nowIso } from "./ids.ts";

export async function loadCatalog(): Promise<Catalog> {
  const [courseRows, instructorRows, cohortRows, settingRows] = await Promise.all([
    db.select().from(courses).orderBy(asc(courses.sortOrder)),
    db.select().from(instructors),
    db.select().from(cohorts),
    db.select().from(settings).where(eq(settings.id, "main")).limit(1),
  ]);

  const parsedSettings = JSON.parse(settingRows[0]?.json || "{}") as LandingSettings;

  return {
    settings: {
      ...parsedSettings,
      whatsapp: parsedSettings.whatsapp || "+234 803 059 9638",
    },
    courses: courseRows.map(rowToCourse),
    instructors: instructorRows.map(rowToInstructor),
    cohorts: cohortRows.map((c) => ({
      id: c.id,
      courseSlug: c.courseSlug as CourseSlug,
      startDate: c.startDate,
      endDate: c.endDate,
      daysLabel: c.daysLabel,
      timeLabel: c.timeLabel,
      timezone: c.timezone,
      seatCap: c.seatCap,
      seatsTaken: c.seatsTaken,
      price: c.price,
      currency: c.currency,
    })),
  };
}

function rowToCourse(c: typeof courses.$inferSelect): Course {
  return {
    id: c.id,
    slug: c.slug as CourseSlug,
    name: c.name,
    shortPitch: c.shortPitch,
    durationWeeks: c.durationWeeks,
    weeklyHours: c.weeklyHours,
    price: c.price,
    currency: c.currency,
    seatCap: c.seatCap,
    registrationOpen: Boolean(c.registrationOpen),
    outcomes: JSON.parse(c.outcomesJson),
    outline: JSON.parse(c.outlineJson),
    tools: JSON.parse(c.toolsJson),
    prerequisites: c.prerequisites,
    faq: JSON.parse(c.faqJson),
    ogDescription: c.ogDescription,
    instructorIds: JSON.parse(c.instructorIdsJson),
    sortOrder: c.sortOrder,
  };
}

function rowToInstructor(i: typeof instructors.$inferSelect): Instructor {
  return {
    id: i.id,
    slug: i.slug,
    name: i.name,
    role: i.role,
    bio: i.bio,
    initials: i.initials,
    accent: i.accent as "blue" | "red",
    courseSlugs: JSON.parse(i.courseSlugsJson),
    photoUrl: instructorPhotoPublicUrl(i.photoKey),
  };
}

export async function audit(actor: string, action: string, entity: string, entityId: string, payload: unknown = {}) {
  await db.insert(auditLogs).values({
    id: nid("aud"),
    actor,
    action,
    entity,
    entityId,
    payloadJson: JSON.stringify(payload),
    createdAt: nowIso(),
  });
}

export function nextCohort(catalog: Catalog, slug: CourseSlug) {
  const today = new Date().toISOString().slice(0, 10);
  return catalog.cohorts
    .filter((c) => c.courseSlug === slug)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .find((c) => c.endDate >= today) ?? catalog.cohorts.find((c) => c.courseSlug === slug);
}

export function courseBySlug(catalog: Catalog, slug: string) {
  return catalog.courses.find((c) => c.slug === slug);
}
