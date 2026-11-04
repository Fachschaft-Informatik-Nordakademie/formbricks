"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TWorkflowListItem, TWorkflowSortBy, TWorkflowStatus } from "@formbricks/workflows";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import {
  WorkflowRunStatusBadge,
  WorkflowStatusBadge,
} from "@/modules/fsinf-ce/workflows/components/status-badges";
import { WorkflowActionsMenu } from "@/modules/fsinf-ce/workflows/components/workflow-actions-menu";
import { WorkflowsEmptyState } from "@/modules/fsinf-ce/workflows/components/workflows-empty-state";
import { useWorkflowDateFormat } from "@/modules/fsinf-ce/workflows/hooks/use-display-locale";
import { listWorkflows } from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";
import { WorkflowsListBodyLoading } from "@/modules/fsinf-ce/workflows/loading";
import { Button } from "@/modules/ui/components/button";
import { SearchBar } from "@/modules/ui/components/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

/**
 * FSINF CE: workflow list of a workspace — search, status filter, sort, cursor pagination, and the
 * per-row action menu. Reads `GET /api/v3/workflows` through TanStack Query.
 */

type TStatusFilter = "active" | TWorkflowStatus;

const STATUS_FILTERS: { value: TStatusFilter; labelKey: string }[] = [
  { value: "active", labelKey: "common.all" },
  { value: "draft", labelKey: "common.draft" },
  { value: "enabled", labelKey: "common.enabled" },
  { value: "disabled", labelKey: "common.disabled" },
  { value: "archived", labelKey: "common.archived" },
];

const SORT_OPTIONS: { value: TWorkflowSortBy; labelKey: string }[] = [
  { value: "updatedAt", labelKey: "common.updated" },
  { value: "createdAt", labelKey: "common.created" },
  { value: "name", labelKey: "workspace.workflows.alphabetical" },
];

const SEARCH_DEBOUNCE_MS = 300;

const WorkflowRow = ({
  workflow,
  workspaceId,
  isReadOnly,
}: Readonly<{ workflow: TWorkflowListItem; workspaceId: string; isReadOnly: boolean }>) => {
  const { t } = useTranslation();
  const { formatRelative } = useWorkflowDateFormat();

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs hover:border-slate-300">
      <Link href={`/workspaces/${workspaceId}/workflows/${workflow.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-slate-900">{workflow.name}</span>
          <WorkflowStatusBadge status={workflow.status} />
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {workflow.triggerType
            ? t("workspace.workflows.response_completed")
            : t("workspace.workflows.add_trigger")}
          {" · "}
          {t("workspace.workflows.run_count", { count: workflow.runCount })}
          {workflow.creator ? ` · ${workflow.creator.name}` : ""}
        </p>
      </Link>
      <div className="hidden w-44 flex-col items-end gap-1 text-xs text-slate-500 md:flex">
        {workflow.lastRun ? (
          <>
            <WorkflowRunStatusBadge status={workflow.lastRun.status} />
            <span>{formatRelative(workflow.lastRun.createdAt)}</span>
          </>
        ) : (
          <span>{t("workspace.workflows.never_run")}</span>
        )}
      </div>
      <div className="hidden w-32 text-right text-xs text-slate-500 lg:block">
        {t("common.updated")} {formatRelative(workflow.updatedAt)}
      </div>
      {isReadOnly ? null : <WorkflowActionsMenu workspaceId={workspaceId} workflow={workflow} />}
    </div>
  );
};

export const WorkflowsListPage = ({
  workspaceId,
  isReadOnly,
  workflowsPerPage,
}: Readonly<{ workspaceId: string; isReadOnly: boolean; workflowsPerPage: number }>) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [nameContains, setNameContains] = useState("");
  const [statusFilter, setStatusFilter] = useState<TStatusFilter>("active");
  const [sortBy, setSortBy] = useState<TWorkflowSortBy>("updatedAt");

  useEffect(() => {
    const timer = setTimeout(() => setNameContains(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // "All" means the API default: every status except archived.
  const statusIn: TWorkflowStatus[] = statusFilter === "active" ? [] : [statusFilter];

  const query = useInfiniteQuery({
    queryKey: workflowKeys.list({ workspaceId, limit: workflowsPerPage, nameContains, statusIn, sortBy }),
    initialPageParam: null as string | null,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      listWorkflows({
        workspaceId,
        limit: workflowsPerPage,
        cursor: pageParam,
        nameContains: nameContains || undefined,
        statusIn,
        sortBy,
        signal,
      }),
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });

  const workflows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const isFiltered = nameContains !== "" || statusFilter !== "active";

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          className="w-64"
          value={search}
          onChange={setSearch}
          placeholder={t("workspace.workflows.search_by_workflow_name")}
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TStatusFilter)}>
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
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as TWorkflowSortBy)}>
          <SelectTrigger className="h-8 w-40 bg-white" aria-label={t("common.sort_by")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? <WorkflowsListBodyLoading /> : null}

      {query.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {getV3ApiErrorMessage(query.error, t("workspace.workflows.load_failed"))}
        </div>
      ) : null}

      {query.isSuccess && workflows.length === 0 ? (
        isFiltered ? (
          <WorkflowsEmptyState
            title={t("workspace.workflows.no_results_title")}
            description={t("workspace.workflows.no_results_description")}
          />
        ) : (
          <WorkflowsEmptyState
            title={t("workspace.workflows.no_workflows_title")}
            description={t("workspace.workflows.no_workflows_description")}
          />
        )
      ) : null}

      <div className="space-y-2">
        {workflows.map((workflow) => (
          <WorkflowRow
            key={workflow.id}
            workflow={workflow}
            workspaceId={workspaceId}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>

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
    </div>
  );
};
