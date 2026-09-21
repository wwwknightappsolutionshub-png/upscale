import "../src/env.ts";
import { ensureSchema } from "../src/db/migrate.ts";
import { db } from "../src/db/client.ts";
import { courses, instructors, cohorts } from "../src/db/schema.ts";
import { ensureCatalogAdditions } from "../src/db/seed.ts";

async function main() {
  await ensureSchema();
  const added = await ensureCatalogAdditions();
  const c = await db.select({ slug: courses.slug, name: courses.name }).from(courses);
  const i = await db.select({ slug: instructors.slug, name: instructors.name }).from(instructors);
  const co = await db.select({ courseSlug: cohorts.courseSlug }).from(cohorts);
  console.log("ensured", JSON.stringify(added));
  console.log("courses", c.length, c.map((x) => x.slug).join(", "));
  console.log("instructors", i.length, i.map((x) => x.slug).join(", "));
  console.log("cohorts", co.length, co.map((x) => x.courseSlug).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
