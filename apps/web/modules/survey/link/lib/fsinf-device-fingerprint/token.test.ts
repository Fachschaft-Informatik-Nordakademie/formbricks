import { describe, expect, test, vi } from "vitest";
import {
  createFingerprintToken,
  deriveBrowserId,
  deriveDeviceId,
  fingerprintCookieName,
  readFingerprintToken,
} from "./token";

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => ({
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  NEXTAUTH_SECRET: undefined,
}));

const traits = {
  platform: "Win32",
  screen: "1920x1080",
  colorDepth: 24,
  colorGamut: "srgb",
  hdr: false,
  cores: 8,
  timezone: "Europe/Berlin",
  maxTouchPoints: 0,
  contrast: 0,
  reducedMotion: false,
  invertedColors: null,
  forcedColors: false,
  monochrome: 0,
};

describe("fingerprint ids", () => {
  test("are stable for the same survey and input", () => {
    expect(deriveDeviceId("survey1", traits)).toBe(deriveDeviceId("survey1", traits));
    expect(deriveBrowserId("survey1", "0123456789abcdef0123456789abcdef")).toBe(
      deriveBrowserId("survey1", "0123456789abcdef0123456789abcdef")
    );
  });

  test("differ between surveys, so audits cannot be joined across surveys", () => {
    expect(deriveDeviceId("survey1", traits)).not.toBe(deriveDeviceId("survey2", traits));
  });

  test("differ between devices", () => {
    expect(deriveDeviceId("survey1", traits)).not.toBe(deriveDeviceId("survey1", { ...traits, cores: 4 }));
  });
});

describe("fingerprint cookie token", () => {
  test("round-trips a recorded fingerprint for its survey", () => {
    const token = createFingerprintToken({
      surveyId: "survey1",
      status: "recorded",
      device: "d",
      browser: "b",
      info: "Win32",
    });
    expect(readFingerprintToken(token, "survey1")).toEqual({
      surveyId: "survey1",
      status: "recorded",
      device: "d",
      browser: "b",
      info: "Win32",
    });
  });

  test("round-trips a declined consent", () => {
    const token = createFingerprintToken({ surveyId: "survey1", status: "declined" });
    expect(readFingerprintToken(token, "survey1")).toEqual({ surveyId: "survey1", status: "declined" });
  });

  test("is not valid for another survey", () => {
    const token = createFingerprintToken({ surveyId: "survey1", status: "declined" });
    expect(readFingerprintToken(token, "survey2")).toBeNull();
  });

  test("rejects garbage and tampered tokens", () => {
    const token = createFingerprintToken({ surveyId: "survey1", status: "declined" });
    expect(readFingerprintToken("garbage", "survey1")).toBeNull();
    expect(readFingerprintToken(token.slice(0, -2) + "xx", "survey1")).toBeNull();
    expect(readFingerprintToken(undefined, "survey1")).toBeNull();
  });

  test("uses one cookie per survey", () => {
    expect(fingerprintCookieName("abc")).not.toBe(fingerprintCookieName("def"));
  });
});
