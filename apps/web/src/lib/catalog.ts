import type { Catalog, Course, CourseSlug, Instructor, LandingSettings } from "@upscale/shared";
import { seedCatalog } from "@upscale/shared/seed";

/** Browser-facing API (baked into register/payment scripts). Must be publicly reachable. */
const publicApi = import.meta.env.PUBLIC_API_URL || "http://localhost:8787";
/** Build-time catalog fetch (can be localhost when API runs on the same server). */
const catalogApi = import.meta.env.BUILD_API_URL || publicApi;
const token = import.meta.env.BUILD_TOKEN || "dev-build-token";

function withSettingsDefaults(catalog: Catalog): Catalog {
  const defaults = seedCatalog.settings;
  const raw = (catalog.settings || {}) as Partial<LandingSettings>;
  return {
    ...catalog,
    settings: {
      ...defaults,
      ...raw,
      bank: { ...defaults.bank, ...(raw.bank || {}) },
      bankUsd: { ...defaults.bankUsd, ...(raw.bankUsd || {}) },
      proof: Array.isArray(raw.proof) && raw.proof.length ? raw.proof : defaults.proof,
      faqs: Array.isArray(raw.faqs) && raw.faqs.length ? raw.faqs : defaults.faqs,
      waysInTitle: String(raw.waysInTitle || defaults.waysInTitle).trim() || defaults.waysInTitle,
      tracksTitle: String(raw.tracksTitle || defaults.tracksTitle).trim() || defaults.tracksTitle,
      scheduleKicker: String(raw.scheduleKicker || defaults.scheduleKicker).trim() || defaults.scheduleKicker,
      scheduleTitle: String(raw.scheduleTitle || defaults.scheduleTitle).trim() || defaults.scheduleTitle,
      scheduleLede: String(raw.scheduleLede || defaults.scheduleLede).trim() || defaults.scheduleLede,
      scheduleSessionsLabel:
        String(raw.scheduleSessionsLabel || defaults.scheduleSessionsLabel).trim() || defaults.scheduleSessionsLabel,
      facultyKicker: String(raw.facultyKicker || defaults.facultyKicker).trim() || defaults.facultyKicker,
      facultyTitle: String(raw.facultyTitle || defaults.facultyTitle).trim() || defaults.facultyTitle,
      facultyLede: String(raw.facultyLede || defaults.facultyLede).trim() || defaults.facultyLede,
      waysIn: Array.isArray(raw.waysIn) && raw.waysIn.length ? raw.waysIn : defaults.waysIn,
      whatsapp: raw.whatsapp || defaults.whatsapp,
    },
  };
}

export async function getCatalog(): Promise<Catalog> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${catalogApi}/public/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return withSettingsDefaults((await res.json()) as Catalog);
  } catch {
    /* seed fallback */
  }
  return seedCatalog;
}

export function courseOf(catalog: Catalog, slug: string) {
  return catalog.courses.find((c) => c.slug === slug);
}

export function instructorsOf(catalog: Catalog, course: Course) {
  return catalog.instructors.filter((i) => course.instructorIds.includes(i.id));
}

function normalizePersonName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when two instructor rows are the same person (shared photo or matching name). */
export function sameInstructorPerson(a: Instructor, b: Instructor) {
  if (a.id === b.id) return true;
  if (a.photoUrl && b.photoUrl && a.photoUrl === b.photoUrl) return true;
  const na = normalizePersonName(a.name);
  const nb = normalizePersonName(b.name);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [fa, ...ra] = na.split(" ");
  const [fb, ...rb] = nb.split(" ");
  if (fa !== fb) return false;
  const la = ra.join(" ");
  const lb = rb.join(" ");
  if (!la || !lb) return true;
  return la.startsWith(lb) || lb.startsWith(la) || la.includes(lb) || lb.includes(la);
}

export type FacultyMember = Instructor & { roles: string[] };

/**
 * One row per person for the faculty list — merges duplicate instructor records
 * that teach multiple tracks (or were renamed to the same person in admin).
 */
export function uniqueFaculty(instructors: Instructor[]): FacultyMember[] {
  const clusters: FacultyMember[] = [];
  for (const person of instructors) {
    const match = clusters.find((c) => sameInstructorPerson(c, person));
    if (!match) {
      clusters.push({
        ...person,
        roles: person.role ? [person.role] : [],
        courseSlugs: [...person.courseSlugs],
      });
      continue;
    }
    if (person.role && !match.roles.includes(person.role)) match.roles.push(person.role);
    match.courseSlugs = [...new Set([...match.courseSlugs, ...person.courseSlugs])] as CourseSlug[];
    if (!match.photoUrl && person.photoUrl) match.photoUrl = person.photoUrl;
    if ((person.name || "").length > (match.name || "").length) match.name = person.name;
    if ((person.bio || "").length > (match.bio || "").length) match.bio = person.bio;
    if ((person.initials || "").length > (match.initials || "").length) match.initials = person.initials;
  }
  return clusters.map((c) => ({
    ...c,
    role: c.roles.join(" · ") || c.role,
  }));
}

/** All catalog rows that represent the same person as `person`. */
export function peerInstructors(catalog: Catalog, person: Instructor) {
  return catalog.instructors.filter((i) => sameInstructorPerson(i, person));
}

export function nextCohort(catalog: Catalog, slug: CourseSlug) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    catalog.cohorts
      .filter((c) => c.courseSlug === slug)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .find((c) => c.endDate >= today) ?? catalog.cohorts.find((c) => c.courseSlug === slug)
  );
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Public API base URL for browser fetch (register, payment, evidence). */
export const apiUrl = publicApi;
