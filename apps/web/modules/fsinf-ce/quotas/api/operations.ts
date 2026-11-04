import "server-only";
import { z } from "zod";
import { logger } from "@formbricks/logger";
import {
  DatabaseError,
  InvalidInputError,
  ResourceNotFoundError,
  UniqueConstraintError,
} from "@formbricks/types/errors";
import { TSurveyQuotaInput, ZSurveyQuota, ZSurveyQuotaInput } from "@formbricks/types/quota";
import { TSurvey } from "@formbricks/types/surveys/types";
import {
  createdResponse,
  problemConflict,
  problemForbidden,
  problemInternalError,
  problemUnprocessableContent,
  successResponse,
} from "@/app/api/v3/lib/response";
import type { TV3AuditLog, TV3Authentication } from "@/app/api/v3/lib/types";
import { getAuthorizedV3Survey } from "@/app/api/v3/surveys/authorization";
import { getIsQuotasEnabled } from "@/modules/fsinf-ce/features";
import { createQuota, deleteQuota, getQuotasWithCounts, updateQuota } from "../lib/quotas";
import { findQuotaReferenceErrors } from "../lib/validation";

/**
 * FSINF CE: handlers behind `/api/v3/surveys/{surveyId}/quotas[/{quotaId}]`, used by the survey editor's
 * quotas card (TanStack Query) and usable with an API key.
 *
 * Authorization: the survey is resolved first and the caller needs `read` (list) or `readWrite`
 * (create/update/delete) on its workspace — the same rule as editing the survey itself. Every quota
 * query is additionally scoped by that survey id, so a foreign quota id yields "not found".
 */

/** Request body: a quota without server-owned fields. `surveyId` comes from the path. */
export const ZV3QuotaBody = ZSurveyQuota.pick({
  name: true,
  limit: true,
  logic: true,
  action: true,
  endingCardId: true,
  countPartialSubmissions: true,
}).strict();
export type TV3QuotaBody = z.infer<typeof ZV3QuotaBody>;

type TQuotaRequestContext = {
  surveyId: string;
  authentication: TV3Authentication;
  requestId: string;
  instance: string;
  auditLog?: TV3AuditLog;
};

type TAuthorizeResult =
  | { ok: true; survey: TSurvey; organizationId: string }
  | { ok: false; response: Response };

const authorize = async (
  context: TQuotaRequestContext,
  access: "read" | "readWrite"
): Promise<TAuthorizeResult> => {
  const { survey, authResult, response } = await getAuthorizedV3Survey({
    surveyId: context.surveyId,
    authentication: context.authentication,
    requestId: context.requestId,
    instance: context.instance,
    access,
  });
  if (response) return { ok: false, response };

  if (!(await getIsQuotasEnabled(authResult.organizationId))) {
    return {
      ok: false,
      response: problemForbidden(context.requestId, "Quotas are not available", context.instance),
    };
  }
  return { ok: true, survey, organizationId: authResult.organizationId };
};

const validateQuotaInput = (
  survey: TSurvey,
  body: TV3QuotaBody,
  context: TQuotaRequestContext
): { input: TSurveyQuotaInput; response: null } | { input: null; response: Response } => {
  const parsed = ZSurveyQuotaInput.safeParse({ ...body, surveyId: survey.id });
  if (!parsed.success) {
    return {
      input: null,
      response: problemUnprocessableContent(context.requestId, "Quota failed validation", {
        instance: context.instance,
        invalid_params: parsed.error.issues.map((issue) => ({
          name: issue.path.join(".") || "quota",
          reason: issue.message,
        })),
      }),
    };
  }

  const referenceErrors = findQuotaReferenceErrors(survey, parsed.data);
  if (referenceErrors.length > 0) {
    return {
      input: null,
      response: problemUnprocessableContent(context.requestId, referenceErrors[0].reason, {
        instance: context.instance,
        invalid_params: referenceErrors,
      }),
    };
  }

  return { input: parsed.data, response: null };
};

const mapQuotaError = (error: unknown, context: TQuotaRequestContext, operation: string): Response => {
  const log = logger.withContext({ requestId: context.requestId, surveyId: context.surveyId });

  if (error instanceof ResourceNotFoundError) {
    log.warn({ statusCode: 403, errorCode: error.name }, "Quota not found or not accessible");
    return problemForbidden(
      context.requestId,
      "You are not authorized to access this resource",
      context.instance
    );
  }
  if (error instanceof UniqueConstraintError) {
    return problemConflict(context.requestId, error.message, context.instance);
  }
  if (error instanceof InvalidInputError) {
    return problemUnprocessableContent(context.requestId, error.message, {
      instance: context.instance,
      invalid_params: [{ name: "limit", reason: error.message }],
    });
  }
  if (error instanceof DatabaseError) {
    log.error({ error, statusCode: 500 }, `Database error during quota ${operation}`);
    return problemInternalError(context.requestId, "An unexpected error occurred.", context.instance);
  }

  log.error({ error, statusCode: 500 }, `Unexpected error during quota ${operation}`);
  return problemInternalError(context.requestId, "An unexpected error occurred.", context.instance);
};

export const listV3Quotas = async (context: TQuotaRequestContext): Promise<Response> => {
  try {
    const auth = await authorize(context, "read");
    if (!auth.ok) return auth.response;

    const quotas = await getQuotasWithCounts(context.surveyId);
    return successResponse(quotas, { requestId: context.requestId, cache: "private, no-store" });
  } catch (error) {
    return mapQuotaError(error, context, "list");
  }
};

export const createV3Quota = async (context: TQuotaRequestContext, body: TV3QuotaBody): Promise<Response> => {
  try {
    const auth = await authorize(context, "readWrite");
    if (!auth.ok) return auth.response;

    const validated = validateQuotaInput(auth.survey, body, context);
    if (validated.response) return validated.response;

    const quota = await createQuota(validated.input);

    if (context.auditLog) {
      context.auditLog.targetId = quota.id;
      context.auditLog.organizationId = auth.organizationId;
      context.auditLog.newObject = quota;
    }

    return createdResponse(quota, {
      location: `/api/v3/surveys/${auth.survey.id}/quotas/${quota.id}`,
      requestId: context.requestId,
    });
  } catch (error) {
    return mapQuotaError(error, context, "create");
  }
};

export const updateV3Quota = async (
  context: TQuotaRequestContext,
  quotaId: string,
  body: TV3QuotaBody
): Promise<Response> => {
  try {
    const auth = await authorize(context, "readWrite");
    if (!auth.ok) return auth.response;

    const validated = validateQuotaInput(auth.survey, body, context);
    if (validated.response) return validated.response;

    const quota = await updateQuota(quotaId, validated.input);

    if (context.auditLog) {
      context.auditLog.targetId = quota.id;
      context.auditLog.organizationId = auth.organizationId;
      context.auditLog.newObject = quota;
    }

    return successResponse(quota, { requestId: context.requestId });
  } catch (error) {
    return mapQuotaError(error, context, "update");
  }
};

export const deleteV3Quota = async (context: TQuotaRequestContext, quotaId: string): Promise<Response> => {
  try {
    const auth = await authorize(context, "readWrite");
    if (!auth.ok) return auth.response;

    const deleted = await deleteQuota(quotaId, context.surveyId);

    if (context.auditLog) {
      context.auditLog.targetId = deleted.id;
      context.auditLog.organizationId = auth.organizationId;
      context.auditLog.oldObject = deleted;
    }

    return successResponse({ id: deleted.id }, { requestId: context.requestId });
  } catch (error) {
    return mapQuotaError(error, context, "delete");
  }
};
