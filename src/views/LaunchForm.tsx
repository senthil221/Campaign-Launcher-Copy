import React, { useState, useRef, useCallback, useEffect } from "react";
import type { LeadRow, SequenceRow, InboxRow, MasterInboxRow } from "../lib/csv";
import { parseLeads, parseSequences, parseMasterInboxes } from "../lib/csv";
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
  saveApiConfig,
  loadCampaignSettings,
  saveCampaignSettings,
  type ApiConfig,
  type CampaignSettings,
} from "../lib/config";

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


// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-blue-500" : "bg-gray-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── SettingRow ────────────────────────────────────────────────────────────────

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

// ── Drop Zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  label: string;
  hint: string;
  accept: string;
  fileState: FileState<unknown>;
  onFile: (file: File) => void;
}

function DropZone({ label, hint, accept, fileState, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const statusColor = () => {
    if (fileState.errors.length) return "border-red-500 bg-red-500/5";
    if (fileState.data) return "border-green-500 bg-green-500/5";
    if (dragging) return "border-blue-400 bg-blue-500/5";
    return "border-gray-700 hover:border-gray-500 bg-gray-900/50";
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <div
        className={`relative rounded-lg border-2 border-dashed px-4 py-5 transition-all cursor-pointer ${statusColor()}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
        {fileState.loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Parsing…
          </div>
        ) : fileState.data ? (
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-gray-200 font-medium">{fileState.file?.name}</span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-400">{fileState.data.length.toLocaleString()} rows</span>
            </div>
            <span className="text-xs text-gray-500 shrink-0">click to replace</span>
          </div>
        ) : (
          <div className="text-center">
            <svg className="mx-auto h-6 w-6 text-gray-600 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-400">
              <span className="text-blue-400 font-medium">Click to upload</span> or drag &amp; drop
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{hint}</p>
          </div>
        )}
      </div>
      {fileState.errors.map((e, i) => (
        <p key={i} className="text-xs text-red-400 flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {e}
        </p>
      ))}
      {fileState.warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
          <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {w}
        </p>
      ))}
    </div>
  );
}

// ── MultiLeadsDropZone ────────────────────────────────────────────────────────

interface MultiLeadsDropZoneProps {
  files: FileState<LeadRow>[];
  onAddFile: (file: File) => void;
  onRemoveFile: (index: number) => void;
}

function MultiLeadsDropZone({ files, onAddFile, onRemoveFile }: MultiLeadsDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const hasAnyError = files.some((f) => f.errors.length > 0);
  const allLoaded = files.length > 0 && files.every((f) => !f.loading);
  const totalRows = files.reduce((sum, f) => sum + (f.data?.length ?? 0), 0);

  const zoneBorder =
    hasAnyError
      ? "border-red-500 bg-red-500/5"
      : files.length > 0
      ? "border-green-500/40 bg-green-500/5 hover:border-green-400"
      : dragging
      ? "border-blue-400 bg-blue-500/5"
      : "border-gray-700 hover:border-gray-500 bg-gray-900/50";

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onAddFile(file);
    },
    [onAddFile]
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">Leads</label>
        {allLoaded && files.length > 1 && (
          <span className="text-xs text-gray-500">{totalRows.toLocaleString()} rows total</span>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={i}
              className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
                f.errors.length ? "border-red-500/50 bg-red-500/5" : "border-gray-700 bg-gray-900/50"
              }`}
            >
              <div className="flex items-center gap-2 text-sm min-w-0">
                {f.loading ? (
                  <svg className="animate-spin h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : f.errors.length ? (
                  <svg className="w-4 h-4 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className="text-gray-200 font-medium truncate">{f.file?.name}</span>
                {!f.loading && f.data && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-400 shrink-0">{f.data.length.toLocaleString()} rows</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                className="text-gray-600 hover:text-gray-300 shrink-0 transition-colors"
                aria-label="Remove file"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`relative rounded-lg border-2 border-dashed transition-all cursor-pointer ${
          files.length > 0 ? "px-4 py-3" : "px-4 py-5"
        } ${zoneBorder}`}
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
        {files.length > 0 ? (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add another CSV
          </div>
        ) : (
          <div className="text-center">
            <svg className="mx-auto h-6 w-6 text-gray-600 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-400">
              <span className="text-blue-400 font-medium">Click to upload</span> or drag &amp; drop
            </p>
            <p className="text-xs text-gray-600 mt-0.5">Columns: Email, First Name, Last Name, Company</p>
          </div>
        )}
      </div>

      {/* Per-file errors and warnings */}
      {files.flatMap((f, i) => [
        ...f.errors.map((err, j) => (
          <p key={`e${i}-${j}`} className="text-xs text-red-400 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {files.length > 1 ? <><span className="font-medium">{f.file?.name}:</span> {err}</> : err}
          </p>
        )),
        ...f.warnings.map((w, j) => (
          <p key={`w${i}-${j}`} className="text-xs text-amber-400 flex items-start gap-1.5">
            <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {files.length > 1 ? <><span className="font-medium">{f.file?.name}:</span> {w}</> : w}
          </p>
        )),
      ])}
    </div>
  );
}

// ── Settings Drawer ───────────────────────────────────────────────────────────

type DrawerTab = "api" | "campaign";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  apiConfig: ApiConfig;
  onApiConfigChange: (c: ApiConfig) => void;
  campaignSettings: CampaignSettings;
  onCampaignSettingsChange: (s: CampaignSettings) => void;
}

function SettingsDrawer({
  open,
  onClose,
  apiConfig,
  onApiConfigChange,
  campaignSettings,
  onCampaignSettingsChange,
}: SettingsDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("api");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveApiConfig(apiConfig);
    saveCampaignSettings(campaignSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = <K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]) =>
    onCampaignSettingsChange({ ...campaignSettings, [key]: value });

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-gray-950 border-l border-gray-800 z-50 flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-semibold text-gray-200">Configuration</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 shrink-0">
          {(["api", "campaign"] as DrawerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-blue-400 border-b-2 border-blue-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "api" ? "API" : "Campaign defaults"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
          {tab === "api" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                These credentials are saved to your browser's local storage and never sent anywhere except Smartlead's API.
              </p>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-300">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiConfig.apiKey}
                    onChange={(e) => onApiConfigChange({ ...apiConfig, apiKey: e.target.value })}
                    placeholder="Enter your Smartlead API key"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showKey ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                {!apiConfig.apiKey && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Required before launching campaigns
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-300">Base URL</label>
                <input
                  type="text"
                  value={apiConfig.baseUrl}
                  onChange={(e) => onApiConfigChange({ ...apiConfig, baseUrl: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                />
                <p className="text-xs text-gray-600">Only change if Smartlead updates their API URL.</p>
              </div>
            </div>
          )}

          {tab === "campaign" && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 mb-3">
                These defaults apply to every campaign. Saved to your browser.
              </p>

              {/* Send gap */}
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-2 pb-1">Sending</p>
              <div className="py-3">
                <label className="text-sm text-gray-200 block mb-0.5">Gap between emails <span className="text-gray-500 font-normal">(minutes)</span></label>
                <p className="text-xs text-gray-500 mb-2">Time between each individual email sent — not the schedule start time</p>
                <input
                  type="number"
                  min={3}
                  max={120}
                  value={campaignSettings.sendGapMinutes}
                  onChange={(e) => set("sendGapMinutes", Math.max(3, Number(e.target.value)))}
                  className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <span className="text-xs text-gray-600 ml-2">min · minimum 3</span>
              </div>

              {/* Tracking */}
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-2 pb-1">Tracking</p>
              <div className="divide-y divide-gray-800/60">
                <SettingRow
                  label="Track email opens"
                  description="Adds a tracking pixel to each email"
                  checked={campaignSettings.trackEmailOpen}
                  onChange={(v) => set("trackEmailOpen", v)}
                />
                <SettingRow
                  label="Track link clicks"
                  description="Rewrites links through Smartlead's tracker"
                  checked={campaignSettings.trackLinkClick}
                  onChange={(v) => set("trackLinkClick", v)}
                />
              </div>

              {/* Sending */}
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-4 pb-1">Sending</p>
              <div className="divide-y divide-gray-800/60">
                <SettingRow
                  label="Send as plain text"
                  description="Strips HTML from outgoing emails"
                  checked={campaignSettings.sendAsPlainText}
                  onChange={(v) => set("sendAsPlainText", v)}
                />
                <SettingRow
                  label="Force plain text"
                  description="Overrides any HTML even in templates"
                  checked={campaignSettings.forcePlainText}
                  onChange={(v) => set("forcePlainText", v)}
                />
              </div>

              {/* Lead behaviour */}
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-4 pb-1">Lead behaviour</p>
              <div className="divide-y divide-gray-800/60">
                <div className="py-3">
                  <label className="text-sm text-gray-200 block mb-1.5">Stop lead on</label>
                  <select
                    value={campaignSettings.stopLeadSettings}
                    onChange={(e) =>
                      set("stopLeadSettings", e.target.value as CampaignSettings["stopLeadSettings"])
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="REPLY_TO_AN_EMAIL">Reply to an email</option>
                    <option value="CLICK_ON_UNSUBSCRIBE">Click unsubscribe</option>
                    <option value="OPEN_AN_EMAIL">Open an email</option>
                  </select>
                </div>
                <SettingRow
                  label="Pause domain on reply"
                  description="Pauses other leads from the same domain when one replies"
                  checked={campaignSettings.autoPauseDomainLeadsOnReply}
                  onChange={(v) => set("autoPauseDomainLeadsOnReply", v)}
                />
              </div>

              {/* Out of Office */}
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider pt-4 pb-1">Out of office</p>
              <div className="divide-y divide-gray-800/60">
                <SettingRow
                  label="Ignore OOO as reply"
                  description="OOO responses won't stop the sequence"
                  checked={campaignSettings.ignoreOOOasReply}
                  onChange={(v) => set("ignoreOOOasReply", v)}
                />
                {/* Reactivation mode — three mutually exclusive options */}
                <div className="py-3 space-y-2">
                  <p className="text-sm text-gray-200">Reactivation mode</p>
                  <p className="text-xs text-gray-500">Only one can be active at a time</p>
                  {(
                    [
                      { label: "Auto-reactivate immediately", value: "immediate" },
                      { label: "Reactivate after delay", value: "delay" },
                      { label: "Auto-categorize only", value: "categorize" },
                      { label: "Off", value: "off" },
                    ] as const
                  ).map(({ label, value }) => {
                    const current =
                      campaignSettings.autoReactivateOOO && campaignSettings.reactivateOOOwithDelay === 0
                        ? "immediate"
                        : campaignSettings.reactivateOOOwithDelay > 0
                        ? "delay"
                        : campaignSettings.autoCategorizeOOO
                        ? "categorize"
                        : "off";
                    const active = current === value;
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
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${active ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {campaignSettings.reactivateOOOwithDelay > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <label className="text-xs text-gray-400">Delay (days)</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={campaignSettings.reactivateOOOwithDelay}
                        onChange={(e) => set("reactivateOOOwithDelay", Math.max(1, Number(e.target.value)))}
                        className="w-20 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={handleSave}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
              saved
                ? "bg-green-500/20 border border-green-500/50 text-green-400"
                : "bg-blue-500 hover:bg-blue-400 text-white"
            }`}
          >
            {saved ? "✓ Saved to browser" : "Save settings"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Custom Schedule Editor ────────────────────────────────────────────────────

function CustomScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: ScheduleTemplate;
  onChange: (s: ScheduleTemplate) => void;
}) {
  const set = <K extends keyof ScheduleTemplate>(key: K, value: ScheduleTemplate[K]) =>
    onChange({ ...schedule, [key]: value });

  const toggleDay = (day: number) => {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day].sort((a, b) => a - b);
    set("days", days);
  };

  return (
    <div className="mt-3 p-4 rounded-lg bg-gray-900 border border-gray-700 space-y-4">
      {/* Timezone */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Timezone</label>
        <select
          value={schedule.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Days */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-400">Send days</label>
        <div className="flex gap-1.5">
          {DAY_LABELS.map((label, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => toggleDay(idx)}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${
                schedule.days.includes(idx)
                  ? "bg-blue-500/20 border border-blue-500 text-blue-300"
                  : "bg-gray-800 border border-gray-700 text-gray-500 hover:border-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Time range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">Start time</label>
          <input
            type="time"
            value={schedule.start}
            onChange={(e) => set("start", e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-400">End time</label>
          <input
            type="time"
            value={schedule.end}
            onChange={(e) => set("end", e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Max leads */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-400">Max new leads per day</label>
        <input
          type="number"
          min={1}
          max={500}
          value={schedule.maxLeads}
          onChange={(e) => set("maxLeads", Math.max(1, Number(e.target.value)))}
          className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>
    </div>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────

export default function LaunchForm({ onSubmit }: Props) {
  const [campaignName, setCampaignName] = useState("");
  const [mode, setMode] = useState<"draft" | "launch">("draft");
  const [templateKey, setTemplateKey] = useState<TemplateKey>("standard");
  const [customSchedule, setCustomSchedule] = useState<ScheduleTemplate>(DEFAULT_CUSTOM_SCHEDULE);
  // sendGap is driven by campaignSettings.sendGapMinutes — no separate state needed
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadApiConfig);
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings>(loadCampaignSettings);

  const [leadsFiles, setLeadsFiles] = useState<FileState<LeadRow>[]>([]);
  const [seqState, setSeqState] = useState<FileState<SequenceRow>>(emptyFile);
  const [masterInboxState, setMasterInboxState] = useState<FileState<MasterInboxRow>>(emptyFile);
  const [inboxTag, setInboxTag] = useState("");

  // Sync API config to state on mount (picks up env vars)
  useEffect(() => {
    setApiConfig(loadApiConfig());
    setCampaignSettings(loadCampaignSettings());
  }, []);

  const handleAddLeads = async (file: File) => {
    const entry: FileState<LeadRow> = { file, data: null, errors: [], warnings: [], loading: true };
    setLeadsFiles((prev) => [...prev, entry]);
    const result = await parseLeads(file);
    setLeadsFiles((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) { if (prev[i].file === file) { idx = i; break; } }
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { file, ...result, loading: false };
      return next;
    });
  };

  const handleRemoveLeads = (index: number) => {
    setLeadsFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSeq = async (file: File) => {
    setSeqState({ file, data: null, errors: [], warnings: [], loading: true });
    const result = await parseSequences(file);
    setSeqState({ file, ...result, loading: false });
  };

  const handleMasterInboxes = async (file: File) => {
    setMasterInboxState({ file, data: null, errors: [], warnings: [], loading: true });
    const result = await parseMasterInboxes(file);
    setMasterInboxState({ file, ...result, loading: false });
  };

  // Filter master sheet by tag, dedup by email
  const filteredInboxes = React.useMemo<MasterInboxRow[] | null>(() => {
    if (!masterInboxState.data || !inboxTag.trim()) return null;
    const tag = inboxTag.trim();
    const seen = new Set<string>();
    const out: MasterInboxRow[] = [];
    for (const row of masterInboxState.data) {
      if (row.tag === tag && !seen.has(row.email)) {
        seen.add(row.email);
        out.push(row);
      }
    }
    return out;
  }, [masterInboxState.data, inboxTag]);

  const inboxSkippedCount = React.useMemo(() => {
    if (!masterInboxState.data || !inboxTag.trim() || filteredInboxes === null) return 0;
    const tag = inboxTag.trim();
    const total = masterInboxState.data.filter((r) => r.tag === tag).length;
    return total - filteredInboxes.length;
  }, [masterInboxState.data, inboxTag, filteredInboxes]);

  const tagNoMatch = masterInboxState.data !== null && inboxTag.trim().length > 0 && filteredInboxes !== null && filteredInboxes.length === 0;
  const inboxReady = filteredInboxes !== null && filteredInboxes.length > 0;

  const hasErrors =
    leadsFiles.some((f) => f.errors.length > 0) ||
    seqState.errors.length > 0 ||
    masterInboxState.errors.length > 0 ||
    tagNoMatch;

  const allFilesReady =
    leadsFiles.length > 0 &&
    leadsFiles.every((f) => f.data !== null && !f.loading) &&
    seqState.data !== null &&
    inboxReady;

  const canLaunch =
    campaignName.trim().length > 0 &&
    allFilesReady &&
    !hasErrors &&
    !!apiConfig.apiKey;

  const handleSubmit = () => {
    if (!canLaunch) return;
    const inboxes: InboxRow[] = (filteredInboxes ?? []).map((r) => ({
      email_account_id: r.email,
    }));
    onSubmit({
      campaignName: campaignName.trim(),
      mode,
      templateKey,
      customSchedule,
      leads: leadsFiles.flatMap((f) => f.data!),
      sequences: seqState.data!,
      inboxes,
      inboxTag: inboxTag.trim(),
      apiConfig,
      campaignSettings,
    });
  };

  return (
    <>
      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        apiConfig={apiConfig}
        onApiConfigChange={setApiConfig}
        campaignSettings={campaignSettings}
        onCampaignSettingsChange={setCampaignSettings}
      />

      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-12 px-4 animate-fade-in">
        {/* Header */}
        <div className="w-full max-w-[560px] mb-8">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-200 tracking-wide uppercase">Campaign Launcher</span>
                <span className="text-xs text-gray-500 ml-2">by B2BDrive</span>
              </div>
            </div>
            {/* Gear button */}
            <button
              onClick={() => setDrawerOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                !apiConfig.apiKey
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  : "border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {!apiConfig.apiKey ? "Set API key" : "Settings"}
            </button>
          </div>
          <h1 className="text-2xl font-bold text-white mt-3">New Campaign</h1>
          <p className="text-sm text-gray-500 mt-1">Upload your files and configure the campaign settings below.</p>
        </div>

        <div className="w-full max-w-[560px] space-y-6">
          {/* API key warning banner */}
          {!apiConfig.apiKey && (
            <div
              className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 cursor-pointer hover:bg-amber-500/15 transition-colors"
              onClick={() => setDrawerOpen(true)}
            >
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-sm text-amber-300">
                No API key set — <span className="underline font-medium">click here to add one</span>
              </p>
            </div>
          )}

          {/* Campaign name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Campaign name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Q2 Outbound — SaaS Founders"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
            />
          </div>

          {/* Mode selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Launch mode</label>
            <div className="flex gap-2">
              {(["draft", "launch"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border ${
                    mode === m
                      ? m === "draft"
                        ? "bg-blue-500/15 border-blue-500 text-blue-300"
                        : "bg-green-500/15 border-green-500 text-green-300"
                      : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {m === "draft" ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      Save as draft
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Launch now
                    </span>
                  )}
                </button>
              ))}
            </div>
            {mode === "draft" && (
              <p className="text-xs text-gray-500">Campaign will be fully configured but NOT activated. Review in Smartlead before going live.</p>
            )}
            {mode === "launch" && (
              <p className="text-xs text-amber-500/80">Campaign will go live immediately after upload completes.</p>
            )}
          </div>

          {/* File uploads */}
          <div className="space-y-4">
            <div className="h-px bg-gray-800" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Files</p>
            <MultiLeadsDropZone
              files={leadsFiles}
              onAddFile={handleAddLeads}
              onRemoveFile={handleRemoveLeads}
            />
            <DropZone
              label="Sequence steps"
              hint="Required columns: Step Number, Subject, Body, Delay Days"
              accept=".csv"
              fileState={seqState as FileState<unknown>}
              onFile={handleSeq}
            />
            <div className="space-y-2">
              <DropZone
                label="Master Inboxes"
                hint='Required columns: "email" (account ID), "tag"'
                accept=".csv"
                fileState={masterInboxState as FileState<unknown>}
                onFile={handleMasterInboxes}
              />
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">Tag filter <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={inboxTag}
                  onChange={(e) => setInboxTag(e.target.value)}
                  placeholder="e.g. us-west"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {tagNoMatch && (
                  <p className="text-xs text-red-400 flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    No accounts match tag &ldquo;{inboxTag.trim()}&rdquo; — check your master sheet.
                  </p>
                )}
                {inboxReady && (
                  <p className="text-xs text-green-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {filteredInboxes!.length} account{filteredInboxes!.length !== 1 ? "s" : ""} matched
                    {inboxSkippedCount > 0 && `, ${inboxSkippedCount} duplicate${inboxSkippedCount !== 1 ? "s" : ""} skipped`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Schedule template */}
          <div className="space-y-2">
            <div className="h-px bg-gray-800" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_KEYS.map((key) => {
                const t = TEMPLATES[key];
                return (
                  <button
                    key={key}
                    onClick={() => setTemplateKey(key)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      templateKey === key
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-gray-700 bg-gray-900/50 hover:border-gray-600"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${templateKey === key ? "text-blue-300" : "text-gray-200"}`}>{t.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                    <p className="text-xs text-gray-600 mt-0.5">Max {t.maxLeads} leads/day</p>
                  </button>
                );
              })}
              {/* Custom card */}
              <button
                onClick={() => setTemplateKey("custom")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  templateKey === "custom"
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-gray-700 bg-gray-900/50 hover:border-gray-600"
                }`}
              >
                <p className={`text-sm font-semibold ${templateKey === "custom" ? "text-purple-300" : "text-gray-200"}`}>Custom</p>
                <p className="text-xs text-gray-500 mt-0.5">Configure your own</p>
                <p className="text-xs text-gray-600 mt-0.5">Any timezone &amp; hours</p>
              </button>
            </div>

            {templateKey === "custom" && (
              <CustomScheduleEditor schedule={customSchedule} onChange={setCustomSchedule} />
            )}
          </div>

          {/* Send gap — configured in Settings → Campaign defaults */}
          <div
            className="flex items-center justify-between py-3 px-4 rounded-lg bg-gray-900 border border-gray-800 cursor-pointer hover:border-gray-700 transition-colors"
            onClick={() => setDrawerOpen(true)}
          >
            <div>
              <p className="text-sm font-medium text-gray-300">Gap between emails</p>
              <p className="text-xs text-gray-500">Time between each individual email sent · change in Settings</p>
            </div>
            <span className="text-sm font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-md px-2.5 py-1 shrink-0">
              {campaignSettings.sendGapMinutes} min
            </span>
          </div>

          {/* Submit */}
          <div className="pb-2">
            <button
              onClick={handleSubmit}
              disabled={!canLaunch}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all ${
                canLaunch
                  ? mode === "launch"
                    ? "bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20"
                    : "bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20"
                  : "bg-gray-800 text-gray-600 cursor-not-allowed"
              }`}
            >
              {!apiConfig.apiKey
                ? "Add API key in Settings to continue"
                : leadsFiles.length === 0 || seqState.data === null || masterInboxState.data === null
                ? "Upload all 3 files to continue"
                : masterInboxState.data !== null && !inboxTag.trim()
                ? "Enter a tag to filter inboxes"
                : !campaignName.trim()
                ? "Enter a campaign name to continue"
                : hasErrors
                ? "Fix errors above to continue"
                : mode === "launch"
                ? "Launch campaign →"
                : "Save as draft →"}
            </button>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-700 pb-6">Built by Sen</p>
        </div>
      </div>
    </>
  );
}
