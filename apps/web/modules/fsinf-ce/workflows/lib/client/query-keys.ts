import type { TWorkflowRunStatus, TWorkflowSortBy, TWorkflowStatus } from "@formbricks/workflows";

/** FSINF CE: TanStack Query keys of the workflows dashboard, so invalidation stays consistent. */
export const workflowKeys = {
  all: ["fsinf-workflows"] as const,
  lists: () => [...workflowKeys.all, "list"] as const,
  list: (params: {
    workspaceId: string;
    limit: number;
    nameContains: string;
    statusIn: TWorkflowStatus[];
    sortBy: TWorkflowSortBy;
  }) => [...workflowKeys.lists(), params] as const,
  detail: (workflowId: string) => [...workflowKeys.all, "detail", workflowId] as const,
  test: (workflowId: string) => [...workflowKeys.all, "test", workflowId] as const,
  runs: () => [...workflowKeys.all, "runs"] as const,
  runList: (params: { workspaceId: string; workflowId?: string; statusIn: TWorkflowRunStatus[] }) =>
    [...workflowKeys.runs(), "list", params] as const,
  run: (runId: string) => [...workflowKeys.runs(), "detail", runId] as const,
};
