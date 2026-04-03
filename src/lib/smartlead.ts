import axios from "axios";
import type { SequenceRow, LeadRow, InboxRow } from "./csv";
import type { ScheduleTemplate } from "./templates";
import type { CampaignSettings, ApiConfig } from "./config";
import { settingsToApiPayload } from "./config";

// ── Client factory — reads fresh config on each pipeline run ──────────────────

function makeClient(cfg: ApiConfig) {
  const client = axios.create({ baseURL: cfg.baseUrl });
  const p = () => ({ api_key: cfg.apiKey });
  return { client, p };
}

// ── Response types ────────────────────────────────────────────────────────────

export interface CreateCampaignResponse {
  id: number;
  name: string;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function createCampaign(
  name: string,
  cfg: ApiConfig
): Promise<CreateCampaignResponse> {
  const { client, p } = makeClient(cfg);
  const { data } = await client.post<CreateCampaignResponse>(
    "/campaigns/create",
    { name },
    { params: p() }
  );
  return data;
}

export async function saveSequences(
  campaignId: number,
  rows: SequenceRow[],
  cfg: ApiConfig
): Promise<void> {
  const { client, p } = makeClient(cfg);
  const sequences = rows
    .filter((r) => Number.isInteger(Number(r.seq_number)) && Number(r.seq_number) >= 1)
    .map((r) => ({
      seq_number: Number(r.seq_number),
      subject: r.subject,
      email_body: r.body.replace(/\r?\n/g, "<br>"),
      seq_delay_details: { delay_in_days: Number(r.delay_days) },
    }));
  await client.post(
    `/campaigns/${campaignId}/sequences`,
    { sequences },
    { params: p() }
  );
}

export async function addInboxBatch(
  campaignId: number,
  emailAccountIds: number[],
  cfg: ApiConfig
): Promise<void> {
  const { client, p } = makeClient(cfg);
  await client.post(
    `/campaigns/${campaignId}/email-accounts`,
    { email_account_ids: emailAccountIds },
    { params: p() }
  );
}

export async function setSchedule(
  campaignId: number,
  template: ScheduleTemplate,
  sendGapMinutes: number,
  cfg: ApiConfig
): Promise<void> {
  const { client, p } = makeClient(cfg);
  await client.post(
    `/campaigns/${campaignId}/schedule`,
    {
      timezone: template.timezone,
      days_of_the_week: template.days,
      start_hour: template.start,
      end_hour: template.end,
      min_time_btw_emails: sendGapMinutes,
      max_new_leads_per_day: template.maxLeads,
    },
    { params: p() }
  );
}

export async function applySettings(
  campaignId: number,
  settings: CampaignSettings,
  cfg: ApiConfig
): Promise<void> {
  const { client, p } = makeClient(cfg);
  await client.post(
    `/campaigns/${campaignId}/settings`,
    settingsToApiPayload(settings),
    { params: p() }
  );
}

export interface UploadLeadBatchResult {
  added_count: number;
  skipped_count: number;
  skipped_leads: { email: string; reason: string }[];
}

export async function uploadLeadBatch(
  campaignId: number,
  leads: LeadRow[],
  cfg: ApiConfig
): Promise<UploadLeadBatchResult> {
  const { client, p } = makeClient(cfg);
  const ALLOWED = new Set(["email", "first_name", "last_name", "company_name", "location"]);
  const lead_list = leads.map((lead) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(lead)) {
      if (ALLOWED.has(k)) clean[k] = v;
    }
    return clean;
  });

  const { data } = await client.post<UploadLeadBatchResult>(
    `/campaigns/${campaignId}/leads`,
    {
      lead_list,
      settings: {
        ignore_global_block_list: false,
        ignore_unsubscribe_list: false,
        ignore_duplicate_leads_in_other_campaign: false,
      },
    },
    { params: p() }
  );
  return data;
}

export async function activateCampaign(
  campaignId: number,
  cfg: ApiConfig
): Promise<void> {
  const { client, p } = makeClient(cfg);
  await client.post(
    `/campaigns/${campaignId}/status`,
    { status: "START" },
    { params: p() }
  );
}

// ── Inbox helper ──────────────────────────────────────────────────────────────

export function parseInboxIds(rows: InboxRow[]): number[] {
  return rows.map((r) => Number(r.email_account_id)).filter((n) => !isNaN(n));
}

// ── Error extraction ──────────────────────────────────────────────────────────

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (d.message) return String(d.message);
      if (d.error) return String(d.error);
      return JSON.stringify(data);
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
