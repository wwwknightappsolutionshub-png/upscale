import { z } from "zod";
import { COUNTRIES, isNigeria } from "./countries.ts";
import { NIGERIA_STATES } from "./nigeria.ts";
import { isValidNgPhone } from "./phone.ts";

export const COURSE_SLUGS = [
  "graphic-design",
  "front-end-development",
  "backend-development",
  "full-stack-development",
  "ui-ux-designs",
  "professional-photo-editing",
  "professional-video-editing-capcut",
] as const;

export type CourseSlug = (typeof COURSE_SLUGS)[number];

export const COURSE_PREFIX: Record<CourseSlug, string> = {
  "graphic-design": "GD",
  "front-end-development": "FE",
  "backend-development": "BE",
  "full-stack-development": "FS",
  "ui-ux-designs": "UX",
  "professional-photo-editing": "PE",
  "professional-video-editing-capcut": "VC",
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
    phone: z.string().trim().min(7, "Enter a valid phone number.").max(20),
    country: z.string().trim().min(2, "Select your country.").max(80),
    state: z.string().trim().max(80).optional().default(""),
    city: z.string().trim().max(80).optional().default(""),
    courseSlug: z.enum(COURSE_SLUGS),
    motivation: z.enum(MOTIVATIONS),
    consent: z.union([z.literal(true), z.literal("true"), z.literal("on"), z.literal("1")]),
  })
  .superRefine((data, ctx) => {
    if (!COUNTRIES.includes(data.country as (typeof COUNTRIES)[number])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a valid country.", path: ["country"] });
    }

    if (isNigeria(data.country)) {
      if (!data.state || data.state.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select your state.", path: ["state"] });
      }
      if (!data.city || data.city.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select your city.", path: ["city"] });
      }
      if (!isValidNgPhone(data.phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid Nigerian phone number (e.g. 08012345678).",
          path: ["phone"],
        });
      }
      const cities = data.state ? NIGERIA_STATES[data.state] : undefined;
      if (data.state && !cities) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a valid Nigerian state.", path: ["state"] });
        return;
      }
      if (data.city && cities && !cities.includes(data.city)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a city in your state.", path: ["city"] });
      }
      return;
    }

    const digits = data.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number.", path: ["phone"] });
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
  photoUrl: string | null;
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
  /** Optional fixed NGN bank-transfer amount for this intake. */
  priceNgn: number | null;
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

export const WAYS_IN_MARKS = ["switch", "newbie", "upskill"] as const;
export type WaysInMark = (typeof WAYS_IN_MARKS)[number];

export type WaysInItem = {
  mark: WaysInMark;
  title: string;
  copy: string;
};

export type BankDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
};

export type LandingSettings = {
  tagline: string;
  heroLine: string;
  proof: { value: string; label: string }[];
  /** NGN transfer details — shown when the registrant’s country is Nigeria. */
  bank: BankDetails;
  /** USD transfer details — shown for all other countries. */
  bankUsd: BankDetails;
  timezone: string;
  email: string;
  whatsapp: string;
  registrationOpen: boolean;
  closedMessage: string;
  faqs: CourseFaq[];
  /** Homepage “Ways in” band heading (last word is emphasized). */
  waysInTitle: string;
  /** Homepage “The tracks” section heading (last word is emphasized). */
  tracksTitle: string;
  /** Three audience cards under Ways in. */
  waysIn: WaysInItem[];
  /** Public /schedule page kicker (e.g. Calendar). */
  scheduleKicker: string;
  /** Public /schedule page headline (e.g. When we meet.). */
  scheduleTitle: string;
  /** Public /schedule page supporting line. */
  scheduleLede: string;
  /** Legend value for sessions per week (e.g. 2×). */
  scheduleSessionsLabel: string;
  /** Public /instructors page kicker (e.g. Faculty). */
  facultyKicker: string;
  /** Public /instructors page headline (e.g. The room.). */
  facultyTitle: string;
  /** Public /instructors page supporting line. */
  facultyLede: string;
};

export type Catalog = {
  settings: LandingSettings;
  courses: Course[];
  instructors: Instructor[];
  cohorts: Cohort[];
};

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** Primary fee plus optional NGN equivalent, e.g. `$450 · ₦675,000`. */
export function formatFeeLabel(price: number, currency: string, priceNgn?: number | null) {
  const primary = formatMoney(price, currency);
  if (priceNgn == null || !Number.isFinite(priceNgn) || priceNgn <= 0) return primary;
  return `${primary} · ${formatMoney(priceNgn, "NGN")}`;
}

/** Pick NGN bank for Nigeria registrants; USD bank for everyone else. */
export function bankForCountry(settings: LandingSettings, country: string): BankDetails {
  if (isNigeria(country)) return settings.bank;
  if (isConfiguredBank(settings.bankUsd)) return settings.bankUsd;
  return settings.bank;
}

function isConfiguredBank(bank: BankDetails) {
  const name = String(bank.bankName || "").trim();
  const number = String(bank.accountNumber || "").trim();
  if (!name || !number) return false;
  if (/^set in admin$/i.test(name)) return false;
  if (/^0+$/.test(number)) return false;
  return true;
}

export function seatsLeft(cohort: Cohort) {
  return Math.max(0, cohort.seatCap - cohort.seatsTaken);
}

export { COUNTRIES, DEFAULT_COUNTRY, isNigeria, type CountryName } from "./countries.ts";
export { NIGERIA_STATES, NIGERIA_STATE_NAMES } from "./nigeria.ts";
export { formatNgPhone, isValidNgPhone, normalizeNgPhone } from "./phone.ts";
