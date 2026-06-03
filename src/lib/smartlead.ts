import type { SequenceRow, LeadRow, InboxRow } from "./csv";
import type { ScheduleTemplate } from "./templates";
import type { CampaignSettings } from "./config";
import { settingsToApiPayload } from "./config";

// ── Proxy helper — API key lives in Vercel env, never in the browser ──────────

async function call<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch("/api/smartlead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, path, body }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      (data as Record<string, unknown> | null)?.error ||
      (data as Record<string, unknown> | null)?.message ||
      `Request failed with HTTP ${res.status}`;
    throw new Error(String(msg));
  }

  return data as T;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface CreateCampaignResponse {
  id: number;
  name: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function createCampaign(name: string): Promise<CreateCampaignResponse> {
  return call<CreateCampaignResponse>("POST", "/campaigns/create", { name });
}

export async function saveSequences(campaignId: number, rows: SequenceRow[]): Promise<void> {
  const sequences = rows
    .filter((r) => Number.isInteger(Number(r.seq_number)) && Number(r.seq_number) >= 1)
    .map((r) => ({
      seq_number: Number(r.seq_number),
      subject: r.subject,
      email_body: r.body.replace(/\r?\n/g, "<br>"),
      seq_delay_details: { delay_in_days: Number(r.delay_days) },
    }));
  await call("POST", `/campaigns/${campaignId}/sequences`, { sequences });
}

export async function addInboxBatch(campaignId: number, emailAccountIds: number[]): Promise<void> {
  await call("POST", `/campaigns/${campaignId}/email-accounts`, {
    email_account_ids: emailAccountIds,
  });
}

export async function setSchedule(
  campaignId: number,
  template: ScheduleTemplate,
  sendGapMinutes: number
): Promise<void> {
  await call("POST", `/campaigns/${campaignId}/schedule`, {
    timezone: template.timezone,
    days_of_the_week: template.days,
    start_hour: template.start,
    end_hour: template.end,
    min_time_btw_emails: sendGapMinutes,
    max_new_leads_per_day: template.maxLeads,
  });
}

export async function applySettings(campaignId: number, settings: CampaignSettings): Promise<void> {
  await call("POST", `/campaigns/${campaignId}/settings`, settingsToApiPayload(settings));
}

export interface UploadLeadBatchResult {
  added_count: number;
  skipped_count: number;
  skipped_leads: { email: string; reason: string }[];
}

export async function uploadLeadBatch(
  campaignId: number,
  leads: LeadRow[]
): Promise<UploadLeadBatchResult> {
  const ALLOWED = new Set(["email", "first_name", "last_name", "company_name", "location"]);
  const lead_list = leads.map((lead) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(lead)) {
      if (ALLOWED.has(k)) clean[k] = v;
    }
    return clean;
  });

  return call<UploadLeadBatchResult>(`POST`, `/campaigns/${campaignId}/leads`, {
    lead_list,
    settings: {
      ignore_global_block_list: false,
      ignore_unsubscribe_list: false,
      ignore_duplicate_leads_in_other_campaign: false,
    },
  });
}

export async function activateCampaign(campaignId: number): Promise<void> {
  await call("POST", `/campaigns/${campaignId}/status`, { status: "START" });
}

// ── Inbox helper ──────────────────────────────────────────────────────────────

export function parseInboxIds(rows: InboxRow[]): number[] {
  return rows.map((r) => Number(r.email_account_id)).filter((n) => !isNaN(n));
}

// ── Error extraction ──────────────────────────────────────────────────────────

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
