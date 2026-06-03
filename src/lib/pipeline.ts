import type { LeadRow, SequenceRow, InboxRow } from "./csv";
import { chunkArray } from "./csv";
import type { TemplateKey, ScheduleTemplate } from "./templates";
import { TEMPLATES } from "./templates";
import type { CampaignSettings } from "./config";
import {
  createCampaign,
  saveSequences,
  addInboxBatch,
  setSchedule,
  applySettings,
  uploadLeadBatch,
  activateCampaign,
  parseInboxIds,
  extractErrorMessage,
} from "./smartlead";

// ── Step definitions ──────────────────────────────────────────────────────────

export type StepId =
  | "parse"
  | "create"
  | "sequences"
  | "inboxes"
  | "schedule"
  | "settings"
  | "leads"
  | "activate";

export type StepStatus = "waiting" | "running" | "done" | "error" | "skipped";

export interface StepState {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

export interface SkippedLead {
  email: string;
  reason: string;
}

export interface PipelineUpdate {
  steps: StepState[];
  campaignId?: number;
  skippedLeads?: SkippedLead[];
}

export interface PipelineInput {
  campaignName: string;
  mode: "draft" | "launch";
  templateKey: TemplateKey;
  customSchedule: ScheduleTemplate;
  sendGap: number;
  leads: LeadRow[];
  sequences: SequenceRow[];
  inboxes: InboxRow[];
  inboxTag: string;
  campaignSettings: CampaignSettings;
  // For retry
  resumeFromStep?: StepId;
  existingCampaignId?: number;
}

const STEP_ORDER: StepId[] = [
  "parse",
  "create",
  "sequences",
  "inboxes",
  "schedule",
  "settings",
  "leads",
  "activate",
];

const STEP_LABELS: Record<StepId, string> = {
  parse: "Parsing inputs",
  create: "Creating campaign",
  sequences: "Saving sequences",
  inboxes: "Adding inboxes",
  schedule: "Setting schedule",
  settings: "Applying settings",
  leads: "Uploading leads",
  activate: "Activating",
};

function makeInitialSteps(): StepState[] {
  return STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: "waiting" }));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Resolve schedule template ─────────────────────────────────────────────────

function resolveTemplate(input: PipelineInput): ScheduleTemplate {
  if (input.templateKey === "custom") return input.customSchedule;
  return TEMPLATES[input.templateKey];
}

// ── The pipeline as an async generator ───────────────────────────────────────

