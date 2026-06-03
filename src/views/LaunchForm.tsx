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
import { fetchSmartleadTags, type SmartleadTag } from "../lib/tags";

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

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? "bg-blue-500" : "bg-gray-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 font-semibold">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500 truncate">{hint}</p>}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${ok ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-gray-800 bg-gray-900 text-gray-500"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-400" : "bg-gray-600"}`} />
      {label}
    </div>
  );
}

// ── File upload components ───────────────────────────────────────────────────

interface DropZoneProps {
  label: string;
  hint: string;
  fileState: FileState<unknown>;
  onFile: (file: File) => void;
}

function DropZone({ label, hint, fileState, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const border = fileState.errors.length
    ? "border-red-500 bg-red-500/5"
    : fileState.data
      ? "border-green-500 bg-green-500/5"
      : dragging
        ? "border-blue-400 bg-blue-500/5"
        : "border-gray-800 bg-gray-900/70 hover:border-gray-600";

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <div
        className={`relative rounded-xl border-2 border-dashed px-4 py-4 transition-all cursor-pointer ${border}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {fileState.loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-600 border-t-blue-400 animate-spin" />
            Parsing CSV…
          </div>
        ) : fileState.data ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{fileState.file?.name}</p>
              <p className="text-xs text-green-400">{fileState.data.length.toLocaleString()} rows ready</p>
            </div>
            <span className="rounded-md bg-green-500/10 border border-green-500/30 px-2 py-1 text-xs font-semibold text-green-300">Ready</span>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-300"><span className="text-blue-400 font-semibold">Click to upload</span> or drag and drop</p>
            <p className="text-xs text-gray-600 mt-0.5">{hint}</p>
          </div>
        )}
      </div>
      {fileState.errors.map((error) => (
        <p key={error} className="text-xs text-red-400">{error}</p>
      ))}
      {fileState.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-400">{warning}</p>
      ))}
    </div>
  );
}

interface MultiLeadsDropZoneProps {
  files: FileState<LeadRow>[];
  onAddFile: (file: File) => void;
  onRemoveFile: (index: number) => void;
}

function MultiLeadsDropZone({ files, onAddFile, onRemoveFile }: MultiLeadsDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onAddFile(file);
    },
    [onAddFile]
  );

  const totalRows = files.reduce((sum, file) => sum + (file.data?.length ?? 0), 0);
  const hasErrors = files.some((file) => file.errors.length > 0);
  const border = hasErrors
    ? "border-red-500 bg-red-500/5"
    : files.length > 0
      ? "border-green-500 bg-green-500/5"
      : dragging
        ? "border-blue-400 bg-blue-500/5"
        : "border-gray-800 bg-gray-900/70 hover:border-gray-600";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-gray-300">Lead lists</label>
        {totalRows > 0 && <span className="text-xs text-gray-500">{totalRows.toLocaleString()} total leads</span>}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div key={`${file.file?.name ?? "lead"}-${index}`} className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${file.errors.length ? "border-red-500/50 bg-red-500/5" : "border-gray-800 bg-gray-900/80"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{file.file?.name}</p>
                <p className="text-xs text-gray-500">
                  {file.loading ? "Parsing…" : file.data ? `${file.data.length.toLocaleString()} rows` : "Needs attention"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-200"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`relative rounded-xl border-2 border-dashed px-4 py-4 transition-all cursor-pointer ${border}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onAddFile(file);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-gray-300">
          <span className="text-blue-400 font-semibold">{files.length ? "Add another CSV" : "Upload leads CSV"}</span>
        </p>
        <p className="text-xs text-gray-600 mt-0.5">Required: email. Optional: first_name, last_name, company_name.</p>
      </div>

      {files.flatMap((file, index) => [
        ...file.errors.map((error) => (
          <p key={`e-${index}-${error}`} className="text-xs text-red-400">{file.file?.name}: {error}</p>
        )),
        ...file.warnings.map((warning) => (
          <p key={`w-${index}-${warning}`} className="text-xs text-amber-400">{file.file?.name}: {warning}</p>
        )),
      ])}
    </div>
  );
}

// ── Settings Drawer ───────────────────────────────────────────────────────────

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  campaignSettings: CampaignSettings;
  onCampaignSettingsChange: (s: CampaignSettings) => void;
}

