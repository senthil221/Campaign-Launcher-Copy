import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { LeadRow, SequenceRow, InboxRow } from "../lib/csv";
import { parseLeads, parseSequences } from "../lib/csv";
import {
  TEMPLATES,
  PRESET_KEYS,
  DEFAULT_CUSTOM_SCHEDULE,
  COMMON_TIMEZONES,
  DAY_LABELS,
  type TemplateKey,
  type ScheduleTemplate,
} from "../lib/templates";
import {
  loadApiConfig,
  loadCampaignSettings,
  saveCampaignSettings,
  type ApiConfig,
  type CampaignSettings,
} from "../lib/config";
import { fetchSmartleadTags, type SmartleadTag, type SmartleadTagAccount } from "../lib/tags";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileState<T> {
  file: File | null;
  data: T[] | null;
  errors: string[];
  warnings: string[];
  loading: boolean;
}

function emptyFile<T>(): FileState<T> {
  return { file: null, data: null, errors: [], warnings: [], loading: false };
}

export interface FormValues {
  campaignName: string;
  mode: "draft" | "launch";
  templateKey: TemplateKey;
  customSchedule: ScheduleTemplate;
  leads: LeadRow[];
  sequences: SequenceRow[];
  inboxes: InboxRow[];
  inboxTag: string;
  apiConfig: ApiConfig;
  campaignSettings: CampaignSettings;
}

interface Props {
  onSubmit: (values: FormValues) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function substituteVars(text: string, lead: LeadRow | null): string {
  const sample: Record<string, string> = {
    first_name: "Alex",
    last_name: "Johnson",
    company_name: "Acme Corp",
    email: "alex@acme.com",
  };
  const ctx = lead ?? (sample as LeadRow);
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] || `{{${key}}}`);
}

function tagHealthStats(accounts: SmartleadTagAccount[]) {
  const lowRep = accounts.filter(
    (a) => a.reputation !== null && (a.reputation as number) < 70
  ).length;
  const inactive = accounts.filter((a) =>
    /paused|stopped/i.test(a.status)
  ).length;
  return { lowRep, inactive, total: lowRep + inactive };
}

// ── Small primitives ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5">
      {children}
    </p>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus:outline-none ${checked ? "bg-blue-500" : "bg-zinc-700"}`}
    >
      <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-3" : "translate-x-0"}`} />
    </button>
  );
}

function SettingRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] text-zinc-300">{label}</p>
        {description && <p className="text-[11px] text-zinc-600 mt-px">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ok ? "bg-emerald-400" : "bg-zinc-700"}`} />
      <span className={`text-[11px] ${ok ? "text-zinc-300" : "text-zinc-600"}`}>{label}</span>
    </div>
  );
}

// ── Drop zones ────────────────────────────────────────────────────────────────

function DropZone({ label, hint, fileState, onFile }: { label: string; hint: string; fileState: FileState<unknown>; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const ring = fileState.errors.length
    ? "border-red-500/60 bg-red-500/5"
    : fileState.data
      ? "border-emerald-500/40 bg-emerald-500/5"
      : dragging
        ? "border-blue-500/60 bg-blue-500/5"
        : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/50";

  return (
    <div>
      <Label>{label}</Label>
      <div
        className={`rounded-md border border-dashed px-3 py-2.5 cursor-pointer transition-all ${ring}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        {fileState.loading ? (
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="h-3 w-3 rounded-full border border-zinc-700 border-t-blue-400 animate-spin" />
            Parsing…
          </div>
        ) : fileState.data ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-[12px] text-zinc-300 truncate">{fileState.file?.name}</span>
              <span className="text-[11px] text-zinc-600 shrink-0 font-mono">{fileState.data.length.toLocaleString()} rows</span>
            </div>
            <span className="text-[10px] text-zinc-600 shrink-0 ml-2">click to replace</span>
          </div>
        ) : (
          <p className="text-[12px] text-zinc-500">
            <span className="text-blue-400 font-medium">Upload</span> or drop · {hint}
          </p>
        )}
      </div>
      {fileState.errors.map((e) => <p key={e} className="text-[11px] text-red-400 mt-1">{e}</p>)}
      {fileState.warnings.map((w) => <p key={w} className="text-[11px] text-amber-400 mt-1">{w}</p>)}
    </div>
  );
}

