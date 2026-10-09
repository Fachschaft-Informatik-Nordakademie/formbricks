import { describe, expect, test } from "vitest";
import { FSINF_FINGERPRINT_DEFAULT_PURPOSE } from "@formbricks/types/surveys/types";
import { setFingerprintEnabled, withFingerprintDefaults } from "./fsinf-fingerprint-card-utils";

describe("withFingerprintDefaults", () => {
  test("fills a missing config", () => {
    expect(withFingerprintDefaults(null)).toEqual({ enabled: false, purpose: "" });
  });

  test("lets the purpose be cleared while editing", () => {
    expect(withFingerprintDefaults({ enabled: true, purpose: "" })).toEqual({ enabled: true, purpose: "" });
  });
});

describe("setFingerprintEnabled", () => {
  test("enabling pre-fills the default text into an empty purpose", () => {
    expect(setFingerprintEnabled({ enabled: false, purpose: "" }, true)).toEqual({
      enabled: true,
      purpose: FSINF_FINGERPRINT_DEFAULT_PURPOSE,
    });
  });

  test("keeps a custom purpose", () => {
    expect(setFingerprintEnabled({ enabled: false, purpose: "Wahl 2026" }, true).purpose).toBe("Wahl 2026");
  });

  test("disabling keeps the text for later", () => {
    expect(setFingerprintEnabled({ enabled: true, purpose: "Wahl 2026" }, false)).toEqual({
      enabled: false,
      purpose: "Wahl 2026",
    });
  });
});
