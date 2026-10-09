import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleFingerprintDecision } from "./route";
import { fingerprintCookieName, readFingerprintToken } from "./token";

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => ({
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  NEXTAUTH_SECRET: undefined,
  WEBAPP_URL: "https://forms.example.de",
}));

const getSurvey = vi.fn();
vi.mock("@/lib/survey/service", () => ({ getSurvey: (id: string) => getSurvey(id) }));

const SURVEY_ID = "clsurvey00000000000000001";
const enabledSurvey = {
  id: SURVEY_ID,
  type: "link",
  fsinfFingerprint: { enabled: true, purpose: "Abstimmung über die Satzungsänderung" },
};

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

const post = (body: unknown) =>
  new NextRequest("https://forms.example.de/api/fsinf/device-fingerprint", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const decisionOf = (response: Response) =>
  readFingerprintToken(
    (response as unknown as { cookies: { get: (n: string) => { value: string } | undefined } }).cookies.get(
      fingerprintCookieName(SURVEY_ID)
    )?.value,
    SURVEY_ID
  );

describe("handleFingerprintDecision", () => {
  beforeEach(() => {
    getSurvey.mockReset();
    getSurvey.mockResolvedValue(enabledSurvey);
  });

  test("consent: stores keyed ids and the device summary in the survey's cookie", async () => {
    const response = await handleFingerprintDecision(
      post({ surveyId: SURVEY_ID, consent: true, visitorId: "0123456789abcdef0123456789abcdef", traits })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const decision = decisionOf(response);
    expect(decision).toMatchObject({
      status: "recorded",
      info: "Win32 · 1920×1080 · 8 Kerne · Europe/Berlin · kein Touch",
    });
    expect(decision && "device" in decision && decision.device).toMatch(/^dev_/);
    expect(decision && "browser" in decision && decision.browser).toMatch(/^brw_/);
    // the raw visitorId is never stored
    expect(JSON.stringify(decision)).not.toContain("0123456789abcdef");
  });

  test("declined: records only the decision", async () => {
    const response = await handleFingerprintDecision(post({ surveyId: SURVEY_ID, consent: false }));
    expect(response.status).toBe(204);
    expect(decisionOf(response)).toEqual({ surveyId: SURVEY_ID, status: "declined" });
  });

  test("rejects surveys that do not use fingerprinting", async () => {
    getSurvey.mockResolvedValue({ ...enabledSurvey, fsinfFingerprint: { enabled: false, purpose: "" } });
    const response = await handleFingerprintDecision(post({ surveyId: SURVEY_ID, consent: false }));
    expect(response.status).toBe(404);
  });

  test("rejects unknown surveys", async () => {
    getSurvey.mockResolvedValue(null);
    const response = await handleFingerprintDecision(post({ surveyId: SURVEY_ID, consent: false }));
    expect(response.status).toBe(404);
  });

  test("rejects malformed payloads", async () => {
    expect((await handleFingerprintDecision(post("not json"))).status).toBe(400);
    expect((await handleFingerprintDecision(post({ surveyId: "../not an id", consent: false }))).status).toBe(
      400
    );
    expect(
      (
        await handleFingerprintDecision(
          post({ surveyId: SURVEY_ID, consent: true, visitorId: "nothex", traits })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleFingerprintDecision(
          post({
            surveyId: SURVEY_ID,
            consent: true,
            visitorId: "0123456789abcdef0123456789abcdef",
            traits: { ...traits, extra: 1 },
          })
        )
      ).status
    ).toBe(400);
  });

  test("rejects oversized bodies", async () => {
    const response = await handleFingerprintDecision(
      post({ surveyId: SURVEY_ID, consent: false, padding: "x".repeat(20_000) })
    );
    expect(response.status).toBe(413);
  });
});
