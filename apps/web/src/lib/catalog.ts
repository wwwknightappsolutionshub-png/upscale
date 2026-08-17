import type { Catalog, Course, CourseSlug } from "@upscale/shared";
import { seedCatalog } from "@upscale/shared/seed";

const api = import.meta.env.PUBLIC_API_URL || "http://localhost:8787";
const token = import.meta.env.BUILD_TOKEN || "dev-build-token";

export async function getCatalog(): Promise<Catalog> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${api}/public/catalog`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return (await res.json()) as Catalog;
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

export const apiUrl = api;
