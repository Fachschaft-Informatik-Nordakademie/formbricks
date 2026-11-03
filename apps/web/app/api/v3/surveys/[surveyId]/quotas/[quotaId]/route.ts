/**
 * FSINF CE: /api/v3/surveys/{surveyId}/quotas/{quotaId} — replace (PUT) or delete a survey quota.
 * Session cookie or x-api-key with readWrite on the survey's workspace. See
 * modules/fsinf-ce/quotas/api/operations.ts.
 */
import { z } from "zod";
import { withV3ApiWrapper } from "@/app/api/v3/lib/api-wrapper";
import { ZV3EmptyQuery } from "@/app/api/v3/surveys/schemas";
import { ZV3QuotaBody, deleteV3Quota, updateV3Quota } from "@/modules/fsinf-ce/quotas/api/operations";

const paramsSchema = z.object({
  surveyId: z.cuid2(),
  quotaId: z.cuid2(),
});

export const PUT = withV3ApiWrapper({
  auth: "both",
  action: "updated",
  targetType: "quota",
  schemas: { params: paramsSchema, query: ZV3EmptyQuery, body: ZV3QuotaBody },
  handler: async ({ parsedInput, authentication, requestId, instance, auditLog }) =>
    updateV3Quota(
      { surveyId: parsedInput.params.surveyId, authentication, requestId, instance, auditLog },
      parsedInput.params.quotaId,
      parsedInput.body
    ),
});

export const DELETE = withV3ApiWrapper({
  auth: "both",
  action: "deleted",
  targetType: "quota",
  schemas: { params: paramsSchema, query: ZV3EmptyQuery },
  handler: async ({ parsedInput, authentication, requestId, instance, auditLog }) =>
    deleteV3Quota(
      { surveyId: parsedInput.params.surveyId, authentication, requestId, instance, auditLog },
      parsedInput.params.quotaId
    ),
});
