import { TSurveyQuota, TSurveyQuotaAction } from "@formbricks/types/quota";

/**
 * FSINF CE: wire format of the quota part of the client response APIs (v1/v2 POST + PUT).
 *
 * `packages/surveys` (api-client.ts / response-queue.ts) reads exactly this shape: on
 * `quotaFull: true` it calls `onQuotaFull` with the quota's action, and for `endSurvey` it finishes the
 * survey and jumps to `endingCardId`. Nothing else about the quota (name, logic, limit) leaves the server.
 */
export type TQuotaFullWireObject =
  | {
      quotaFull: true;
      quota: { id: string; action: TSurveyQuotaAction; endingCardId?: string };
    }
  | { quotaFull: false };

export const createQuotaFullObject = (
  quotaFull?: Pick<TSurveyQuota, "id" | "action" | "endingCardId"> | null
): TQuotaFullWireObject => {
  if (!quotaFull) {
    return { quotaFull: false };
  }

  return {
    quotaFull: true,
    quota: {
      id: quotaFull.id,
      action: quotaFull.action,
      ...(quotaFull.action === "endSurvey" && quotaFull.endingCardId
        ? { endingCardId: quotaFull.endingCardId }
        : {}),
    },
  };
};
