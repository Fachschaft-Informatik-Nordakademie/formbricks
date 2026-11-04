import type {
  TCursorPage,
  TPatchWorkflowInput,
  TWorkflowDefinition,
  TWorkflowListItem,
  TWorkflowResource,
  TWorkflowRunListItem,
  TWorkflowRunResource,
  TWorkflowRunStatus,
  TWorkflowSortBy,
  TWorkflowStatus,
  TWorkflowTestResult,
} from "@formbricks/workflows";
import { parseV3ApiError } from "@/modules/api/lib/v3-client";

/**
 * FSINF CE: browser client for the AGPL `/api/v3/workflows` endpoints (session-cookie auth). All
 * workflow reads and writes of the dashboard go through here and TanStack Query; there are no server
 * actions. Failures throw `V3ApiError` with the problem `detail` / `invalid_params`.
 */

const BASE = "/api/v3/workflows";

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  if (!response.ok) {
    throw await parseV3ApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const listWorkflows = async ({
  workspaceId,
  limit,
  cursor,
  nameContains,
  statusIn,
  sortBy,
  signal,
}: {
  workspaceId: string;
  limit: number;
  cursor?: string | null;
  nameContains?: string;
  statusIn?: TWorkflowStatus[];
  sortBy?: TWorkflowSortBy;
  signal?: AbortSignal;
}): Promise<TCursorPage<TWorkflowListItem>> => {
  const params = new URLSearchParams({ workspaceId, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  if (nameContains) params.set("filter[name][contains]", nameContains);
  if (sortBy) params.set("sortBy", sortBy);
  for (const status of statusIn ?? []) params.append("filter[status][in]", status);

  return request<TCursorPage<TWorkflowListItem>>(`${BASE}?${params.toString()}`, { signal });
};

export const getWorkflow = async (workflowId: string, signal?: AbortSignal): Promise<TWorkflowResource> =>
  (await request<{ data: TWorkflowResource }>(`${BASE}/${workflowId}`, { signal })).data;

export const createWorkflow = async (input: {
  workspaceId: string;
  name: string;
  definition: TWorkflowDefinition;
}): Promise<TWorkflowResource> =>
  (await request<{ data: TWorkflowResource }>(BASE, { method: "POST", body: JSON.stringify(input) })).data;

export const patchWorkflow = async (
  workflowId: string,
  patch: TPatchWorkflowInput
): Promise<TWorkflowResource> =>
  (
    await request<{ data: TWorkflowResource }>(`${BASE}/${workflowId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    })
  ).data;

export const deleteWorkflow = async (workflowId: string): Promise<void> =>
  request<void>(`${BASE}/${workflowId}`, { method: "DELETE" });

export type TWorkflowLifecycleAction = "enable" | "disable" | "archive" | "unarchive" | "duplicate";

export const runWorkflowLifecycleAction = async (
  workflowId: string,
  action: TWorkflowLifecycleAction
): Promise<TWorkflowResource> =>
  (
    await request<{ data: TWorkflowResource }>(`${BASE}/${workflowId}/${action}`, {
      method: "POST",
      ...(action === "duplicate" ? { body: "{}" } : {}),
    })
  ).data;

export const testWorkflow = async (workflowId: string): Promise<TWorkflowTestResult> =>
  (await request<{ data: TWorkflowTestResult }>(`${BASE}/${workflowId}/test`, { method: "POST" })).data;

export const listWorkflowRuns = async ({
  workspaceId,
  workflowId,
  statusIn,
  limit,
  cursor,
  signal,
}: {
  workspaceId: string;
  workflowId?: string;
  statusIn?: TWorkflowRunStatus[];
  limit: number;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<TCursorPage<TWorkflowRunListItem>> => {
  const params = new URLSearchParams({ workspaceId, limit: String(limit) });
  if (workflowId) params.set("workflowId", workflowId);
  if (cursor) params.set("cursor", cursor);
  for (const status of statusIn ?? []) params.append("filter[status][in]", status);

  return request<TCursorPage<TWorkflowRunListItem>>(`${BASE}/runs?${params.toString()}`, { signal });
};

export const getWorkflowRun = async (runId: string, signal?: AbortSignal): Promise<TWorkflowRunResource> =>
  (await request<{ data: TWorkflowRunResource }>(`${BASE}/runs/${runId}`, { signal })).data;
