import { TJsWorkspaceStateSurvey } from "@formbricks/types/js";
import { TResponseQuotaLinkStatus, TSurveyQuota } from "@formbricks/types/quota";
import { TResponseData, TResponseVariables } from "@formbricks/types/responses";
import { evaluateLogic } from "@/lib/surveyLogic/utils";

/**
 * FSINF CE: pure quota evaluation — no database access, fully unit-tested.
 *
 * Semantics (see also `evaluation-service.ts`, which feeds this with locked counts):
 * - A response "matches" a quota when the quota's conditions evaluate to true against the response's
 *   answers, hidden fields and variables. Conditions are evaluated with the same AGPL survey-logic
 *   evaluator the editor's logic preview uses (`@/lib/surveyLogic/utils`).
 * - A matching response is *screened in* (and occupies one of `limit` slots) as soon as it counts:
 *   immediately with `countPartialSubmissions`, otherwise once it is finished.
 * - A matching response that arrives while the quota is already full is *screened out*. For
 *   `endSurvey` quotas the survey is ended for that respondent with the quota's ending card.
 * - A response whose answers no longer match loses its link (frees its slot). A response that already
 *   has a link that still matches keeps it unchanged — evaluations are idempotent.
 * - When the survey is ended by a quota, the response is not screened into any other quota in the same
 *   evaluation: it did not complete the survey, so it must not consume other quotas' slots.
 */

type TQuotaSurveyLanguage = { default: boolean; language: { code: string } };

export type TQuotaSurveyContext = Pick<TJsWorkspaceStateSurvey, "blocks" | "variables"> & {
  languages: TQuotaSurveyLanguage[];
};

export type TQuotaResponseContext = {
  data: TResponseData;
  variables?: TResponseVariables;
  /** Language code persisted on the response (`"default"`, a code such as `"de"`, or empty). */
  language?: string | null;
  finished: boolean;
};

/**
 * Maps the language stored on a response to the key used in the survey's i18n strings: the survey's
 * default language is stored under "default", every other language under its code. Same rule as
 * `getLanguageCode` in `@/lib/i18n/utils`, on the minimal language shape loaded inside the transaction.
 */
export const resolveSurveyLanguageKey = (
  surveyLanguages: TQuotaSurveyLanguage[],
  responseLanguage: string | null | undefined
): string => {
  if (!responseLanguage || responseLanguage === "default") return "default";
  const match = surveyLanguages.find(
    (surveyLanguage) => surveyLanguage.language.code.toLowerCase() === responseLanguage.toLowerCase()
  );
  if (!match || match.default) return "default";
  return match.language.code;
};

/** True when the response satisfies the quota's conditions. Malformed logic never matches. */
export const doesResponseMatchQuota = (
  quota: Pick<TSurveyQuota, "logic">,
  survey: TQuotaSurveyContext,
  response: Pick<TQuotaResponseContext, "data" | "variables" | "language">
): boolean => {
  const conditions = quota.logic?.conditions ?? [];
  if (conditions.length === 0) return false;

  try {
    return evaluateLogic(
      survey as TJsWorkspaceStateSurvey,
      response.data ?? {},
      response.variables ?? {},
      { id: "quota-root", connector: quota.logic.connector ?? "and", conditions },
      resolveSurveyLanguageKey(survey.languages, response.language)
    );
  } catch {
    return false;
  }
};

export type TQuotaEvaluationInput = {
  quota: Pick<TSurveyQuota, "id" | "limit" | "action" | "endingCardId" | "countPartialSubmissions">;
  matches: boolean;
  existingStatus: TResponseQuotaLinkStatus | null;
  /** Responses currently screened into the quota (excluding this one). Only needed for candidates. */
  screenedInCount: number;
};

export type TQuotaDecision = {
  quotaId: string;
  operation: "screenIn" | "screenOut" | "removeLink" | "none";
};

export type TQuotaEvaluationPlan<TQuota> = {
  decisions: TQuotaDecision[];
  /** Quota that rejected this response (screened out). `endSurvey` quotas take precedence. */
  quotaFull: TQuota | null;
  shouldEndSurvey: boolean;
};

/** Whether the quota needs a (locked) capacity check for this response. */
export const needsCapacityCheck = (matches: boolean, existingStatus: TResponseQuotaLinkStatus | null) =>
  matches && existingStatus === null;

export const planQuotaEvaluation = <TQuota extends TQuotaEvaluationInput["quota"]>(
  inputs: (TQuotaEvaluationInput & { quota: TQuota })[],
  responseFinished: boolean
): TQuotaEvaluationPlan<TQuota> => {
  const decisions: TQuotaDecision[] = [];
  let endingQuota: TQuota | null = null;
  let firstScreenedOut: TQuota | null = null;

  for (const { quota, matches, existingStatus, screenedInCount } of inputs) {
    if (!matches) {
      decisions.push({ quotaId: quota.id, operation: existingStatus ? "removeLink" : "none" });
      continue;
    }

    if (existingStatus) {
      decisions.push({ quotaId: quota.id, operation: "none" });
      continue;
    }

    if (screenedInCount >= quota.limit) {
      decisions.push({ quotaId: quota.id, operation: "screenOut" });
      firstScreenedOut ??= quota;
      if (quota.action === "endSurvey" && quota.endingCardId && !endingQuota) {
        endingQuota = quota;
      }
      continue;
    }

    const counts = quota.countPartialSubmissions || responseFinished;
    decisions.push({ quotaId: quota.id, operation: counts ? "screenIn" : "none" });
  }

  if (endingQuota) {
    // The respondent is sent to the quota's ending: do not let the aborted response occupy other slots.
    for (const decision of decisions) {
      if (decision.operation === "screenIn") decision.operation = "none";
    }
  }

  return {
    decisions,
    quotaFull: endingQuota ?? firstScreenedOut,
    shouldEndSurvey: endingQuota !== null,
  };
};
