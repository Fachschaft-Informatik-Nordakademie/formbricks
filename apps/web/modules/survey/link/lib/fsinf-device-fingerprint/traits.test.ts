import { describe, expect, test } from "vitest";
import {
  FSINF_FP_RESPONSE_KEYS,
  ZDeviceTraits,
  canonicalDeviceTraits,
  countSameDevice,
  extractDeviceTraits,
  formatDeviceTraits,
  getRecordedFingerprint,
} from "./traits";

// Shape of FingerprintJS' `GetResult.components` (each source: { value, duration } or { error }).
const components = {
  platform: { value: "MacIntel", duration: 0 },
  screenResolution: { value: [1440, 2560], duration: 0 },
  colorDepth: { value: 30, duration: 0 },
  colorGamut: { value: "p3", duration: 0 },
  hdr: { value: false, duration: 0 },
  hardwareConcurrency: { value: 8, duration: 0 },
  timezone: { value: "Europe/Berlin", duration: 0 },
  touchSupport: { value: { maxTouchPoints: 0, touchEvent: false, touchStart: false }, duration: 0 },
  contrast: { value: 0, duration: 0 },
  reducedMotion: { value: false, duration: 0 },
  invertedColors: { error: new Error("unsupported"), duration: 0 },
  forcedColors: { value: false, duration: 0 },
  monochrome: { value: 0, duration: 0 },
  // browser-specific sources must not influence the device traits
  canvas: { value: { geometry: "abc", text: "def", winding: true }, duration: 0 },
  userAgentData: { value: { brands: ["Chromium"] }, duration: 0 },
  languages: { value: [["de-DE"]], duration: 0 },
};

describe("extractDeviceTraits", () => {
  test("keeps only hardware / OS level components, orientation-independent screen size", () => {
    expect(extractDeviceTraits(components)).toEqual({
      platform: "MacIntel",
      screen: "2560x1440",
      colorDepth: 30,
      colorGamut: "p3",
      hdr: false,
      cores: 8,
      timezone: "Europe/Berlin",
      maxTouchPoints: 0,
      contrast: 0,
      reducedMotion: false,
      invertedColors: null,
      forcedColors: false,
      monochrome: 0,
    });
  });

  test("tolerates missing and malformed components", () => {
    const traits = extractDeviceTraits({ screenResolution: { value: [null, 800] }, platform: { value: 42 } });
    expect(traits.screen).toBe("");
    expect(traits.platform).toBe("");
    expect(traits.cores).toBeNull();
    expect(ZDeviceTraits.safeParse(traits).success).toBe(true);
  });
});

describe("canonicalDeviceTraits", () => {
  test("does not depend on the key order the client sent", () => {
    const traits = extractDeviceTraits(components);
    const reversed = Object.fromEntries(Object.entries(traits).reverse()) as typeof traits;
    expect(canonicalDeviceTraits(reversed)).toBe(canonicalDeviceTraits(traits));
  });
});

describe("formatDeviceTraits", () => {
  test("is a short human readable summary", () => {
    expect(formatDeviceTraits(extractDeviceTraits(components))).toBe(
      "MacIntel · 2560×1440 · 8 Kerne · Europe/Berlin · kein Touch"
    );
  });
});

describe("getRecordedFingerprint", () => {
  test("reads a recorded fingerprint from the response data", () => {
    expect(
      getRecordedFingerprint({
        q1: "x",
        [FSINF_FP_RESPONSE_KEYS.status]: "recorded",
        [FSINF_FP_RESPONSE_KEYS.device]: "dev123",
        [FSINF_FP_RESPONSE_KEYS.browser]: "brw456",
        [FSINF_FP_RESPONSE_KEYS.info]: "Win32",
      })
    ).toEqual({ status: "recorded", device: "dev123", browser: "brw456", info: "Win32" });
  });

  test("is null for responses of surveys without fingerprinting", () => {
    expect(getRecordedFingerprint({ q1: "x" })).toBeNull();
  });

  test("ignores unknown status values", () => {
    expect(getRecordedFingerprint({ [FSINF_FP_RESPONSE_KEYS.status]: "bogus" })).toBeNull();
  });
});

describe("countSameDevice", () => {
  test("counts responses sharing a device id, ignoring responses without one", () => {
    const data = [
      { [FSINF_FP_RESPONSE_KEYS.device]: "a" },
      { [FSINF_FP_RESPONSE_KEYS.device]: "a" },
      { [FSINF_FP_RESPONSE_KEYS.device]: "b" },
      {},
    ];
    const counts = countSameDevice(data);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });
});
