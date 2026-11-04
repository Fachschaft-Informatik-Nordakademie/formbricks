import { describe, expect, test } from "vitest";
import { createQuotaFullObject } from "./helpers";

// FSINF CE: the client response APIs' quota wire format, as read by packages/surveys.

describe("createQuotaFullObject", () => {
  test("reports no full quota", () => {
    expect(createQuotaFullObject(undefined)).toEqual({ quotaFull: false });
    expect(createQuotaFullObject(null)).toEqual({ quotaFull: false });
  });

  test("includes the ending card for endSurvey quotas", () => {
    expect(createQuotaFullObject({ id: "q1", action: "endSurvey", endingCardId: "end1" })).toEqual({
      quotaFull: true,
      quota: { id: "q1", action: "endSurvey", endingCardId: "end1" },
    });
  });

  test("omits the ending card for continueSurvey quotas", () => {
    expect(createQuotaFullObject({ id: "q1", action: "continueSurvey", endingCardId: "stale" })).toEqual({
      quotaFull: true,
      quota: { id: "q1", action: "continueSurvey" },
    });
  });
});
