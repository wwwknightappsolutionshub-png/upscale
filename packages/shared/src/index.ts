import { z } from "zod";
import { NIGERIA_STATES } from "./nigeria.ts";
import { isValidNgPhone } from "./phone.ts";

export const COURSE_SLUGS = [
  "graphic-design",
  "front-end-development",
  "backend-development",
  "full-stack-development",
] as const;

export type CourseSlug = (typeof COURSE_SLUGS)[number];

export const COURSE_PREFIX: Record<CourseSlug, string> = {
  "graphic-design": "GD",
  "front-end-development": "FE",
  "backend-development": "BE",
  "full-stack-development": "FS",
};

export const STUDENT_STATUSES = [
  "registered",
  "evidence_submitted",
  "verified",
  "rejected",
  "enrolled",
  "waitlist",
] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const MOTIVATIONS = ["career-switch", "newbie", "upskill"] as const;
export type Motivation = (typeof MOTIVATIONS)[number];

export const motivationLabel: Record<Motivation, string> = {
  "career-switch": "Switching career path",
  newbie: "New to the IT space",
  upskill: "Upscaling current skills",
};

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(120),
    email: z.string().trim().email("Enter a valid email address.").max(180),
    phone: z
      .string()
      .trim()
      .refine(isValidNgPhone, "Enter a valid Nigerian phone number (e.g. 08012345678)."),
    country: z.string().trim().min(2, "Enter your country.").max(80),
    state: z.string().trim().min(2, "Select your state."),
    city: z.string().trim().min(2, "Select your city.").max(80),
    courseSlug: z.enum(COURSE_SLUGS),
    motivation: z.enum(MOTIVATIONS),
    consent: z.union([z.literal(true), z.literal("true"), z.literal("on"), z.literal("1")]),
  })
  .superRefine((data, ctx) => {
    const cities = NIGERIA_STATES[data.state];
    if (!cities) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a valid Nigerian state.", path: ["state"] });
      return;
    }
    if (!cities.includes(data.city)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a city in your state.", path: ["city"] });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const evidenceMetaSchema = z.object({
  token: z.string().min(16).max(128),
  method: z.enum(["transfer", "other"]).default("transfer"),
});

export type WeekBlock = {
  week: number;
  title: string;
  hours: number;
  topics: string[];
  project: string | null;
};

export type CourseFaq = { q: string; a: string };

export type Instructor = {
  id: string;
  slug: string;
  name: string;
  role: string;
  bio: string;
  initials: string;
  accent: "blue" | "red";
  courseSlugs: CourseSlug[];
};

export type Cohort = {
  id: string;
  courseSlug: CourseSlug;
  startDate: string;
  endDate: string;
  daysLabel: string;
  timeLabel: string;
  timezone: string;
  seatCap: number;
  seatsTaken: number;
  price: number;
  currency: string;
};

export type Course = {
  id: string;
  slug: CourseSlug;
  name: string;
  shortPitch: string;
  durationWeeks: number;
  weeklyHours: number;
  price: number;
  currency: string;
  seatCap: number;
  registrationOpen: boolean;
  outcomes: string[];
  outline: WeekBlock[];
  tools: string[];
  prerequisites: string;
  faq: CourseFaq[];
  ogDescription: string;
  instructorIds: string[];
  sortOrder: number;
};

export type LandingSettings = {
  tagline: string;
  heroLine: string;
  proof: { value: string; label: string }[];
  bank: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    instructions: string;
  };
  timezone: string;
  email: string;
  whatsapp: string;
  registrationOpen: boolean;
  closedMessage: string;
  faqs: CourseFaq[];
};

export type Catalog = {
  settings: LandingSettings;
  courses: Course[];
  instructors: Instructor[];
  cohorts: Cohort[];
};

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function seatsLeft(cohort: Cohort) {
  return Math.max(0, cohort.seatCap - cohort.seatsTaken);
}

export { NIGERIA_STATES, NIGERIA_STATE_NAMES } from "./nigeria.ts";
export { formatNgPhone, isValidNgPhone, normalizeNgPhone } from "./phone.ts";
