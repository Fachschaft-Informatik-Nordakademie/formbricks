"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { TWorkflowRunLogResource } from "@formbricks/workflows";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import {
  WorkflowRunStatusBadge,
  WorkflowStepStatusBadge,
} from "@/modules/fsinf-ce/workflows/components/status-badges";
import { useWorkflowDateFormat } from "@/modules/fsinf-ce/workflows/hooks/use-display-locale";
import { getWorkflowRun } from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/modules/ui/components/sheet";
import { Skeleton } from "@/modules/ui/components/skeleton";

/**
 * FSINF CE: detail of one workflow run (`GET /api/v3/workflows/runs/{id}`): status, timing, the
 * triggering response, and the per-step log (input, output, error). Polls while the run is active.
 */

const ACTIVE_POLL_MS = 5_000;

const JsonBlock = ({ value }: Readonly<{ value: unknown }>) => (
  <pre className="max-h-48 overflow-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
    {JSON.stringify(value, null, 2)}
  </pre>
);

const StepLog = ({ log }: Readonly<{ log: TWorkflowRunLogResource }>) => {
  const { t } = useTranslation();
  const { formatDateTime } = useWorkflowDateFormat();

  return (
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">
          {t("workspace.workflows.step_number", { number: log.sequence + 1 })} ·{" "}
          {log.stepType === "send_email" ? t("workspace.workflows.send_email") : log.stepType}
        </span>
        <WorkflowStepStatusBadge status={log.status} />
      </div>
      {log.startedAt ? (
        <p className="text-xs text-slate-500">
          {t("common.started_at")}: {formatDateTime(log.startedAt)}
          {log.finishedAt ? ` · ${t("common.finished_at")}: ${formatDateTime(log.finishedAt)}` : ""}
        </p>
      ) : null}
      {log.error ? <p className="text-sm text-red-600">{log.error}</p> : null}
      <div className="grid gap-2">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">{t("workspace.workflows.step_input")}</p>
          <JsonBlock value={log.input} />
        </div>
        {Object.keys(log.output).length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">{t("workspace.workflows.step_output")}</p>
            <JsonBlock value={log.output} />
          </div>
        ) : null}
      </div>
    </li>
  );
};

export const WorkflowRunDetailSheet = ({
  runId,
  workspaceId,
  onOpenChange,
}: Readonly<{ runId: string | null; workspaceId: string; onOpenChange: (open: boolean) => void }>) => {
  const { t } = useTranslation();
  const { formatDateTime } = useWorkflowDateFormat();

  const query = useQuery({
    queryKey: workflowKeys.run(runId ?? ""),
    queryFn: ({ signal }) => getWorkflowRun(runId ?? "", signal),
    enabled: !!runId,
    refetchInterval: (current) =>
      current.state.data?.status === "queued" || current.state.data?.status === "running"
        ? ACTIVE_POLL_MS
        : false,
  });
  const run = query.data;

  return (
    <Sheet open={!!runId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("workspace.workflows.run_details")}</SheetTitle>
          <SheetDescription>{runId}</SheetDescription>
        </SheetHeader>

        {query.isPending && runId ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}

        {query.isError ? (
          <p className="mt-6 text-sm text-red-600">
            {getV3ApiErrorMessage(query.error, t("workspace.workflows.load_failed"))}
          </p>
        ) : null}

        {run ? (
          <div className="mt-6 space-y-6">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">{t("common.status")}</dt>
              <dd className="flex items-center gap-2">
                <WorkflowRunStatusBadge status={run.status} />
                {run.isDryRun ? (
                  <span className="text-xs text-slate-500">{t("workspace.workflows.dry_run")}</span>
                ) : null}
              </dd>
              <dt className="text-slate-500">{t("common.trigger")}</dt>
              <dd>{t("workspace.workflows.response_completed")}</dd>
              {run.responseId && run.surveyId ? (
                <>
                  <dt className="text-slate-500">{t("common.response")}</dt>
                  <dd>
                    <Link
                      className="text-slate-900 underline"
                      href={`/workspaces/${workspaceId}/surveys/${run.surveyId}/responses`}>
                      {run.responseId}
                    </Link>
                  </dd>
                </>
              ) : null}
              <dt className="text-slate-500">{t("common.created_at")}</dt>
              <dd>{formatDateTime(run.createdAt)}</dd>
              {run.startedAt ? (
                <>
                  <dt className="text-slate-500">{t("common.started_at")}</dt>
                  <dd>{formatDateTime(run.startedAt)}</dd>
                </>
              ) : null}
              {run.finishedAt ? (
                <>
                  <dt className="text-slate-500">{t("common.finished_at")}</dt>
                  <dd>{formatDateTime(run.finishedAt)}</dd>
                </>
              ) : null}
              <dt className="text-slate-500">{t("common.attempt")}</dt>
              <dd>{run.attempt}</dd>
              {run.nextAttemptAt ? (
                <>
                  <dt className="text-slate-500">{t("workspace.workflows.next_attempt")}</dt>
                  <dd>{formatDateTime(run.nextAttemptAt)}</dd>
                </>
              ) : null}
            </dl>

            {run.error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {run.error}
              </div>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t("common.steps")}</h3>
              {run.logs.length === 0 ? (
                <p className="text-sm text-slate-500">{t("workspace.workflows.no_steps_logged")}</p>
              ) : (
                <ol className="space-y-2">
                  {run.logs.map((log) => (
                    <StepLog key={log.id} log={log} />
                  ))}
                </ol>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{t("common.trigger_payload")}</h3>
              <JsonBlock value={run.triggerPayload} />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
