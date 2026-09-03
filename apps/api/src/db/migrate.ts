import { client } from "./client.ts";

const statements = `
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_pitch TEXT NOT NULL,
  duration_weeks INTEGER NOT NULL,
  weekly_hours INTEGER NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL,
  seat_cap INTEGER NOT NULL,
  registration_open INTEGER NOT NULL DEFAULT 1,
  outcomes_json TEXT NOT NULL,
  outline_json TEXT NOT NULL,
  tools_json TEXT NOT NULL,
  prerequisites TEXT NOT NULL,
  faq_json TEXT NOT NULL,
  og_description TEXT NOT NULL,
  instructor_ids_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS instructors (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  bio TEXT NOT NULL,
  initials TEXT NOT NULL,
  accent TEXT NOT NULL,
  course_slugs_json TEXT NOT NULL,
  photo_key TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  course_slug TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_label TEXT NOT NULL,
  time_label TEXT NOT NULL,
  timezone TEXT NOT NULL,
  seat_cap INTEGER NOT NULL,
  seats_taken INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'super_admin',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  course_slug TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  motivation TEXT NOT NULL,
  reference_code TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS students_email_cohort ON students (email, cohort_id);
CREATE TABLE IF NOT EXISTS payment_evidence (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  file_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL,
  reviewer_id TEXT,
  review_notes TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;

export async function ensureSchema() {
  for (const raw of statements.split(";")) {
    const sql = raw.trim();
    if (sql) await client.execute(sql);
  }
  try {
    await client.execute("ALTER TABLE students ADD COLUMN state TEXT NOT NULL DEFAULT ''");
  } catch {
    /* column exists */
  }
  try {
    await client.execute("ALTER TABLE students ADD COLUMN country TEXT NOT NULL DEFAULT ''");
  } catch {
    /* column exists */
  }
  try {
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS students_phone_cohort ON students (phone, cohort_id)");
  } catch {
    /* index exists */
  }
  try {
    await client.execute("ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'super_admin'");
  } catch {
    /* column exists */
  }
  try {
    await client.execute("ALTER TABLE instructors ADD COLUMN photo_key TEXT NOT NULL DEFAULT ''");
  } catch {
    /* column exists */
  }
}
