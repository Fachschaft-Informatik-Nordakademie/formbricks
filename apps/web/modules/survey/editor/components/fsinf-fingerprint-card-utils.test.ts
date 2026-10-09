import { describe, expect, test } from "vitest";
import { FSINF_FINGERPRINT_DEFAULT_BANNER } from "@formbricks/types/surveys/types";
import { setFingerprintEnabled, withFingerprintDefaults } from "./fsinf-fingerprint-card-utils";

describe("withFingerprintDefaults", () => {
  test("fills a missing config", () => {
    expect(withFingerprintDefaults(null)).toEqual({ enabled: false, purpose: "", bannerText: "" });
  });

  test("lets the banner text be cleared while editing", () => {
    expect(withFingerprintDefaults({ enabled: true, purpose: "", bannerText: "" }).bannerText).toBe("");
  });
});

describe("setFingerprintEnabled", () => {
  test("enabling pre-fills the default banner text", () => {
    expect(setFingerprintEnabled({ enabled: false, purpose: "", bannerText: "" }, true)).toEqual({
      enabled: true,
      purpose: "",
      bannerText: FSINF_FINGERPRINT_DEFAULT_BANNER,
    });
  });

  test("keeps a custom banner text", () => {
    expect(
      setFingerprintEnabled({ enabled: false, purpose: "", bannerText: "Eigener Text" }, true).bannerText
    ).toBe("Eigener Text");
  });

  test("disabling keeps the text for later", () => {
    expect(
      setFingerprintEnabled({ enabled: true, purpose: "", bannerText: "Eigener Text" }, false).bannerText
    ).toBe("Eigener Text");
  });
});
