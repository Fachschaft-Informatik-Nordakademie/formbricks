import { TSurveyQuota } from "@formbricks/types/quota";
import { parseV3ApiError } from "@/modules/api/lib/v3-client";
import type { TV3QuotaBody } from "../api/operations";

/**
 * FSINF CE: browser client for `/api/v3/surveys/{surveyId}/quotas`, used by the editor's quotas card via
 * TanStack Query. Errors are thrown as `V3ApiError` (problem+json detail).
 */

export type TQuotaListItem = TSurveyQuota & { screenedInCount: number };

type TQuotaJson = Omit<TSurveyQuota, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

const reviveQuota = <T extends TQuotaJson>(quota: T) => ({
  ...quota,
  createdAt: new Date(quota.createdAt),
  updatedAt: new Date(quota.updatedAt),
});

export const quotaKeys = {
  list: (surveyId: string) => ["fsinf-quotas", surveyId] as const,
};

const quotasUrl = (surveyId: string, quotaId?: string) =>
  `/api/v3/surveys/${encodeURIComponent(surveyId)}/quotas${quotaId ? `/${encodeURIComponent(quotaId)}` : ""}`;

const request = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    throw await parseV3ApiError(response);
  }
  return ((await response.json()) as { data: T }).data;
};

export const listQuotas = async (surveyId: string, signal?: AbortSignal): Promise<TQuotaListItem[]> => {
  const quotas = await request<(TQuotaJson & { screenedInCount: number })[]>(quotasUrl(surveyId), {
    method: "GET",
    signal,
  });
  return quotas.map(reviveQuota);
};

export const createQuotaRequest = async (surveyId: string, body: TV3QuotaBody): Promise<TSurveyQuota> =>
  reviveQuota(await request<TQuotaJson>(quotasUrl(surveyId), { method: "POST", body: JSON.stringify(body) }));

export const updateQuotaRequest = async (
  surveyId: string,
  quotaId: string,
  body: TV3QuotaBody
): Promise<TSurveyQuota> =>
  reviveQuota(
    await request<TQuotaJson>(quotasUrl(surveyId, quotaId), { method: "PUT", body: JSON.stringify(body) })
  );

export const deleteQuotaRequest = async (surveyId: string, quotaId: string): Promise<void> => {
  await request<{ id: string }>(quotasUrl(surveyId, quotaId), { method: "DELETE" });
};