function MultiLeadsDropZone({ files, onAddFile, onRemoveFile }: { files: FileState<LeadRow>[]; onAddFile: (f: File) => void; onRemoveFile: (i: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const totalRows = files.reduce((s, f) => s + (f.data?.length ?? 0), 0);
  const hasErrors = files.some((f) => f.errors.length > 0);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onAddFile(f);
  }, [onAddFile]);

  const ring = hasErrors ? "border-red-500/60" : files.length > 0 ? "border-emerald-500/40" : dragging ? "border-blue-500/60" : "border-zinc-800 hover:border-zinc-700";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label>Leads</Label>
        {totalRows > 0 && <span className="text-[11px] text-zinc-500 font-mono">{totalRows.toLocaleString()} total</span>}
      </div>

      {files.length > 0 && (
        <div className="space-y-1 mb-1.5">
          {files.map((f, i) => (
            <div key={i} className={`flex items-center justify-between px-3 h-8 rounded-md border ${f.errors.length ? "border-red-500/40 bg-red-500/5" : "border-zinc-800 bg-zinc-900/60"}`}>
              <div className="flex items-center gap-2 min-w-0">
                {f.loading
                  ? <span className="h-3 w-3 rounded-full border border-zinc-700 border-t-blue-400 animate-spin shrink-0" />
                  : <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${f.errors.length ? "bg-red-400" : "bg-emerald-400"}`} />}
                <span className="text-[12px] text-zinc-300 truncate">{f.file?.name}</span>
                {!f.loading && f.data && <span className="text-[11px] text-zinc-600 font-mono shrink-0">{f.data.length.toLocaleString()}</span>}
              </div>
              <button type="button" onClick={() => onRemoveFile(i)}
                className="text-zinc-600 hover:text-zinc-300 transition-colors ml-2 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`rounded-md border border-dashed px-3 py-2.5 cursor-pointer transition-all bg-zinc-900/50 ${ring}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddFile(f); e.target.value = ""; }} />
        <p className="text-[12px] text-zinc-500">
          <span className="text-blue-400 font-medium">{files.length ? "+ Add another CSV" : "Upload leads CSV"}</span>
          {!files.length && " · Required: email. Optional: first_name, last_name, company_name"}
        </p>
      </div>

      {files.flatMap((f, i) => [
        ...f.errors.map((e) => <p key={`e${i}${e}`} className="text-[11px] text-red-400 mt-1">{files.length > 1 ? `${f.file?.name}: ` : ""}{e}</p>),
        ...f.warnings.map((w) => <p key={`w${i}${w}`} className="text-[11px] text-amber-400 mt-1">{files.length > 1 ? `${f.file?.name}: ` : ""}{w}</p>),
      ])}
    </div>
  );
}

// ── Sequence preview ──────────────────────────────────────────────────────────

function SequencePreview({ sequences, sampleLead }: { sequences: SequenceRow[]; sampleLead: LeadRow | null }) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (sequences.length === 0) return null;

  const step = sequences[Math.min(active, sequences.length - 1)];
  const subject = substituteVars(step.subject || "", sampleLead);
  const body = substituteVars(step.body || "", sampleLead);
  const delay = Number(step.delay_days ?? 0);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Preview sequence · {sequences.length} step{sequences.length !== 1 ? "s" : ""}
        {sampleLead && <span className="text-zinc-700 ml-1">using {sampleLead.first_name || sampleLead.email}</span>}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden">
          {/* Step tabs */}
          <div className="flex border-b border-zinc-800 overflow-x-auto scrollbar-thin">
            {sequences.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`shrink-0 px-3 h-7 text-[11px] font-medium transition-colors border-r border-zinc-800 ${active === i ? "bg-zinc-900 text-zinc-100" : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/50"}`}
              >
                Step {s.seq_number}
              </button>
            ))}
          </div>

          {/* Step content */}
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide w-12 shrink-0">Delay</span>
              <span className="font-mono text-[11px] text-zinc-400">Day {delay}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide w-12 shrink-0 pt-px">Subject</span>
              <span className="text-[12px] text-zinc-200 leading-relaxed">{subject || <span className="text-zinc-700 italic">empty</span>}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide w-12 shrink-0 pt-px">Body</span>
              <pre className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap font-sans max-h-40 overflow-y-auto scrollbar-thin">
                {body || <span className="text-zinc-700 italic">empty</span>}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings drawer ───────────────────────────────────────────────────────────

