/**
 * FSINF CE: /api/v3/surveys/{surveyId}/quotas — list (with screened-in counts) and create survey quotas.
 * Session cookie or x-api-key; read access to list, readWrite to create. See
 * modules/fsinf-ce/quotas/api/operations.ts.
 */
import { z } from "zod";
import { withV3ApiWrapper } from "@/app/api/v3/lib/api-wrapper";
import { ZV3EmptyQuery } from "@/app/api/v3/surveys/schemas";
import { ZV3QuotaBody, createV3Quota, listV3Quotas } from "@/modules/fsinf-ce/quotas/api/operations";

const paramsSchema = z.object({
  surveyId: z.cuid2(),
});

export const GET = withV3ApiWrapper({
  auth: "both",
  schemas: { params: paramsSchema, query: ZV3EmptyQuery },
  handler: async ({ parsedInput, authentication, requestId, instance }) =>
    listV3Quotas({ surveyId: parsedInput.params.surveyId, authentication, requestId, instance }),
});

export const POST = withV3ApiWrapper({
  auth: "both",
  action: "created",
  targetType: "quota",
  schemas: { params: paramsSchema, query: ZV3EmptyQuery, body: ZV3QuotaBody },
  handler: async ({ parsedInput, authentication, requestId, instance, auditLog }) =>
    createV3Quota(
      { surveyId: parsedInput.params.surveyId, authentication, requestId, instance, auditLog },
      parsedInput.body
    ),
});
