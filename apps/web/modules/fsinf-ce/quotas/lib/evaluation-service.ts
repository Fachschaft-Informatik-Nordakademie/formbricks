import "server-only";
import { Prisma, Response } from "@formbricks/database/prisma";
import { logger } from "@formbricks/logger";
import { TResponseQuotaLinkStatus, TSurveyQuota } from "@formbricks/types/quota";
import { TResponseData, TResponseVariables } from "@formbricks/types/responses";
import { doesResponseMatchQuota, needsCapacityCheck, planQuotaEvaluation } from "./evaluation";
import { quotaSelect } from "./quotas";

/**
 * FSINF CE: evaluates a response against its survey's quotas inside the caller's response transaction.
 *
 * Called by every response create/update path (client v1/v2, management v1/v2) right after the response
 * row was written with `tx`. Race safety: before counting, every quota the response matches is row-locked
 * (`SELECT … FOR UPDATE`, in id order to avoid deadlocks). Parallel submissions for the same quota
 * therefore serialize on the lock, and each one counts the screened-in links committed before it — the
 * limit can never be exceeded. Locks are released when the caller's transaction commits.
 *
 * Contract with the call sites:
 * - `quotaFull`: the quota that screened this response out (or null). Client APIs turn it into
 *   `{ quotaFull: true, quota: { id, action, endingCardId } }` via `createQuotaFullObject`, which makes the
 *   survey renderer end the survey on the quota's ending card for `endSurvey` quotas.
 * - `shouldEndSurvey`: an `endSurvey` quota was full. The response was then marked finished with the
 *   quota's ending card, and `refreshedResponse` holds that updated row.
 */

export type TEvaluateResponseQuotasInput = {
  surveyId: string;
  responseId: string;
  data: TResponseData;
  variables?: TResponseVariables;
  language?: string | null;
  responseFinished: boolean;
  tx: Prisma.TransactionClient;
};

export type TEvaluateResponseQuotasResult = {
  shouldEndSurvey: boolean;
  quotaFull?: TSurveyQuota | null;
  refreshedResponse?: Response | null;
};

const NO_QUOTA_RESULT: TEvaluateResponseQuotasResult = {
  shouldEndSurvey: false,
  quotaFull: null,
  refreshedResponse: null,
};

const lockQuotas = async (tx: Prisma.TransactionClient, quotaIds: string[]) => {
  if (quotaIds.length === 0) return;
  const sortedIds = [...quotaIds].sort();
  await tx.$queryRaw`
    SELECT "id" FROM "SurveyQuota" WHERE "id" IN (${Prisma.join(sortedIds)}) ORDER BY "id" FOR UPDATE`;
};

export const evaluateResponseQuotas = async ({
  surveyId,
  responseId,
  data,
  variables,
  language,
  responseFinished,
  tx,
}: TEvaluateResponseQuotasInput): Promise<TEvaluateResponseQuotasResult> => {
  const quotas: TSurveyQuota[] = await tx.surveyQuota.findMany({
    where: { surveyId },
    select: quotaSelect,
    orderBy: { createdAt: "asc" },
  });
  if (quotas.length === 0) {
    return NO_QUOTA_RESULT;
  }

  // Read the survey definition through the transaction, not the viewer-scoped `getSurvey`: quota
  // evaluation is a system concern and must not depend on who sends the response.
  const surveyContext = await tx.survey.findUnique({
    where: { id: surveyId },
    select: {
      blocks: true,
      variables: true,
      languages: { select: { default: true, language: { select: { code: true } } } },
    },
  });
  if (!surveyContext) {
    return NO_QUOTA_RESULT;
  }

  const matchesByQuotaId = new Map(
    quotas.map((quota) => [
      quota.id,
      doesResponseMatchQuota(quota, surveyContext, { data, variables, language }),
    ])
  );

  // Lock before reading links and counts, so both reflect everything committed before us.
  await lockQuotas(
    tx,
    quotas.filter((quota) => matchesByQuotaId.get(quota.id)).map((quota) => quota.id)
  );

  const existingLinks = await tx.responseQuotaLink.findMany({
    where: { responseId, quotaId: { in: quotas.map((quota) => quota.id) } },
    select: { quotaId: true, status: true },
  });
  const existingStatusByQuotaId = new Map<string, TResponseQuotaLinkStatus>(
    existingLinks.map((link) => [link.quotaId, link.status])
  );

  const inputs = [];
  for (const quota of quotas) {
    const matches = matchesByQuotaId.get(quota.id) ?? false;
    const existingStatus = existingStatusByQuotaId.get(quota.id) ?? null;
    const screenedInCount = needsCapacityCheck(matches, existingStatus)
      ? await tx.responseQuotaLink.count({ where: { quotaId: quota.id, status: "screenedIn" } })
      : 0;
    inputs.push({ quota, matches, existingStatus, screenedInCount });
  }

  const plan = planQuotaEvaluation(inputs, responseFinished);

  const removeIds = plan.decisions.filter((d) => d.operation === "removeLink").map((d) => d.quotaId);
  if (removeIds.length > 0) {
    await tx.responseQuotaLink.deleteMany({ where: { responseId, quotaId: { in: removeIds } } });
  }

  const newLinks = plan.decisions.flatMap((decision) => {
    if (decision.operation === "screenIn") {
      return [{ responseId, quotaId: decision.quotaId, status: "screenedIn" as const }];
    }
    if (decision.operation === "screenOut") {
      return [{ responseId, quotaId: decision.quotaId, status: "screenedOut" as const }];
    }
    return [];
  });
  if (newLinks.length > 0) {
    await tx.responseQuotaLink.createMany({ data: newLinks, skipDuplicates: true });
  }

  if (!plan.shouldEndSurvey || !plan.quotaFull) {
    return { shouldEndSurvey: false, quotaFull: plan.quotaFull, refreshedResponse: null };
  }

  const refreshedResponse = await tx.response.update({
    where: { id: responseId },
    data: { finished: true, endingId: plan.quotaFull.endingCardId },
  });

  logger.info(
    { surveyId, responseId, quotaId: plan.quotaFull.id },
    "Response screened out by a full quota; survey ended"
  );

  return { shouldEndSurvey: true, quotaFull: plan.quotaFull, refreshedResponse };
};
