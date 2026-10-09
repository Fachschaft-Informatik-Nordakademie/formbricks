import { describe, expect, test } from "vitest";
import { FSINF_FINGERPRINT_DEFAULT_PURPOSE, ZSurveyFsinfFingerprint } from "@formbricks/types/surveys/types";
import { fingerprintPurposeFor } from "./traits";

describe("fingerprint purpose", () => {
  test("is optional — enabling without a justification is valid", () => {
    expect(ZSurveyFsinfFingerprint.safeParse({ enabled: true }).success).toBe(true);
    expect(ZSurveyFsinfFingerprint.safeParse({ enabled: true, purpose: "" }).success).toBe(true);
  });

  test("falls back to the generic default text", () => {
    expect(fingerprintPurposeFor({ enabled: true, purpose: "  " })).toBe(FSINF_FINGERPRINT_DEFAULT_PURPOSE);
    expect(fingerprintPurposeFor({ enabled: true, purpose: "Satzungsänderung" })).toBe("Satzungsänderung");
  });
});