function SettingsDrawer({ open, onClose, campaignSettings, onCampaignSettingsChange }: SettingsDrawerProps) {
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]) =>
    onCampaignSettingsChange({ ...campaignSettings, [key]: value });

  const handleSave = () => {
    saveCampaignSettings(campaignSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[430px] flex-col overflow-hidden border-l border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">Campaign defaults</p>
            <p className="text-xs text-gray-500">Saved in this browser. API secrets stay in Vercel.</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200">Close</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-2 pb-1">Sending</p>
            <div className="py-3">
              <label className="text-sm text-gray-200 block mb-0.5">Gap between emails <span className="text-gray-500 font-normal">(minutes)</span></label>
              <p className="text-xs text-gray-500 mb-2">Time between individual emails, not the campaign window.</p>
              <input
                type="number"
                min={3}
                max={120}
                value={campaignSettings.sendGapMinutes}
                onChange={(e) => set("sendGapMinutes", Math.max(3, Number(e.target.value)))}
                className="w-24 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-gray-600 ml-2">min</span>
            </div>

            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-2 pb-1">Tracking</p>
            <div className="divide-y divide-gray-800/60">
              <SettingRow label="Track email opens" description="Usually off for safer cold outreach" checked={campaignSettings.trackEmailOpen} onChange={(v) => set("trackEmailOpen", v)} />
              <SettingRow label="Track link clicks" description="Usually off unless the sequence needs links" checked={campaignSettings.trackLinkClick} onChange={(v) => set("trackLinkClick", v)} />
            </div>

            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-4 pb-1">Format</p>
            <div className="divide-y divide-gray-800/60">
              <SettingRow label="Send as plain text" description="Keeps emails lightweight and less salesy" checked={campaignSettings.sendAsPlainText} onChange={(v) => set("sendAsPlainText", v)} />
              <SettingRow label="Force plain text" description="Overrides HTML from uploaded templates" checked={campaignSettings.forcePlainText} onChange={(v) => set("forcePlainText", v)} />
            </div>

            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-4 pb-1">Lead behaviour</p>
            <div className="divide-y divide-gray-800/60">
              <div className="py-3">
                <label className="text-sm text-gray-200 block mb-1.5">Stop lead on</label>
                <select
                  value={campaignSettings.stopLeadSettings}
                  onChange={(e) => set("stopLeadSettings", e.target.value as CampaignSettings["stopLeadSettings"])}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="REPLY_TO_AN_EMAIL">Reply to an email</option>
                  <option value="CLICK_ON_UNSUBSCRIBE">Click unsubscribe</option>
                  <option value="OPEN_AN_EMAIL">Open an email</option>
                </select>
              </div>
              <SettingRow label="Pause same-domain leads on reply" description="Avoids emailing multiple people at a company after one replies" checked={campaignSettings.autoPauseDomainLeadsOnReply} onChange={(v) => set("autoPauseDomainLeadsOnReply", v)} />
            </div>

            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-4 pb-1">Out of office</p>
            <div className="divide-y divide-gray-800/60">
              <SettingRow label="Ignore OOO as reply" description="OOO responses will not stop the sequence" checked={campaignSettings.ignoreOOOasReply} onChange={(v) => set("ignoreOOOasReply", v)} />
              <div className="py-3 space-y-2">
                <p className="text-sm text-gray-200">Reactivation mode</p>
                {([
                  { label: "Auto-reactivate immediately", value: "immediate" },
                  { label: "Reactivate after delay", value: "delay" },
                  { label: "Auto-categorize only", value: "categorize" },
                  { label: "Off", value: "off" },
                ] as const).map(({ label, value }) => {
                  const current = campaignSettings.autoReactivateOOO && campaignSettings.reactivateOOOwithDelay === 0
                    ? "immediate"
                    : campaignSettings.reactivateOOOwithDelay > 0
                      ? "delay"
                      : campaignSettings.autoCategorizeOOO
                        ? "categorize"
                        : "off";
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        if (value === "immediate") onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: true, reactivateOOOwithDelay: 0, autoCategorizeOOO: false });
                        else if (value === "delay") onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: false, reactivateOOOwithDelay: campaignSettings.reactivateOOOwithDelay || 3, autoCategorizeOOO: false });
                        else if (value === "categorize") onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: false, reactivateOOOwithDelay: 0, autoCategorizeOOO: true });
                        else onCampaignSettingsChange({ ...campaignSettings, autoReactivateOOO: false, reactivateOOOwithDelay: 0, autoCategorizeOOO: false });
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${current === value ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700"}`}
                    >
                      {label}
                    </button>
                  );
                })}
                {campaignSettings.reactivateOOOwithDelay > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <label className="text-xs text-gray-400">Delay days</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={campaignSettings.reactivateOOOwithDelay}
                      onChange={(e) => set("reactivateOOOwithDelay", Math.max(1, Number(e.target.value)))}
                      className="w-20 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 px-5 py-4">
          <button
            onClick={handleSave}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold transition ${saved ? "border border-green-500/50 bg-green-500/20 text-green-300" : "bg-blue-500 text-white hover:bg-blue-400"}`}
          >
            {saved ? "Saved" : "Save defaults"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Custom Schedule Editor ────────────────────────────────────────────────────

function CustomScheduleEditor({ schedule, onChange }: { schedule: ScheduleTemplate; onChange: (s: ScheduleTemplate) => void }) {
  const set = <K extends keyof ScheduleTemplate>(key: K, value: ScheduleTemplate[K]) => onChange({ ...schedule, [key]: value });

  const toggleDay = (day: number) => {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day].sort((a, b) => a - b);
    set("days", days);
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Timezone</label>
        <select value={schedule.timezone} onChange={(e) => set("timezone", e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none">
          {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-400">Send days</label>
        <div className="flex gap-1.5">
          {DAY_LABELS.map((label, index) => (
            <button key={label} type="button" onClick={() => toggleDay(index)} className={`flex-1 rounded py-1.5 text-xs font-medium transition ${schedule.days.includes(index) ? "border border-blue-500 bg-blue-500/20 text-blue-300" : "border border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Start</label>
          <input type="time" value={schedule.start} onChange={(e) => set("start", e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">End</label>
          <input type="time" value={schedule.end} onChange={(e) => set("end", e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Max new leads per day</label>
        <input type="number" min={1} max={500} value={schedule.maxLeads} onChange={(e) => set("maxLeads", Math.max(1, Number(e.target.value)))} className="w-28 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none" />
      </div>
    </div>
  );
}

// ── Smartlead Tag Picker ──────────────────────────────────────────────────────

function TagPicker({
  tags,
  selectedTag,
  query,
  loading,
  error,
  onQuery,
  onSelect,
  onRefresh,
}: {
  tags: SmartleadTag[];
  selectedTag: string;
  query: string;
  loading: boolean;
  error: string;
  onQuery: (value: string) => void;
  onSelect: (value: string) => void;
  onRefresh: () => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tags.filter((tag) => tag.name.toLowerCase().includes(q)) : tags;
  }, [query, tags]);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/70 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Smartlead tags</p>
          <p className="text-xs text-gray-500">Pulled from JWT server-side. No inbox CSV needed.</p>
        </div>
        <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500 disabled:opacity-50">
          {loading ? "Syncing…" : "Refresh"}
        </button>
      </div>

      <div className="p-4 space-y-3">
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search tags…"
          className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
        />

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
          {loading && tags.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-center text-sm text-gray-500">Loading tags from Smartlead…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-6 text-center text-sm text-gray-500">No matching tags found.</div>
          ) : (
            filtered.map((tag) => {
              const active = selectedTag === tag.name;
              return (
                <button
                  key={tag.name}
                  type="button"
                  onClick={() => onSelect(tag.name)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${active ? "border-blue-500 bg-blue-500/10" : "border-gray-800 bg-gray-950 hover:border-gray-700"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${active ? "text-blue-200" : "text-gray-200"}`}>{tag.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{tag.domains.toLocaleString()} domains</p>
                    </div>
                    <span className={`rounded-md px-2 py-1 text-xs font-bold ${active ? "bg-blue-500 text-white" : "bg-gray-800 text-gray-300"}`}>{tag.count.toLocaleString()}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────

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
  const [tagsError, setTagsError] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTagName, setSelectedTagName] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");

  const refreshTags = useCallback(async (force = false) => {
    setTagsLoading(true);
    setTagsError("");
    try {
      const result = await fetchSmartleadTags(force);
      setTags(result.tags);
      setFetchedAt(result.fetchedAt);
      setSelectedTagName((current) => current && result.tags.some((tag) => tag.name === current) ? current : "");
    } catch (error) {
      setTagsError(error instanceof Error ? error.message : "Unable to fetch Smartlead tags.");
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshTags(false);
  }, [refreshTags]);

  const handleAddLeads = async (file: File) => {
    const entry: FileState<LeadRow> = { file, data: null, errors: [], warnings: [], loading: true };
    setLeadsFiles((prev) => [...prev, entry]);
    const result = await parseLeads(file);
    setLeadsFiles((prev) => {
      const index = prev.findLastIndex((item) => item.file === file);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = { file, ...result, loading: false };
      return next;
    });
  };

  const handleRemoveLeads = (index: number) => {
    setLeadsFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSeq = async (file: File) => {
    setSeqState({ file, data: null, errors: [], warnings: [], loading: true });
    const result = await parseSequences(file);
    setSeqState({ file, ...result, loading: false });
  };

  const selectedTag = useMemo(
    () => tags.find((tag) => tag.name === selectedTagName) ?? null,
    [selectedTagName, tags]
  );

  const selectedAccounts = selectedTag?.accounts ?? [];
  const selectedDomains = useMemo(() => new Set(selectedAccounts.map((account) => account.domain).filter(Boolean)).size, [selectedAccounts]);
  const selectedAvgRep = useMemo(() => {
    const reps = selectedAccounts.map((account) => account.reputation).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (reps.length === 0) return null;
    return Math.round(reps.reduce((sum, value) => sum + value, 0) / reps.length);
  }, [selectedAccounts]);

  const leadsReady = leadsFiles.length > 0 && leadsFiles.every((file) => file.data !== null && !file.loading);
  const sequenceReady = seqState.data !== null && !seqState.loading;
  const totalLeads = leadsFiles.reduce((sum, file) => sum + (file.data?.length ?? 0), 0);
  const sequenceCount = seqState.data?.length ?? 0;
  const inboxRequired = mode === "launch";
  const inboxReady = selectedAccounts.length > 0;
  const hasErrors = leadsFiles.some((file) => file.errors.length > 0) || seqState.errors.length > 0;

  const canSubmit = campaignName.trim().length > 0 && leadsReady && sequenceReady && !hasErrors && (inboxReady || !inboxRequired);

  const submitLabel = !campaignName.trim()
    ? "Enter campaign name"
    : !leadsReady || !sequenceReady
      ? "Upload leads and sequence"
      : hasErrors
        ? "Fix CSV errors"
        : inboxRequired && !inboxReady
          ? "Select a Smartlead tag"
          : mode === "launch"
            ? "Launch campaign"
            : "Save as draft";

  const handleSubmit = () => {
    if (!canSubmit) return;

    const inboxes: InboxRow[] = selectedAccounts.map((account) => ({
      email_account_id: String(account.id),
      from_email: account.email,
    }));

    onSubmit({
      campaignName: campaignName.trim(),
      mode,
      templateKey,
      customSchedule,
      leads: leadsFiles.flatMap((file) => file.data ?? []),
      sequences: seqState.data ?? [],
      inboxes,
      inboxTag: selectedTagName,
      apiConfig,
      campaignSettings,
    });
  };

  return (
    <>
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        campaignSettings={campaignSettings}
        onCampaignSettingsChange={setCampaignSettings}
      />

      <div className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100">
        <div className="mx-auto max-w-[1180px] space-y-6">
          <header className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900/60 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/20">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">B2BDrive</p>
                  <h1 className="text-2xl font-bold text-white">Campaign Launcher</h1>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-gray-500">Upload only leads and sequence. Inbox selection now comes directly from Smartlead tags through a private Vercel server route.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill ok label="API key server-side" />
              <StatusPill ok={!tagsError} label={tagsLoading ? "Tags syncing" : "Tags ready"} />
              <button onClick={() => setDrawerOpen(true)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-gray-500">Defaults</button>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <main className="space-y-6">
              <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Campaign name</label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g. Q2 Outbound — SaaS Founders"
                      className="w-full rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["draft", "launch"] as const).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setMode(item)}
                          className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${mode === item ? item === "draft" ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-green-500 bg-green-500/10 text-green-300" : "border-gray-800 bg-gray-950 text-gray-500 hover:border-gray-700"}`}
                        >
                          {item === "draft" ? "Draft" : "Launch"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-5">
                <div>
                  <p className="text-sm font-semibold text-white">Inputs</p>
                  <p className="text-xs text-gray-500 mt-0.5">The master inbox upload is removed. Tags are pulled live from Smartlead.</p>
                </div>
                <MultiLeadsDropZone files={leadsFiles} onAddFile={handleAddLeads} onRemoveFile={handleRemoveLeads} />
                <DropZone label="Sequence CSV" hint="Required: seq_number, subject, body, delay_days." fileState={seqState as FileState<unknown>} onFile={handleSeq} />
              </section>

              <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Schedule</p>
                    <p className="text-xs text-gray-500 mt-0.5">Pick a preset or customize your sending window.</p>
                  </div>
                  <button onClick={() => setDrawerOpen(true)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500">
                    Gap: {campaignSettings.sendGapMinutes}m
                  </button>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  {PRESET_KEYS.map((key) => {
                    const template = TEMPLATES[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTemplateKey(key)}
                        className={`rounded-xl border p-4 text-left transition ${templateKey === key ? "border-blue-500 bg-blue-500/10" : "border-gray-800 bg-gray-950 hover:border-gray-700"}`}
                      >
                        <p className={`text-sm font-semibold ${templateKey === key ? "text-blue-300" : "text-gray-200"}`}>{template.label}</p>
                        <p className="mt-1 text-xs text-gray-500">{template.description}</p>
                        <p className="mt-1 text-xs text-gray-600">Max {template.maxLeads} leads/day</p>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setTemplateKey("custom")}
                    className={`rounded-xl border p-4 text-left transition ${templateKey === "custom" ? "border-purple-500 bg-purple-500/10" : "border-gray-800 bg-gray-950 hover:border-gray-700"}`}
                  >
                    <p className={`text-sm font-semibold ${templateKey === "custom" ? "text-purple-300" : "text-gray-200"}`}>Custom</p>
                    <p className="mt-1 text-xs text-gray-500">Choose timezone, days, hours and daily cap.</p>
                    <p className="mt-1 text-xs text-gray-600">Best for client-specific launch rules</p>
                  </button>
                </div>

                {templateKey === "custom" && <CustomScheduleEditor schedule={customSchedule} onChange={setCustomSchedule} />}
              </section>
            </main>

            <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Leads" value={totalLeads.toLocaleString()} hint={leadsReady ? "CSV ready" : "Upload required"} />
                <StatCard label="Steps" value={sequenceCount || "—"} hint={sequenceReady ? "Sequence ready" : "Upload required"} />
                <StatCard label="Inboxes" value={selectedAccounts.length ? selectedAccounts.length.toLocaleString() : "—"} hint={selectedTagName || "Select tag"} />
              </div>

              <TagPicker
                tags={tags}
                selectedTag={selectedTagName}
                query={tagQuery}
                loading={tagsLoading}
                error={tagsError}
                onQuery={setTagQuery}
                onSelect={setSelectedTagName}
                onRefresh={() => { void refreshTags(true); }}
              />

              <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-white">Launch check</p>
                  <p className="text-xs text-gray-500 mt-0.5">{fetchedAt ? `Tags synced ${new Date(fetchedAt).toLocaleString()}` : "Waiting for tag sync"}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatusPill ok={campaignName.trim().length > 0} label="Campaign named" />
                  <StatusPill ok={leadsReady} label="Leads ready" />
                  <StatusPill ok={sequenceReady} label="Sequence ready" />
                  <StatusPill ok={inboxReady || !inboxRequired} label={inboxRequired ? "Tag selected" : "Tag optional"} />
                </div>

                {selectedTag && (
                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-600">Selected tag</p>
                    <p className="mt-1 truncate text-base font-semibold text-white">{selectedTag.name}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-gray-900 px-2 py-2">
                        <p className="text-sm font-bold text-white">{selectedAccounts.length.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">accounts</p>
                      </div>
                      <div className="rounded-lg bg-gray-900 px-2 py-2">
                        <p className="text-sm font-bold text-white">{selectedDomains.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">domains</p>
                      </div>
                      <div className="rounded-lg bg-gray-900 px-2 py-2">
                        <p className="text-sm font-bold text-white">{selectedAvgRep === null ? "—" : `${selectedAvgRep}%`}</p>
                        <p className="text-[10px] text-gray-500">avg rep</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={`w-full rounded-xl px-5 py-3 text-sm font-bold transition ${canSubmit ? mode === "launch" ? "bg-green-500 text-white shadow-lg shadow-green-500/20 hover:bg-green-400" : "bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400" : "cursor-not-allowed bg-gray-800 text-gray-600"}`}
                >
                  {submitLabel}
                </button>

                <p className="text-center text-[11px] text-gray-700">Built by Sen · server-secured Smartlead launcher</p>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
