import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortPitch: text("short_pitch").notNull(),
  durationWeeks: integer("duration_weeks").notNull(),
  weeklyHours: integer("weekly_hours").notNull(),
  price: integer("price").notNull(),
  currency: text("currency").notNull(),
  seatCap: integer("seat_cap").notNull(),
  registrationOpen: integer("registration_open").notNull().default(1),
  outcomesJson: text("outcomes_json").notNull(),
  outlineJson: text("outline_json").notNull(),
  toolsJson: text("tools_json").notNull(),
  prerequisites: text("prerequisites").notNull(),
  faqJson: text("faq_json").notNull(),
  ogDescription: text("og_description").notNull(),
  instructorIdsJson: text("instructor_ids_json").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const instructors = sqliteTable("instructors", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  bio: text("bio").notNull(),
  initials: text("initials").notNull(),
  accent: text("accent").notNull(),
  courseSlugsJson: text("course_slugs_json").notNull(),
  photoKey: text("photo_key").notNull().default(""),
});

export const cohorts = sqliteTable("cohorts", {
  id: text("id").primaryKey(),
  courseSlug: text("course_slug").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  daysLabel: text("days_label").notNull(),
  timeLabel: text("time_label").notNull(),
  timezone: text("timezone").notNull(),
  seatCap: integer("seat_cap").notNull(),
  seatsTaken: integer("seats_taken").notNull().default(0),
  price: integer("price").notNull(),
  currency: text("currency").notNull(),
});

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  json: text("json").notNull(),
});

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("editor"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull().default(""),
  state: text("state").notNull().default(""),
  city: text("city").notNull().default(""),
  courseSlug: text("course_slug").notNull(),
  cohortId: text("cohort_id").notNull(),
  motivation: text("motivation").notNull(),
  referenceCode: text("reference_code").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  status: text("status").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const paymentEvidence = sqliteTable("payment_evidence", {
  id: text("id").primaryKey(),
  studentId: text("student_id").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  fileKey: text("file_key").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  status: text("status").notNull(),
  reviewerId: text("reviewer_id"),
  reviewNotes: text("review_notes").notNull().default(""),
  submittedAt: text("submitted_at").notNull(),
  reviewedAt: text("reviewed_at"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});
