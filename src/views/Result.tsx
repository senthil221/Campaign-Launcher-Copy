import type { StepState } from "../lib/pipeline";

interface Props {
  mode: "draft" | "launch";
  campaignName: string;
  campaignId: number;
  steps: StepState[];
  sendGap: number;
  onReset: () => void;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
      <span className="text-lg font-bold text-white">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function buildErrorReport(
  campaignName: string,
  campaignId: number,
  steps: StepState[]
): string {
  const failed = steps.find((s) => s.status === "error");
  const lines = [
    "=== Campaign Launcher — Error Report ===",
    `Campaign: ${campaignName}`,
    `Campaign ID: ${campaignId || "not created"}`,
    `Failed step: ${failed?.label ?? "unknown"}`,
    `Error: ${failed?.error ?? "unknown"}`,
    "",
    "=== All steps ===",
    ...steps.map((s) => `[${s.status.toUpperCase().padEnd(7)}] ${s.label}${s.detail ? " — " + s.detail : ""}${s.error ? " — " + s.error : ""}`),
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  return lines.join("\n");
}

export default function Result({
  mode,
  campaignName,
  campaignId,
  steps,
  sendGap,
  onReset,
}: Props) {
  const hasError = steps.some((s) => s.status === "error");

  const leadsStep = steps.find((s) => s.id === "leads");
  const inboxesStep = steps.find((s) => s.id === "inboxes");
  const activateStep = steps.find((s) => s.id === "activate");
  const seqSteps = steps.find((s) => s.id === "sequences");

  // Extract counts from step details
  const leadsAdded   = leadsStep?.detail?.match(/^([\d,]+)/)?.[1] ?? "—";
  const leadsSkipped = leadsStep?.detail?.match(/([\d,]+) skipped/)?.[1] ?? null;
  const inboxCount   = inboxesStep?.detail?.match(/^([\d,]+)/)?.[1] ?? "—";
  const seqCount     = seqSteps?.detail?.match(/(\d+) sequence/)?.[1] ?? "—";
  const scheduleDetail = steps.find((s) => s.id === "schedule")?.detail ?? null;
  const parseDetail    = steps.find((s) => s.id === "parse")?.detail ?? null;
  // Input count from parse step e.g. "2,862 leads · 2 steps · 99 inboxes"
  const leadsInput   = parseDetail?.match(/^([\d,]+)/)?.[1] ?? null;

  const copyErrorReport = () => {
    const report = buildErrorReport(campaignName, campaignId, steps);
    navigator.clipboard.writeText(report);
  };

  // ── ERROR variant ────────────────────────────────────────────────────────
  if (hasError) {
    const failed = steps.find((s) => s.status === "error")!;
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center py-12 px-4 animate-fade-in">
        <div className="w-full max-w-[480px] text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">Launch failed</h1>
            <p className="text-sm text-gray-500 mt-1">{campaignName}</p>
          </div>

          <div className="text-left bg-gray-900 border border-red-900/40 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">Failed at: {failed.label}</p>
            <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {failed.error}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={onReset}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm transition-colors"
            >
              Try again from scratch
            </button>
            <button
              onClick={copyErrorReport}
              className="w-full py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy error report
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LAUNCHED / DRAFT variant ─────────────────────────────────────────────
  const isDraft = mode === "draft" || activateStep?.status === "skipped";

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center py-12 px-4 animate-fade-in">
      <div className="w-full max-w-[480px] text-center space-y-6 animate-slide-up">

        {/* Icon */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
          isDraft
            ? "bg-blue-500/15 border border-blue-500/30"
            : "bg-green-500/15 border border-green-500/30"
        }`}>
          {isDraft ? (
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Title */}
        <div>
          <h1 className={`text-2xl font-bold ${isDraft ? "text-blue-300" : "text-green-300"}`}>
            {isDraft ? "Saved as draft" : "Campaign live"}
          </h1>
          <p className="text-base text-white font-medium mt-1">{campaignName}</p>
          <p className="text-sm text-gray-500 mt-0.5">Smartlead ID: {campaignId}</p>
        </div>

        {/* Stats pills */}
        <div className="grid grid-cols-4 gap-2">
          <StatPill label="Leads" value={leadsAdded} />
          <StatPill label="Inboxes" value={inboxCount} />
          <StatPill label="Steps" value={seqCount} />
          <StatPill label="Gap" value={`${sendGap}m`} />
        </div>

        {/* Detailed summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800 text-left">

          {/* Leads row */}
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
              <span className="text-sm text-gray-300">Leads uploaded</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-white">{leadsAdded}</span>
              {leadsInput && leadsInput !== leadsAdded && (
                <span className="text-xs text-gray-600 ml-1">of {leadsInput}</span>
              )}
            </div>
          </div>

          {/* Skipped leads — only shown if > 0 */}
          {leadsSkipped && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-sm text-gray-300">Leads skipped</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-amber-400">{leadsSkipped}</span>
                <span className="text-xs text-gray-600 ml-1">dupes / blocklist</span>
              </div>
            </div>
          )}

          {/* Inboxes row */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-gray-300">Inboxes connected</span>
            </div>
            <span className="text-sm font-semibold text-white">{inboxCount}</span>
          </div>

          {/* Sequence steps row */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" />
              </svg>
              <span className="text-sm text-gray-300">Sequence steps</span>
            </div>
            <span className="text-sm font-semibold text-white">{seqCount}</span>
          </div>

          {/* Schedule row */}
          {scheduleDetail && (
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-gray-300">Schedule</span>
              </div>
              <span className="text-xs text-gray-400 text-right max-w-[55%] leading-snug">{scheduleDetail}</span>
            </div>
          )}
        </div>

        {/* Draft note */}
        {isDraft && (
          <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-lg px-4 py-3 text-left">
            <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-blue-300">Review and activate in Smartlead when ready.</p>
          </div>
        )}

        <button
          onClick={onReset}
          className="w-full py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-sm transition-colors"
        >
          Launch another campaign
        </button>
      </div>
    </div>
  );
}