export async function* runPipeline(
  input: PipelineInput
): AsyncGenerator<PipelineUpdate> {
  const steps = makeInitialSteps();
  let campaignId = input.existingCampaignId ?? 0;
  const emit = (extra?: Partial<PipelineUpdate>): PipelineUpdate => ({
    steps: steps.map((s) => ({ ...s })),
    campaignId: campaignId || undefined,
    ...extra,
  });

  const startStep = input.resumeFromStep ?? "parse";
  const startIndex = STEP_ORDER.indexOf(startStep);

  for (let i = 0; i < startIndex; i++) steps[i].status = "done";
  yield emit();

  const step = (id: StepId) => steps.find((s) => s.id === id)!;

  // ── STEP 1: PARSE ────────────────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("parse")) {
    const s = step("parse");
    s.status = "running";
    yield emit();
    s.status = "done";
    s.detail = `${input.leads.length.toLocaleString()} leads · ${input.sequences.length} steps · ${input.inboxes.length} inboxes`;
    yield emit();
  }

  // ── STEP 2: CREATE CAMPAIGN ──────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("create")) {
    const s = step("create");
    s.status = "running";
    yield emit();
    try {
      const result = await createCampaign(input.campaignName);
      campaignId = result.id;
      s.status = "done";
      s.detail = `ID: ${campaignId}`;
      yield emit({ campaignId });
    } catch (err) {
      s.status = "error";
      s.error = extractErrorMessage(err);
      yield emit({ campaignId });
      return;
    }
  }

  // ── STEP 3: SAVE SEQUENCES ───────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("sequences")) {
    const s = step("sequences");
    s.status = "running";
    yield emit({ campaignId });
    try {
      await saveSequences(campaignId, input.sequences);
      s.status = "done";
      s.detail = `${input.sequences.length} sequence step(s)`;
      yield emit({ campaignId });
    } catch (err) {
      s.status = "error";
      s.error = extractErrorMessage(err);
      yield emit({ campaignId });
      return;
    }
  }

  // ── STEP 4: ADD INBOXES ──────────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("inboxes")) {
    const s = step("inboxes");
    const allInboxIds = parseInboxIds(input.inboxes);
    const INBOX_LIMIT = 2500;
    const inboxIds = allInboxIds.slice(0, INBOX_LIMIT);
    const trimmed = allInboxIds.length - inboxIds.length;
    if (inboxIds.length === 0) {
      s.status = "skipped";
      s.detail = "none — skipped for draft";
      yield emit({ campaignId });
    } else {
      s.status = "running";
      yield emit({ campaignId });
      const batches = chunkArray(inboxIds, 25);
      try {
        for (let i = 0; i < batches.length; i++) {
          await addInboxBatch(campaignId, batches[i]);
          s.detail = `batch ${i + 1} of ${batches.length} ✓`;
          yield emit({ campaignId });
        }
        s.status = "done";
        s.detail = trimmed > 0
          ? `${inboxIds.length} inboxes added · ${trimmed} trimmed (2500 limit) · ${input.inboxTag}`
          : `${inboxIds.length} inboxes added · ${input.inboxTag}`;
        yield emit({ campaignId });
      } catch (err) {
        s.status = "error";
        s.error = extractErrorMessage(err);
        yield emit({ campaignId });
        return;
      }
    }
  }

  // ── STEP 5: SET SCHEDULE ─────────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("schedule")) {
    const s = step("schedule");
    s.status = "running";
    yield emit({ campaignId });
    try {
      const template = resolveTemplate(input);
      await setSchedule(campaignId, template, Math.max(3, input.sendGap));
      s.status = "done";
      s.detail = `${template.timezone} · ${template.start}–${template.end} · gap ${input.sendGap} min`;
      yield emit({ campaignId });
    } catch (err) {
      s.status = "error";
      s.error = extractErrorMessage(err);
      yield emit({ campaignId });
      return;
    }
  }

  // ── STEP 6: APPLY SETTINGS ───────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("settings")) {
    const s = step("settings");
    s.status = "running";
    yield emit({ campaignId });
    try {
      await applySettings(campaignId, input.campaignSettings);
      s.status = "done";
      yield emit({ campaignId });
    } catch (err) {
      s.status = "error";
      s.error = extractErrorMessage(err);
      yield emit({ campaignId });
      return;
    }
  }

  // ── STEP 7: UPLOAD LEADS ─────────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("leads")) {
    const s = step("leads");
    s.status = "running";
    yield emit({ campaignId });
    const batches = chunkArray(input.leads, 100);
    let totalAdded = 0;
    let totalSkipped = 0;
    let lastError = "";
    const allSkippedLeads: SkippedLead[] = [];
    try {
      for (let i = 0; i < batches.length; i++) {
        let result: Awaited<ReturnType<typeof uploadLeadBatch>> | null = null;
        try {
          result = await uploadLeadBatch(campaignId, batches[i]);
        } catch (err) {
          await sleep(2000);
          try {
            result = await uploadLeadBatch(campaignId, batches[i]);
          } catch (retryErr) {
            lastError = extractErrorMessage(retryErr);
            console.warn(`Lead batch ${i + 1} failed after retry:`, lastError);
          }
        }
        if (result) {
          totalAdded += result.added_count ?? batches[i].length;
          totalSkipped += result.skipped_count ?? 0;
          if (result.skipped_leads?.length) allSkippedLeads.push(...result.skipped_leads);
        }
        s.detail = `batch ${i + 1} of ${batches.length} ✓`;
        yield emit({ campaignId });
        if (i < batches.length - 1) await sleep(500);
      }
      if (lastError && totalAdded === 0) {
        s.status = "error";
        s.error = `Upload failed: ${lastError}`;
      } else {
        s.status = "done";
        const parts = [`${totalAdded.toLocaleString()} leads uploaded`];
        if (totalSkipped > 0) parts.push(`${totalSkipped.toLocaleString()} skipped (block list / duplicates)`);
        s.detail = parts.join(" · ");
      }
      yield emit({ campaignId, skippedLeads: allSkippedLeads });
    } catch (err) {
      s.status = "error";
      s.error = extractErrorMessage(err);
      yield emit({ campaignId });
      return;
    }
  }

  // ── STEP 8: ACTIVATE ─────────────────────────────────────────────────────

  if (startIndex <= STEP_ORDER.indexOf("activate")) {
    const s = step("activate");
    if (input.mode === "draft") {
      s.status = "skipped";
      s.detail = "Skipped — saved as draft";
      yield emit({ campaignId });
      return;
    }
    s.status = "running";
    yield emit({ campaignId });
    try {
      await activateCampaign(campaignId);
      s.status = "done";
      yield emit({ campaignId });
    } catch (err) {
      s.status = "error";
      s.error = extractErrorMessage(err);
      yield emit({ campaignId });
      return;
    }
  }
}
