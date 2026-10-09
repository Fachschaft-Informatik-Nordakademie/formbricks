import { describe, expect, test, vi } from "vitest";
import { applyDeviceFingerprint, dropFingerprintKeys } from "./gate";
import { createFingerprintToken } from "./token";
import { FSINF_FP_RESPONSE_KEYS } from "./traits";

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => ({
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  NEXTAUTH_SECRET: undefined,
}));

const enabledSurvey = {
  id: "survey1",
  fsinfFingerprint: { enabled: true, purpose: "Wahl des Vorstands 2026" },
};
const forged = {
  [FSINF_FP_RESPONSE_KEYS.status]: "recorded",
  [FSINF_FP_RESPONSE_KEYS.device]: "forged",
  [FSINF_FP_RESPONSE_KEYS.browser]: "forged",
  [FSINF_FP_RESPONSE_KEYS.info]: "forged",
};

describe("applyDeviceFingerprint", () => {
  test("drops client-supplied fingerprint keys on surveys without fingerprinting", () => {
    const data: Record<string, unknown> = { q1: "a", ...forged };
    applyDeviceFingerprint({ survey: { id: "survey1", fsinfFingerprint: null }, data, token: undefined });
    expect(data).toEqual({ q1: "a" });
  });

  test("records the fingerprint from the signed cookie, never from the client data", () => {
    const data: Record<string, unknown> = { q1: "a", ...forged };
    const token = createFingerprintToken({
      surveyId: "survey1",
      status: "recorded",
      device: "dev",
      browser: "brw",
      info: "Win32",
    });
    applyDeviceFingerprint({ survey: enabledSurvey, data, token });
    expect(data).toEqual({
      q1: "a",
      [FSINF_FP_RESPONSE_KEYS.status]: "recorded",
      [FSINF_FP_RESPONSE_KEYS.device]: "dev",
      [FSINF_FP_RESPONSE_KEYS.browser]: "brw",
      [FSINF_FP_RESPONSE_KEYS.info]: "Win32",
    });
  });

  test("records a declined consent without any fingerprint", () => {
    const data: Record<string, unknown> = { q1: "a" };
    const token = createFingerprintToken({ surveyId: "survey1", status: "declined" });
    applyDeviceFingerprint({ survey: enabledSurvey, data, token });
    expect(data).toEqual({ q1: "a", [FSINF_FP_RESPONSE_KEYS.status]: "declined" });
  });

  test("marks the response as missing when there is no (valid) cookie — never blocks", () => {
    const data: Record<string, unknown> = { q1: "a", ...forged };
    const otherSurveyToken = createFingerprintToken({ surveyId: "other", status: "declined" });
    applyDeviceFingerprint({ survey: enabledSurvey, data, token: otherSurveyToken });
    expect(data).toEqual({ q1: "a", [FSINF_FP_RESPONSE_KEYS.status]: "missing" });
  });
});

describe("dropFingerprintKeys", () => {
  test("strips the reserved keys from an update", () => {
    const data: Record<string, unknown> = { q2: "b", ...forged };
    dropFingerprintKeys(data);
    expect(data).toEqual({ q2: "b" });
  });

  test("accepts missing data", () => {
    expect(() => dropFingerprintKeys(undefined)).not.toThrow();
  });
});
