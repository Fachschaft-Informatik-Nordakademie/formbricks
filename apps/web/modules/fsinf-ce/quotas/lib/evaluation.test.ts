import { describe, expect, test } from "vitest";
import { TSurveyQuota } from "@formbricks/types/quota";
import {
  TQuotaEvaluationInput,
  TQuotaSurveyContext,
  doesResponseMatchQuota,
  needsCapacityCheck,
  planQuotaEvaluation,
  resolveSurveyLanguageKey,
} from "./evaluation";

// FSINF CE: unit tests for the pure quota evaluation (matching + screening decisions).

const survey = {
  blocks: [
    {
      id: "block1",
      name: "Block 1",
      elements: [
        {
          id: "age",
          type: "multipleChoiceSingle",
          headline: { default: "Age", de: "Alter" },
          required: true,
          choices: [
            { id: "young", label: { default: "18-25", de: "18-25 Jahre" } },
            { id: "old", label: { default: "26+", de: "26+ Jahre" } },
          ],
        },
        {
          id: "score",
          type: "openText",
          inputType: "number",
          headline: { default: "Score" },
          required: false,
          charLimit: { enabled: false },
        },
      ],
    },
  ],
  variables: [{ id: "v1", name: "points", type: "number", value: 0 }],
  languages: [
    { language: { id: "l1", code: "en", alias: null }, default: true, enabled: true },
    { language: { id: "l2", code: "de", alias: null }, default: false, enabled: true },
  ],
} as unknown as TQuotaSurveyContext;

const youngQuotaLogic: TSurveyQuota["logic"] = {
  connector: "and",
  conditions: [
    {
      id: "c1",
      leftOperand: { type: "element", value: "age" },
      operator: "equals",
      rightOperand: { type: "static", value: "young" },
    },
  ],
};

const makeQuota = (
  overrides: Partial<TQuotaEvaluationInput["quota"]> = {}
): TQuotaEvaluationInput["quota"] => ({
  id: "q1",
  limit: 2,
  action: "endSurvey",
  endingCardId: "ending1",
  countPartialSubmissions: false,
  ...overrides,
});

describe("resolveSurveyLanguageKey", () => {
  test("maps empty and default-language codes to 'default'", () => {
    expect(resolveSurveyLanguageKey(survey.languages, undefined)).toBe("default");
    expect(resolveSurveyLanguageKey(survey.languages, null)).toBe("default");
    expect(resolveSurveyLanguageKey(survey.languages, "default")).toBe("default");
    expect(resolveSurveyLanguageKey(survey.languages, "en")).toBe("default");
  });

  test("keeps the code of a non-default survey language", () => {
    expect(resolveSurveyLanguageKey(survey.languages, "de")).toBe("de");
  });
});

describe("doesResponseMatchQuota", () => {
  test("matches a choice answer stored as its label", () => {
    expect(doesResponseMatchQuota({ logic: youngQuotaLogic }, survey, { data: { age: "18-25" } })).toBe(true);
    expect(doesResponseMatchQuota({ logic: youngQuotaLogic }, survey, { data: { age: "26+" } })).toBe(false);
  });

  test("resolves translated labels with the response language", () => {
    expect(
      doesResponseMatchQuota({ logic: youngQuotaLogic }, survey, {
        data: { age: "18-25 Jahre" },
        language: "de",
      })
    ).toBe(true);
  });

  test("does not match an unanswered question", () => {
    expect(doesResponseMatchQuota({ logic: youngQuotaLogic }, survey, { data: {} })).toBe(false);
  });

  test("never matches a quota without conditions", () => {
    expect(
      doesResponseMatchQuota({ logic: { connector: "and", conditions: [] } }, survey, {
        data: { age: "18-25" },
      })
    ).toBe(false);
  });

  test("honours the and/or connector", () => {
    const conditions: TSurveyQuota["logic"]["conditions"] = [
      ...youngQuotaLogic.conditions,
      {
        id: "c2",
        leftOperand: { type: "element", value: "score" },
        operator: "isGreaterThan",
        rightOperand: { type: "static", value: 5 },
      },
    ];
    const response = { data: { age: "18-25", score: 3 } };

    expect(doesResponseMatchQuota({ logic: { connector: "and", conditions } }, survey, response)).toBe(false);
    expect(doesResponseMatchQuota({ logic: { connector: "or", conditions } }, survey, response)).toBe(true);
  });

  test("evaluates variables and hidden fields", () => {
    const logic: TSurveyQuota["logic"] = {
      connector: "and",
      conditions: [
        {
          id: "c1",
          leftOperand: { type: "variable", value: "v1" },
          operator: "isGreaterThanOrEqual",
          rightOperand: { type: "static", value: 10 },
        },
        {
          id: "c2",
          leftOperand: { type: "hiddenField", value: "source" },
          operator: "equals",
          rightOperand: { type: "static", value: "mail" },
        },
      ],
    };

    expect(
      doesResponseMatchQuota({ logic }, survey, { data: { source: "mail" }, variables: { v1: 12 } })
    ).toBe(true);
    expect(
      doesResponseMatchQuota({ logic }, survey, { data: { source: "web" }, variables: { v1: 12 } })
    ).toBe(false);
  });

  test("treats conditions on deleted questions as non-matching instead of throwing", () => {
    const logic: TSurveyQuota["logic"] = {
      connector: "and",
      conditions: [
        {
          id: "c1",
          leftOperand: { type: "element", value: "gone" },
          operator: "equals",
          rightOperand: { type: "static", value: "x" },
        },
      ],
    };
    expect(doesResponseMatchQuota({ logic }, survey, { data: { gone: "y" } })).toBe(false);
  });
});

