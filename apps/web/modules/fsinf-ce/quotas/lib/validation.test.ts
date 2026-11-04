import { describe, expect, test } from "vitest";
import { TSurveyQuotaInput } from "@formbricks/types/quota";
import { TSurvey } from "@formbricks/types/surveys/types";
import { findQuotaReferenceErrors } from "./validation";

// FSINF CE: quota reference validation against the saved survey.

const survey = {
  blocks: [{ id: "b1", name: "Block", elements: [{ id: "age", type: "openText" }] }],
  endings: [{ id: "end1", type: "endScreen" }],
  hiddenFields: { enabled: true, fieldIds: ["source"] },
  variables: [{ id: "v1", name: "points", type: "number", value: 0 }],
} as unknown as Pick<TSurvey, "blocks" | "endings" | "hiddenFields" | "variables">;

const quota = (overrides: Partial<TSurveyQuotaInput> = {}) =>
  ({
    action: "endSurvey",
    endingCardId: "end1",
    logic: {
      connector: "and",
      conditions: [
        {
          id: "c1",
          leftOperand: { type: "element", value: "age" },
          operator: "equals",
          rightOperand: { type: "hiddenField", value: "source" },
        },
        {
          id: "c2",
          leftOperand: { type: "variable", value: "v1" },
          operator: "isGreaterThan",
          rightOperand: { type: "static", value: 3 },
        },
      ],
    },
    ...overrides,
  }) as TSurveyQuotaInput;

describe("findQuotaReferenceErrors", () => {
  test("accepts a quota whose references all exist", () => {
    expect(findQuotaReferenceErrors(survey, quota())).toEqual([]);
  });

  test("rejects an endSurvey quota pointing at a missing ending card", () => {
    const errors = findQuotaReferenceErrors(survey, quota({ endingCardId: "unsaved" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ name: "endingCardId", referenceType: "ending", missingId: "unsaved" });
  });

  test("ignores the ending card for continueSurvey quotas", () => {
    expect(findQuotaReferenceErrors(survey, quota({ action: "continueSurvey", endingCardId: null }))).toEqual(
      []
    );
  });

  test("reports conditions on unknown questions, hidden fields and variables", () => {
    const errors = findQuotaReferenceErrors(
      survey,
      quota({
        logic: {
          connector: "or",
          conditions: [
            {
              id: "c1",
              leftOperand: { type: "element", value: "new-question" },
              operator: "isSubmitted",
            },
            {
              id: "c2",
              leftOperand: { type: "hiddenField", value: "gone" },
              operator: "equals",
              rightOperand: { type: "variable", value: "v-missing" },
            },
          ],
        },
      })
    );

    expect(errors.map((error) => [error.name, error.missingId])).toEqual([
      ["logic.conditions.0.leftOperand", "new-question"],
      ["logic.conditions.1.leftOperand", "gone"],
      ["logic.conditions.1.rightOperand", "v-missing"],
    ]);
  });
});