function SettingsDrawer({ open, onClose, campaignSettings, onCampaignSettingsChange }: { open: boolean; onClose: () => void; campaignSettings: CampaignSettings; onCampaignSettingsChange: (s: CampaignSettings) => void }) {
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof CampaignSettings>(k: K, v: CampaignSettings[K]) => onCampaignSettingsChange({ ...campaignSettings, [k]: v });

  const handleSave = () => {
    saveCampaignSettings(campaignSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  if (!open) return null;

  const oooMode = campaignSettings.autoReactivateOOO && campaignSettings.reactivateOOOwithDelay === 0
    ? "immediate"
    : campaignSettings.reactivateOOOwithDelay > 0 ? "delay"
    : campaignSettings.autoCategorizeOOO ? "categorize" : "off";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[380px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-zinc-100">Campaign defaults</p>
            <p className="text-[11px] text-zinc-600 mt-px">Saved in browser · API secrets stay in Vercel</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin space-y-4">
          {/* Sending */}
          <div>
            <Label>Sending</Label>
            <div className="space-y-1">
              <p className="text-[12px] text-zinc-400">Gap between emails</p>
              <div className="flex items-center gap-2">
                <input type="number" min={3} max={120} value={campaignSettings.sendGapMinutes}
                  onChange={(e) => set("sendGapMinutes", Math.max(3, Number(e.target.value)))}
                  className="w-16 h-7 rounded border border-zinc-800 bg-zinc-900 px-2 text-[12px] text-zinc-100 font-mono focus:border-blue-500 focus:outline-none" />
                <span className="text-[11px] text-zinc-600">min · min 3</span>
              </div>
            </div>
          </div>

          {/* Tracking */}
          <div>
            <Label>Tracking</Label>
            <div className="divide-y divide-zinc-800/60">
              <SettingRow label="Track opens" description="Usually off for cold outreach" checked={campaignSettings.trackEmailOpen} onChange={(v) => set("trackEmailOpen", v)} />
              <SettingRow label="Track link clicks" description="Only if sequence has links" checked={campaignSettings.trackLinkClick} onChange={(v) => set("trackLinkClick", v)} />
            </div>
          </div>

          {/* Format */}
          <div>
            <Label>Format</Label>
            <div className="divide-y divide-zinc-800/60">
              <SettingRow label="Send as plain text" description="Lightweight, less salesy" checked={campaignSettings.sendAsPlainText} onChange={(v) => set("sendAsPlainText", v)} />
              <SettingRow label="Force plain text" description="Overrides HTML from templates" checked={campaignSettings.forcePlainText} onChange={(v) => set("forcePlainText", v)} />
            </div>
          </div>

          {/* Lead behaviour */}
          <div>
            <Label>Lead behaviour</Label>
            <div className="divide-y divide-zinc-800/60">
              <div className="py-2.5">
                <p className="text-[12px] text-zinc-400 mb-1.5">Stop lead on</p>
                <select value={campaignSettings.stopLeadSettings}
                  onChange={(e) => set("stopLeadSettings", e.target.value as CampaignSettings["stopLeadSettings"])}
                  className="w-full h-7 rounded border border-zinc-800 bg-zinc-900 px-2 text-[12px] text-zinc-200 focus:border-blue-500 focus:outline-none">
                  <option value="REPLY_TO_AN_EMAIL">Reply to an email</option>
                  <option value="CLICK_ON_UNSUBSCRIBE">Click unsubscribe</option>
                  <option value="OPEN_AN_EMAIL">Open an email</option>
                </select>
              </div>
              <SettingRow label="Pause domain on reply" description="Pauses other leads at same company" checked={campaignSettings.autoPauseDomainLeadsOnReply} onChange={(v) => set("autoPauseDomainLeadsOnReply", v)} />
            </div>
          </div>

          {/* OOO */}
          <div>
            <Label>Out of office</Label>
            <div className="divide-y divide-zinc-800/60">
              <SettingRow label="Ignore OOO as reply" description="OOO won't stop the sequence" checked={campaignSettings.ignoreOOOasReply} onChange={(v) => set("ignoreOOOasReply", v)} />
              <div className="py-2.5 space-y-1.5">
                <p className="text-[12px] text-zinc-400">Reactivation mode</p>
                {([
                  { label: "Auto-reactivate immediately", value: "immediate" },
                  { label: "Reactivate after delay", value: "delay" },
                  { label: "Auto-categorize only", value: "categorize" },
                  { label: "Off", value: "off" },
                ] as const).map(({ label, value }) => (
                  <button key={value} type="button"
                    onClick={() => {
                      if (value === "immediate") onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: true, reactivateOOOwithDelay: 0, autoCategorizeOOO: false });
                      else if (value === "delay") onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: false, reactivateOOOwithDelay: campaignSettings.reactivateOOOwithDelay || 3, autoCategorizeOOO: false });
                      else if (value === "categorize") onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: false, reactivateOOOwithDelay: 0, autoCategorizeOOO: true });
                      else onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: false, reactivateOOOwithDelay: 0, autoCategorizeOOO: false });
                    }}
                    className={`w-full text-left px-2.5 h-7 rounded text-[12px] border transition-colors ${oooMode === value ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"}`}>
                    {label}
                  </button>
                ))}
                {campaignSettings.reactivateOOOwithDelay > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-zinc-600">Delay</span>
                    <input type="number" min={1} max={30} value={campaignSettings.reactivateOOOwithDelay}
                      onChange={(e) => set("reactivateOOOwithDelay", Math.max(1, Number(e.target.value)))}
                      className="w-14 h-7 rounded border border-zinc-800 bg-zinc-900 px-2 text-[12px] text-zinc-100 font-mono focus:border-blue-500 focus:outline-none" />
                    <span className="text-[11px] text-zinc-600">days</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800 px-4 py-3">
          <button onClick={handleSave}
            className={`w-full h-8 rounded text-[13px] font-medium transition-colors ${saved ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "bg-blue-500 text-white hover:bg-blue-400"}`}>
            {saved ? "Saved" : "Save defaults"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Custom schedule editor ────────────────────────────────────────────────────

function CustomScheduleEditor({ schedule, onChange }: { schedule: ScheduleTemplate; onChange: (s: ScheduleTemplate) => void }) {
  const set = <K extends keyof ScheduleTemplate>(k: K, v: ScheduleTemplate[K]) => onChange({ ...schedule, [k]: v });
  const toggleDay = (day: number) => {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day].sort((a, b) => a - b);
    set("days", days);
  };

  return (
    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 space-y-3">
      <div>
        <Label>Timezone</Label>
        <select value={schedule.timezone} onChange={(e) => set("timezone", e.target.value)}
          className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[12px] text-zinc-200 focus:border-blue-500 focus:outline-none">
          {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div>
        <Label>Send days</Label>
        <div className="flex gap-1">
          {DAY_LABELS.map((label, idx) => (
            <button key={idx} type="button" onClick={() => toggleDay(idx)}
              className={`flex-1 h-7 rounded text-[11px] font-medium transition-colors ${schedule.days.includes(idx) ? "bg-blue-500/20 border border-blue-500/50 text-blue-300" : "border border-zinc-800 bg-zinc-950 text-zinc-600 hover:border-zinc-700"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>Start</Label>
          <input type="time" value={schedule.start} onChange={(e) => set("start", e.target.value)}
            className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[12px] text-zinc-200 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <Label>End</Label>
          <input type="time" value={schedule.end} onChange={(e) => set("end", e.target.value)}
            className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[12px] text-zinc-200 focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <Label>Max/day</Label>
          <input type="number" min={1} max={500} value={schedule.maxLeads}
            onChange={(e) => set("maxLeads", Math.max(1, Number(e.target.value)))}
            className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[12px] text-zinc-200 font-mono focus:border-blue-500 focus:outline-none" />
        </div>
      </div>
    </div>
  );
}

// ── Tag picker ────────────────────────────────────────────────────────────────

function TagPicker({ tags, selectedTag, query, loading, progress, error, onQuery, onSelect, onRefresh }: {
  tags: SmartleadTag[];
  selectedTag: string;
  query: string;
  loading: boolean;
  progress: number;
  error: string;
  onQuery: (v: string) => void;
  onSelect: (v: string) => void;
  onRefresh: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  }, [query, tags]);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-zinc-800">
        <div>
          <p className="text-[12px] font-semibold text-zinc-200">Inbox tag</p>
          <p className="text-[10px] text-zinc-600 mt-px">Select a tag · accounts load on selection</p>
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="h-6 px-2.5 rounded border border-zinc-700 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40 transition-colors shrink-0">
          {loading ? "Syncing…" : "Refresh"}
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        <input type="text" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search tags…"
          className="w-full h-7 rounded border border-zinc-800 bg-zinc-950 px-2.5 text-[12px] text-zinc-200 placeholder-zinc-700 focus:border-blue-500 focus:outline-none" />

        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-400">{error}</div>
        )}

        <div className="max-h-[300px] space-y-1 overflow-y-auto pr-0.5 scrollbar-thin">
          {loading && tags.length === 0 ? (
            <div className="py-5 text-center space-y-1.5">
              <div className="flex items-center justify-center gap-2 text-[12px] text-zinc-500">
                <span className="h-3 w-3 rounded-full border border-zinc-700 border-t-blue-400 animate-spin" />
                {progress > 0 ? `${progress.toLocaleString()} accounts scanned…` : "Connecting to Smartlead…"}
              </div>
              {progress > 0 && (
                <p className="text-[10px] text-zinc-700">Building tag index — this runs once then caches</p>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-zinc-600">No tags found</div>
          ) : filtered.map((tag) => {
            const active = selectedTag === tag.name;
            return (
              <button key={tag.name} type="button" onClick={() => onSelect(tag.name)}
                className={`w-full rounded px-2.5 py-2 text-left transition-colors ${active ? "bg-blue-500/10 border border-blue-500/40" : "border border-transparent hover:bg-zinc-800/60"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[12px] font-medium truncate ${active ? "text-blue-200" : "text-zinc-300"}`}>{tag.name}</span>
                  {tag.count != null && (
                    <span className={`font-mono text-[11px] shrink-0 ${active ? "text-blue-300" : "text-zinc-500"}`}>{tag.count}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Selected tag health panel ─────────────────────────────────────────────────

function SelectedTagPanel({ tagName, accounts, domainCount, avgRep, loading, error }: {
  tagName: string;
  accounts: SmartleadTagAccount[];
  domainCount: number;
  avgRep: number | null;
  loading: boolean;
  error: string;
}) {
  const health = tagHealthStats(accounts);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-semibold">Selected tag</p>
          <p className="text-[13px] font-semibold text-zinc-100 mt-0.5 truncate">{tagName}</p>
        </div>
        {!loading && health.total > 0 && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            {health.total} at-risk
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-zinc-600 py-1">
          <span className="h-3 w-3 rounded-full border border-zinc-700 border-t-blue-400 animate-spin" />
          Loading accounts…
        </div>
      ) : error ? (
        <p className="text-[11px] text-red-400">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "accounts", value: accounts.length.toLocaleString() },
              { label: "domains", value: domainCount.toLocaleString() },
              { label: "avg rep", value: avgRep !== null ? `${avgRep}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded bg-zinc-900 px-2 py-1.5 text-center">
                <p className="font-mono text-[13px] font-medium text-zinc-100">{value}</p>
                <p className="text-[9px] uppercase tracking-wide text-zinc-600 mt-px">{label}</p>
              </div>
            ))}
          </div>
          {health.total > 0 && (
            <div className="space-y-1">
              {health.lowRep > 0 && <p className="text-[11px] text-amber-600/90">⚠ {health.lowRep} account{health.lowRep !== 1 ? "s" : ""} below 70% warmup reputation</p>}
              {health.inactive > 0 && <p className="text-[11px] text-amber-600/90">⚠ {health.inactive} account{health.inactive !== 1 ? "s" : ""} paused or stopped</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function LaunchForm({ onSubmit }: Props) {
  const apiConfig = useMemo(() => loadApiConfig(), []);
  const [campaignName, setCampaignName] = useState("");
  const [mode, setMode] = useState<"draft" | "launch">("draft");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("standard");
  const [customSchedule, setCustomSchedule] = useState<ScheduleTemplate>(DEFAULT_CUSTOM_SCHEDULE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings>(loadCampaignSettings);

  const [leadsFiles, setLeadsFiles] = useState<FileState<LeadRow>[]>([]);
  const [seqState, setSeqState] = useState<FileState<SequenceRow>>(emptyFile);

  const [tags, setTags] = useState<SmartleadTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsProgress, setTagsProgress] = useState(0);
  const [tagsError, setTagsError] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTagName, setSelectedTagName] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");

  const refreshTags = useCallback(async (force = false) => {
    setTagsLoading(true);
    setTagsProgress(0);
    setTagsError("");
    try {
      const result = await fetchSmartleadTags(force, (loaded) => setTagsProgress(loaded));
      setTags(result.tags);
      setFetchedAt(result.fetchedAt);
      setSelectedTagName((cur) => cur && result.tags.some((t) => t.name === cur) ? cur : "");
    } catch (err) {
      setTagsError(err instanceof Error ? err.message : "Unable to fetch tags.");
    } finally {
      setTagsLoading(false);
      setTagsProgress(0);
    }
  }, []);

  useEffect(() => { void refreshTags(false); }, [refreshTags]);

  const handleAddLeads = async (file: File) => {
    setLeadsFiles((prev) => [...prev, { file, data: null, errors: [], warnings: [], loading: true }]);
    const result = await parseLeads(file);
    setLeadsFiles((prev) => {
      let idx = -1; for (let i = prev.length - 1; i >= 0; i--) { if (prev[i].file === file) { idx = i; break; } }
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { file, ...result, loading: false };
      return next;
    });
  };

  const handleSeq = async (file: File) => {
    setSeqState({ file, data: null, errors: [], warnings: [], loading: true });
    const result = await parseSequences(file);
    setSeqState({ file, ...result, loading: false });
  };

  const selectedTag = useMemo(() => tags.find((t) => t.name === selectedTagName) ?? null, [selectedTagName, tags]);
  const selectedAccounts = selectedTag?.accounts ?? [];
  const selectedDomains = useMemo(() => new Set(selectedAccounts.map((a) => a.domain).filter(Boolean)).size, [selectedAccounts]);
  const selectedAvgRep = useMemo(() => {
    const reps = selectedAccounts.map((a) => a.reputation).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!reps.length) return null;
    return Math.round(reps.reduce((s, v) => s + v, 0) / reps.length);
  }, [selectedAccounts]);

  const sampleLead = useMemo(() => {
    for (const f of leadsFiles) { if (f.data && f.data.length > 0) return f.data[0]; }
    return null;
  }, [leadsFiles]);

  const leadsReady = leadsFiles.length > 0 && leadsFiles.every((f) => f.data !== null && !f.loading);
  const sequenceReady = seqState.data !== null && !seqState.loading;
  const totalLeads = leadsFiles.reduce((s, f) => s + (f.data?.length ?? 0), 0);
  const sequenceCount = seqState.data?.length ?? 0;
  const inboxRequired = mode === "launch";
  const inboxReady = selectedAccounts.length > 0;
  const hasErrors = leadsFiles.some((f) => f.errors.length > 0) || seqState.errors.length > 0;
  const canSubmit = campaignName.trim().length > 0 && leadsReady && sequenceReady && !hasErrors && (inboxReady || !inboxRequired);

  const submitLabel = !campaignName.trim() ? "Enter a campaign name"
    : !leadsReady || !sequenceReady ? "Upload leads & sequence"
    : hasErrors ? "Fix CSV errors above"
    : inboxRequired && !inboxReady ? "Select a Smartlead tag"
    : mode === "launch" ? "Launch campaign →"
    : "Save as draft →";

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      campaignName: campaignName.trim(),
      mode,
      templateKey,
      customSchedule,
      leads: leadsFiles.flatMap((f) => f.data ?? []),
      sequences: seqState.data ?? [],
      inboxes: selectedAccounts.map((a) => ({ email_account_id: String(a.id), from_email: a.email })),
      inboxTag: selectedTagName,
      apiConfig,
      campaignSettings,
    });
  };

  return (
    <>
      <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        campaignSettings={campaignSettings} onCampaignSettingsChange={setCampaignSettings} />

      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        {/* Top bar */}
        <div className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto max-w-[1120px] px-5 h-11 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded bg-blue-500 flex items-center justify-center shrink-0">
                <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">B2BDrive</span>
              <span className="text-zinc-800">/</span>
              <span className="text-[13px] font-semibold text-zinc-200">Campaign Launcher</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-zinc-500">API server-side</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${tagsError ? "bg-red-400" : tagsLoading ? "bg-amber-400 animate-pulse" : tags.length > 0 ? "bg-emerald-400" : "bg-zinc-600"}`} />
                <span className="text-[11px] text-zinc-500">{tagsLoading ? (tagsProgress > 0 ? `${tagsProgress.toLocaleString()} accounts…` : "Connecting…") : tagsError ? "Tag error" : tags.length > 0 ? `${tags.length} tags` : "No tags"}</span>
              </div>
              <button onClick={() => setDrawerOpen(true)}
                className="h-6 px-2.5 rounded border border-zinc-800 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors">
                Defaults · {campaignSettings.sendGapMinutes}m gap
              </button>
            </div>
          </div>
        </div>

        {/* Main layout */}
        <div className="mx-auto max-w-[1120px] px-5 py-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">

            {/* ── Left column ── */}
            <div className="space-y-4">

              {/* Campaign name + mode */}
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                  <div>
                    <Label>Campaign name</Label>
                    <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g. Q2 Outbound — SaaS Founders"
                      className="w-full h-8 rounded border border-zinc-800 bg-zinc-950 px-3 text-[13px] text-zinc-100 placeholder-zinc-700 focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                  <div>
                    <Label>Mode</Label>
                    <div className="flex gap-1.5 h-8">
                      {(["draft", "launch"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => setMode(m)}
                          className={`flex-1 rounded text-[12px] font-medium border transition-colors ${mode === m ? m === "draft" ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"}`}>
                          {m === "draft" ? "Draft" : "Launch"}
                        </button>
                      ))}
                    </div>
                    {mode === "launch" && <p className="text-[10px] text-amber-500/70 mt-1">Goes live immediately after upload</p>}
                  </div>
                </div>
              </div>

              {/* Files */}
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                <Label>Files</Label>
                <MultiLeadsDropZone files={leadsFiles} onAddFile={handleAddLeads} onRemoveFile={(i) => setLeadsFiles((prev) => prev.filter((_, idx) => idx !== i))} />
                <div>
                  <DropZone label="Sequence" hint="seq_number, subject, body, delay_days" fileState={seqState as FileState<unknown>} onFile={handleSeq} />
                  {sequenceReady && seqState.data && (
                    <SequencePreview sequences={seqState.data} sampleLead={sampleLead} />
                  )}
                </div>
              </div>

              {/* Schedule */}
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
                <Label>Schedule</Label>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {PRESET_KEYS.map((key) => {
                    const t = TEMPLATES[key];
                    return (
                      <button key={key} type="button" onClick={() => setTemplateKey(key)}
                        className={`rounded p-2.5 text-left border transition-colors ${templateKey === key ? "border-blue-500/50 bg-blue-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}>
                        <p className={`text-[12px] font-semibold ${templateKey === key ? "text-blue-300" : "text-zinc-300"}`}>{t.label}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">{t.maxLeads}/day</p>
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setTemplateKey("custom")}
                    className={`rounded p-2.5 text-left border transition-colors ${templateKey === "custom" ? "border-purple-500/50 bg-purple-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}>
                    <p className={`text-[12px] font-semibold ${templateKey === "custom" ? "text-purple-300" : "text-zinc-300"}`}>Custom</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">Configure</p>
                  </button>
                </div>
                {templateKey === "custom" && <CustomScheduleEditor schedule={customSchedule} onChange={setCustomSchedule} />}
              </div>
            </div>

            {/* ── Right column (sticky) ── */}
            <div className="space-y-4 lg:sticky lg:top-[52px] lg:self-start lg:max-h-[calc(100vh-76px)] lg:overflow-y-auto lg:pr-0.5 scrollbar-thin">

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Leads", value: totalLeads > 0 ? totalLeads.toLocaleString() : "—", ok: leadsReady },
                  { label: "Steps", value: sequenceCount > 0 ? String(sequenceCount) : "—", ok: sequenceReady },
                  { label: "Inboxes", value: selectedAccounts.length > 0 ? selectedAccounts.length.toLocaleString() : "—", ok: inboxReady },
                ].map(({ label, value, ok }) => (
                  <div key={label} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600 font-semibold">{label}</p>
                    <p className={`font-mono text-[18px] font-semibold mt-0.5 ${ok ? "text-zinc-100" : "text-zinc-600"}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Tag picker */}
              <TagPicker tags={tags} selectedTag={selectedTagName} query={tagQuery} loading={tagsLoading}
                progress={tagsProgress} error={tagsError} onQuery={setTagQuery} onSelect={setSelectedTagName}
                onRefresh={() => { void refreshTags(true); }} />

              {selectedTag && (
                <SelectedTagPanel
                  tagName={selectedTag.name}
                  accounts={selectedAccounts}
                  domainCount={selectedDomains}
                  avgRep={selectedAvgRep}
                  loading={false}
                  error=""
                />
              )}

              {/* Launch check */}
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-zinc-200">Launch check</p>
                  {fetchedAt && (
                    <span className="text-[10px] text-zinc-700">synced {new Date(fetchedAt).toLocaleTimeString()}</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <CheckItem ok={campaignName.trim().length > 0} label="Campaign named" />
                  <CheckItem ok={leadsReady} label="Leads uploaded" />
                  <CheckItem ok={sequenceReady} label="Sequence uploaded" />
                  <CheckItem ok={inboxReady || !inboxRequired} label={inboxRequired ? "Tag selected" : "Tag (optional in draft)"} />
                </div>

                <button onClick={handleSubmit} disabled={!canSubmit}
                  className={`w-full h-9 rounded text-[13px] font-semibold transition-colors ${
                    canSubmit
                      ? mode === "launch"
                        ? "bg-emerald-500 text-white hover:bg-emerald-400 shadow-sm shadow-emerald-500/20"
                        : "bg-blue-500 text-white hover:bg-blue-400 shadow-sm shadow-blue-500/20"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  }`}>
                  {submitLabel}
                </button>

                <p className="text-center text-[10px] text-zinc-800">B2BDrive · server-secured launcher</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
