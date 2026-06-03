import { useState, useCallback } from "react";
import LaunchForm, { type FormValues } from "./views/LaunchForm";
import Progress from "./views/Progress";
import Result from "./views/Result";
import { runPipeline, type StepState, type StepId, type SkippedLead } from "./lib/pipeline";

type View = "form" | "progress" | "result";

interface RunState {
  campaignName: string;
  mode: "draft" | "launch";
  steps: StepState[];
  campaignId: number;
  formValues: FormValues;
  skippedLeads: SkippedLead[];
}

export default function App() {
  const [view, setView] = useState<View>("form");
  const [runState, setRunState] = useState<RunState | null>(null);

  const executePipeline = useCallback(
    async (
      values: FormValues,
      resumeFromStep?: StepId,
      existingCampaignId?: number
    ) => {
      setView("progress");

      const gen = runPipeline({
        campaignName: values.campaignName,
        mode: values.mode,
        templateKey: values.templateKey,
        customSchedule: values.customSchedule,
        sendGap: values.campaignSettings.sendGapMinutes,
        leads: values.leads,
        sequences: values.sequences,
        inboxes: values.inboxes,
        inboxTag: values.inboxTag,
        campaignSettings: values.campaignSettings,
        resumeFromStep,
        existingCampaignId,
      });

      let lastUpdate = { steps: [] as StepState[], campaignId: 0, skippedLeads: [] as SkippedLead[] };

      for await (const update of gen) {
        lastUpdate = {
          steps: update.steps,
          campaignId: update.campaignId ?? lastUpdate.campaignId,
          skippedLeads: update.skippedLeads ?? lastUpdate.skippedLeads,
        };
        setRunState({
          campaignName: values.campaignName,
          mode: values.mode,
          steps: update.steps,
          campaignId: update.campaignId ?? lastUpdate.campaignId,
          formValues: values,
          skippedLeads: update.skippedLeads ?? lastUpdate.skippedLeads,
        });
      }

      const hasError = lastUpdate.steps.some((s) => s.status === "error");
      const allDoneOrSkipped = lastUpdate.steps.every(
        (s) => s.status === "done" || s.status === "skipped" || s.status === "waiting"
      );

      if (!hasError && allDoneOrSkipped) {
        await new Promise((r) => setTimeout(r, 600));
        setView("result");
      }
    },
    []
  );

  const handleFormSubmit = useCallback(
    (values: FormValues) => executePipeline(values),
    [executePipeline]
  );

  const handleRetry = useCallback(() => {
    if (!runState) return;
    const failedStep = runState.steps.find((s) => s.status === "error");
    if (!failedStep) return;
    executePipeline(runState.formValues, failedStep.id, runState.campaignId);
  }, [runState, executePipeline]);

  const handleStartOver = useCallback(() => {
    setRunState(null);
    setView("form");
  }, []);

  if (view === "form") return <LaunchForm onSubmit={handleFormSubmit} />;

  if (view === "progress" && runState) {
    return (
      <Progress
        steps={runState.steps}
        campaignName={runState.campaignName}
        mode={runState.mode}
        onRetry={handleRetry}
        onStartOver={handleStartOver}
      />
    );
  }

  if (view === "result" && runState) {
    return (
      <Result
        mode={runState.mode}
        campaignName={runState.campaignName}
        campaignId={runState.campaignId}
        steps={runState.steps}
        sendGap={runState.formValues.campaignSettings.sendGapMinutes}
        skippedLeads={runState.skippedLeads}
        onReset={handleStartOver}
      />
    );
  }

  return null;
}
