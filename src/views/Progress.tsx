import type { StepState } from "../lib/pipeline";

interface Props {
  steps: StepState[];
  campaignName: string;
  mode: "draft" | "launch";
  onRetry: () => void;
  onStartOver: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  waiting: (
    <span className="w-5 h-5 rounded-full border-2 border-gray-700 block" />
  ),
  running: (
    <svg className="w-5 h-5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  done: (
    <span className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center">
      <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  ),
  skipped: (
    <span className="w-5 h-5 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center">
      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </svg>
    </span>
  ),
  error: (
    <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center">
      <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  ),
};

const failedStep = (steps: StepState[]) => steps.find((s) => s.status === "error");

export default function Progress({
  steps,
  campaignName,
  mode,
  onRetry,
  onStartOver,
}: Props) {
  const failed = failedStep(steps);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start py-12 px-4 animate-fade-in">
      {/* Header */}
      <div className="w-full max-w-[560px] mb-8">
        <div className="flex items-center gap-2.5 mb-1">
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
        <h1 className="text-2xl font-bold text-white mt-3">
          {failed ? "Launch failed" : mode === "draft" ? "Saving draft…" : "Launching campaign…"}
        </h1>
        <p className="text-sm text-gray-500 mt-1 truncate">{campaignName}</p>
      </div>

      {/* Steps */}
      <div className="w-full max-w-[560px] space-y-1">
        {steps.map((step, idx) => {
          const isError = step.status === "error";
          const isRunning = step.status === "running";

          return (
            <div
              key={step.id}
              className={`relative flex items-start gap-3 px-4 py-3 rounded-lg transition-all ${
                isError
                  ? "bg-red-500/8 border border-red-500/30"
                  : isRunning
                  ? "bg-blue-500/5 border border-blue-500/20"
                  : "border border-transparent"
              }`}
            >
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div className="absolute left-[1.6rem] top-9 bottom-0 w-px bg-gray-800 -mb-1" />
              )}

              <div className="mt-0.5 shrink-0">{STATUS_ICON[step.status]}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-sm font-medium ${
                      isError
                        ? "text-red-300"
                        : isRunning
                        ? "text-blue-300"
                        : step.status === "done"
                        ? "text-gray-200"
                        : step.status === "skipped"
                        ? "text-gray-500"
                        : "text-gray-600"
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.detail && !isError && (
                    <span className={`text-xs ${
                      step.status === "skipped" ? "text-gray-600" : "text-gray-500"
                    }`}>
                      {step.detail}
                    </span>
                  )}
                </div>

                {isError && step.error && (
                  <div className="mt-2 space-y-3">
                    <p className="text-xs text-red-400 bg-red-950/50 border border-red-900/50 rounded px-3 py-2 font-mono leading-relaxed">
                      {step.error}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={onRetry}
                        className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold transition-colors"
                      >
                        Retry from this step
                      </button>
                      <button
                        onClick={onStartOver}
                        className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors"
                      >
                        Start over
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
