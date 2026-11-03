import { TSurveyQuotaInput } from "@formbricks/types/quota";
import { TSurvey } from "@formbricks/types/surveys/types";
import type { InvalidParam } from "@/app/api/v3/lib/response";
import { getElementsFromBlocks } from "@/modules/survey/lib/client-utils";

/**
 * FSINF CE: reference validation for quotas written through the v3 API.
 *
 * Checks that everything a quota points at exists in the saved survey: the ending card it ends on and
 * the questions, hidden fields and variables its conditions read. A quota referencing unsaved editor
 * state would silently never match (or send respondents to a missing ending), so it is rejected instead.
 */
export const findQuotaReferenceErrors = (
  survey: Pick<TSurvey, "blocks" | "endings" | "hiddenFields" | "variables">,
  quota: Pick<TSurveyQuotaInput, "action" | "endingCardId" | "logic">
): InvalidParam[] => {
  const errors: InvalidParam[] = [];

  if (quota.action === "endSurvey" && !survey.endings.some((ending) => ending.id === quota.endingCardId)) {
    errors.push({
      name: "endingCardId",
      reason: "The ending card does not exist in the saved survey. Save the survey first.",
      code: "invalid_reference",
      referenceType: "ending",
      missingId: quota.endingCardId ?? undefined,
    });
  }

  const referenceTargets: Record<string, { ids: Set<string>; referenceType: InvalidParam["referenceType"] }> =
    {
      element: {
        ids: new Set(getElementsFromBlocks(survey.blocks).map((element) => element.id)),
        referenceType: "element",
      },
      hiddenField: { ids: new Set(survey.hiddenFields.fieldIds ?? []), referenceType: "hiddenField" },
      variable: { ids: new Set(survey.variables.map((variable) => variable.id)), referenceType: "variable" },
    };

  const checkOperand = (operand: { type: string; value: unknown } | undefined, name: string) => {
    if (!operand || typeof operand.value !== "string") return;
    const target = referenceTargets[operand.type];
    if (target && !target.ids.has(operand.value)) {
      errors.push({
        name,
        reason: `The referenced ${operand.type} does not exist in the saved survey. Save the survey first.`,
        code: "dangling_reference",
        referenceType: target.referenceType,
        missingId: operand.value,
      });
    }
  };

  quota.logic.conditions.forEach((condition, index) => {
    checkOperand(condition.leftOperand, `logic.conditions.${index}.leftOperand`);
    checkOperand(condition.rightOperand, `logic.conditions.${index}.rightOperand`);
  });

  return errors;
};
