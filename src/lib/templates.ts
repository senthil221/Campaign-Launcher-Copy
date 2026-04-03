export type TemplateKey = "standard" | "eu" | "west-coast" | "global" | "custom";

export interface ScheduleTemplate {
  label: string;
  description: string;
  timezone: string;
  days: number[];
  start: string;
  end: string;
  maxLeads: number;
}

export const TEMPLATES: Record<Exclude<TemplateKey, "custom">, ScheduleTemplate> = {
  standard: {
    label: "US East",
    description: "EST · Mon–Fri · 8am–6pm",
    timezone: "America/New_York",
    days: [1, 2, 3, 4, 5],
    start: "08:00",
    end: "18:00",
    maxLeads: 50,
  },
  eu: {
    label: "Europe",
    description: "GMT · Mon–Fri · 8am–5pm",
    timezone: "Europe/London",
    days: [1, 2, 3, 4, 5],
    start: "08:00",
    end: "17:00",
    maxLeads: 50,
  },
  "west-coast": {
    label: "US West",
    description: "PST · Mon–Fri · 8am–6pm",
    timezone: "America/Los_Angeles",
    days: [1, 2, 3, 4, 5],
    start: "08:00",
    end: "18:00",
    maxLeads: 50,
  },
  global: {
    label: "Global",
    description: "UTC · Mon–Fri · 7am–7pm",
    timezone: "UTC",
    days: [1, 2, 3, 4, 5],
    start: "07:00",
    end: "19:00",
    maxLeads: 75,
  },
};

export const PRESET_KEYS = Object.keys(TEMPLATES) as Exclude<TemplateKey, "custom">[];

export const DEFAULT_CUSTOM_SCHEDULE: ScheduleTemplate = {
  label: "Custom",
  description: "Your custom schedule",
  timezone: "America/New_York",
  days: [1, 2, 3, 4, 5],
  start: "08:00",
  end: "18:00",
  maxLeads: 50,
};

export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "UTC",
];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
