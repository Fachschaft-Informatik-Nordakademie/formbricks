"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TWorkflowRunStatus } from "@formbricks/workflows";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import { WorkflowRunStatusBadge } from "@/modules/fsinf-ce/workflows/components/status-badges";
import { WorkflowRunDetailSheet } from "@/modules/fsinf-ce/workflows/components/workflow-run-detail-sheet";
import { WorkflowsEmptyState } from "@/modules/fsinf-ce/workflows/components/workflows-empty-state";
import { useWorkflowDateFormat } from "@/modules/fsinf-ce/workflows/hooks/use-display-locale";
import { listWorkflowRuns } from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";
import { WorkflowRunsBodyLoading } from "@/modules/fsinf-ce/workflows/loading";
import { Button } from "@/modules/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

/**
 * FSINF CE: run history table shared by the workspace-wide and the per-workflow runs pages
 * (`GET /api/v3/workflows/runs`, newest first). Rows open the run detail sheet; the list refreshes
 * itself while runs are still queued or running.
 */

const RUNS_PER_PAGE = 25;
const ACTIVE_POLL_MS = 10_000;

type TRunStatusFilter = "all" | TWorkflowRunStatus;

const STATUS_FILTERS: { value: TRunStatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "common.all" },
  { value: "queued", labelKey: "common.queued" },
  { value: "running", labelKey: "common.running" },
  { value: "completed", labelKey: "common.completed" },
  { value: "failed", labelKey: "common.failed" },
  { value: "canceled", labelKey: "common.canceled" },
];

export const WorkflowRunsView = ({
  workspaceId,
  workflowId,
}: Readonly<{ workspaceId: string; workflowId?: string }>) => {
  const { t } = useTranslation();
  const { formatRelative, formatDateTime } = useWorkflowDateFormat();
  const [statusFilter, setStatusFilter] = useState<TRunStatusFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const statusIn: TWorkflowRunStatus[] = statusFilter === "all" ? [] : [statusFilter];

  const query = useInfiniteQuery({
    queryKey: workflowKeys.runList({ workspaceId, workflowId, statusIn }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listWorkflowRuns({
        workspaceId,
        workflowId,
        statusIn,
        limit: RUNS_PER_PAGE,
        cursor: pageParam,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    refetchInterval: (current) =>
      current.state.data?.pages[0]?.data.some((run) => run.status === "queued" || run.status === "running")
        ? ACTIVE_POLL_MS
        : false,
  });

  const runs = query.data?.pages.flatMap((page) => page.data) ?? [];
  const showWorkflowColumn = !workflowId;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TRunStatusFilter)}>
          <SelectTrigger className="h-8 w-40 bg-white" aria-label={t("common.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          loading={query.isRefetching}
          onClick={() => void query.refetch()}>
          {t("common.refresh")}
        </Button>
      </div>

      {query.isPending ? <WorkflowRunsBodyLoading /> : null}

      {query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {getV3ApiErrorMessage(query.error, t("workspace.workflows.load_failed"))}
        </div>
      ) : null}

      {query.isSuccess && runs.length === 0 ? (
        <WorkflowsEmptyState
          title={t("workspace.workflows.runs_empty_title")}
          description={t("workspace.workflows.runs_empty_description")}
        />
      ) : null}

      {runs.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("common.status")}</th>
                {showWorkflowColumn ? (
                  <th className="px-4 py-2 font-medium">{t("common.workflow_name")}</th>
                ) : null}
                <th className="px-4 py-2 font-medium">{t("common.trigger")}</th>
                <th className="px-4 py-2 font-medium">{t("common.created_at")}</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">{t("common.attempt")}</th>
                <th className="hidden px-4 py-2 font-medium lg:table-cell">{t("common.error")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  tabIndex={0}
                  onClick={() => setSelectedRunId(run.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedRunId(run.id);
                    }
                  }}>
                  <td className="px-4 py-2">
                    <WorkflowRunStatusBadge status={run.status} />
                  </td>
                  {showWorkflowColumn ? (
                    <td className="px-4 py-2">
                      <Link
                        className="text-slate-900 hover:underline"
                        href={`/workspaces/${workspaceId}/workflows/${run.workflowId}`}
                        onClick={(event) => event.stopPropagation()}>
                        {run.workflowName}
                      </Link>
                    </td>
                  ) : null}
                  <td className="px-4 py-2 text-slate-600">{t("workspace.workflows.response_completed")}</td>
                  <td className="px-4 py-2 text-slate-600" title={formatDateTime(run.createdAt)}>
                    {formatRelative(run.createdAt)}
                  </td>
                  <td className="hidden px-4 py-2 text-slate-600 md:table-cell">{run.attempt}</td>
                  <td className="hidden max-w-xs truncate px-4 py-2 text-red-600 lg:table-cell">
                    {run.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}>
            {t("common.load_more")}
          </Button>
        </div>
      ) : null}

      <WorkflowRunDetailSheet
        runId={selectedRunId}
        workspaceId={workspaceId}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null);
        }}
      />
    </div>
  );
};