describe("needsCapacityCheck", () => {
  test("only matching responses without a link need a locked count", () => {
    expect(needsCapacityCheck(true, null)).toBe(true);
    expect(needsCapacityCheck(true, "screenedIn")).toBe(false);
    expect(needsCapacityCheck(true, "screenedOut")).toBe(false);
    expect(needsCapacityCheck(false, null)).toBe(false);
  });
});

describe("planQuotaEvaluation", () => {
  test("screens a finished matching response into a quota with free slots", () => {
    const quota = makeQuota();
    const plan = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: null, screenedInCount: 1 }],
      true
    );

    expect(plan.decisions).toEqual([{ quotaId: "q1", operation: "screenIn" }]);
    expect(plan.shouldEndSurvey).toBe(false);
    expect(plan.quotaFull).toBeNull();
  });

  test("does not count a partial response unless the quota counts partial submissions", () => {
    const strict = makeQuota({ id: "strict" });
    const partial = makeQuota({ id: "partial", countPartialSubmissions: true });
    const plan = planQuotaEvaluation(
      [
        { quota: strict, matches: true, existingStatus: null, screenedInCount: 0 },
        { quota: partial, matches: true, existingStatus: null, screenedInCount: 0 },
      ],
      false
    );

    expect(plan.decisions).toEqual([
      { quotaId: "strict", operation: "none" },
      { quotaId: "partial", operation: "screenIn" },
    ]);
  });

  test("screens out and ends the survey when an endSurvey quota is full", () => {
    const quota = makeQuota({ limit: 2 });
    const plan = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: null, screenedInCount: 2 }],
      false
    );

    expect(plan.decisions).toEqual([{ quotaId: "q1", operation: "screenOut" }]);
    expect(plan.shouldEndSurvey).toBe(true);
    expect(plan.quotaFull).toBe(quota);
  });

  test("screens out a partial response early, even if partial submissions are not counted", () => {
    const quota = makeQuota({ limit: 1, countPartialSubmissions: false });
    const plan = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: null, screenedInCount: 1 }],
      false
    );

    expect(plan.decisions[0].operation).toBe("screenOut");
    expect(plan.shouldEndSurvey).toBe(true);
  });

  test("reports a full continueSurvey quota without ending the survey", () => {
    const quota = makeQuota({ action: "continueSurvey", endingCardId: null, limit: 1 });
    const plan = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: null, screenedInCount: 1 }],
      true
    );

    expect(plan.decisions).toEqual([{ quotaId: "q1", operation: "screenOut" }]);
    expect(plan.shouldEndSurvey).toBe(false);
    expect(plan.quotaFull).toBe(quota);
  });

  test("prefers an endSurvey quota over an earlier continueSurvey quota as the reported full quota", () => {
    const soft = makeQuota({ id: "soft", action: "continueSurvey", endingCardId: null, limit: 1 });
    const hard = makeQuota({ id: "hard", limit: 1, endingCardId: "ending2" });
    const plan = planQuotaEvaluation(
      [
        { quota: soft, matches: true, existingStatus: null, screenedInCount: 1 },
        { quota: hard, matches: true, existingStatus: null, screenedInCount: 1 },
      ],
      true
    );

    expect(plan.quotaFull).toBe(hard);
    expect(plan.shouldEndSurvey).toBe(true);
  });

  test("does not let a response ended by one quota occupy slots of other quotas", () => {
    const full = makeQuota({ id: "full", limit: 1 });
    const open = makeQuota({ id: "open", limit: 10, countPartialSubmissions: true });
    const plan = planQuotaEvaluation(
      [
        { quota: full, matches: true, existingStatus: null, screenedInCount: 1 },
        { quota: open, matches: true, existingStatus: null, screenedInCount: 0 },
      ],
      false
    );

    expect(plan.decisions).toEqual([
      { quotaId: "full", operation: "screenOut" },
      { quotaId: "open", operation: "none" },
    ]);
  });

  test("is idempotent for responses that already have a link", () => {
    const quota = makeQuota({ limit: 1 });
    const screenedIn = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: "screenedIn", screenedInCount: 0 }],
      true
    );
    const screenedOut = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: "screenedOut", screenedInCount: 0 }],
      true
    );

    expect(screenedIn.decisions).toEqual([{ quotaId: "q1", operation: "none" }]);
    expect(screenedIn.shouldEndSurvey).toBe(false);
    expect(screenedOut.decisions).toEqual([{ quotaId: "q1", operation: "none" }]);
    expect(screenedOut.quotaFull).toBeNull();
  });

  test("removes the link when an edited response no longer matches", () => {
    const quota = makeQuota();
    const plan = planQuotaEvaluation(
      [
        { quota, matches: false, existingStatus: "screenedIn", screenedInCount: 0 },
        { quota: makeQuota({ id: "q2" }), matches: false, existingStatus: null, screenedInCount: 0 },
      ],
      true
    );

    expect(plan.decisions).toEqual([
      { quotaId: "q1", operation: "removeLink" },
      { quotaId: "q2", operation: "none" },
    ]);
  });

  test("treats a limit of zero as always full", () => {
    const quota = makeQuota({ limit: 0 });
    const plan = planQuotaEvaluation(
      [{ quota, matches: true, existingStatus: null, screenedInCount: 0 }],
      true
    );
    expect(plan.decisions[0].operation).toBe("screenOut");
  });
});
