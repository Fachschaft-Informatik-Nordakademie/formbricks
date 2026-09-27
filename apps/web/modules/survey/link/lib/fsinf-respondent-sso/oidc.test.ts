import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => ({
  WEBAPP_URL: "https://forms.nak-inf.de",
  FSINF_RESPONDENT_OIDC_CLIENT_ID: "client",
  FSINF_RESPONDENT_OIDC_CLIENT_SECRET: "secret",
  FSINF_RESPONDENT_OIDC_ISSUER: "https://portal.nak-studis.de/application/o/nak-inf-forms-respondents/",
}));

const { identityFromClaims, sanitizeReturnQuery, buildSurveyReturnUrl, discoveryUrlFor } =
  await import("./oidc");

describe("identityFromClaims", () => {
  test("maps Authentik's ID-token claims", () => {
    expect(
      identityFromClaims({
        sub: "abc",
        preferred_username: "max.muster",
        email: "max@nak-studis.de",
        name: "Max Muster",
        groups: ["Studierende", 42, "Fachschaft Informatik"],
      })
    ).toEqual({
      sub: "abc",
      username: "max.muster",
      email: "max@nak-studis.de",
      name: "Max Muster",
      groups: ["Studierende", "Fachschaft Informatik"],
    });
  });

  test("falls back to the username as display name and to no groups", () => {
    expect(identityFromClaims({ sub: "abc", preferred_username: "max" })).toMatchObject({
      name: "max",
      groups: [],
      email: "",
    });
  });

  test("refuses claims without a subject", () => {
    expect(identityFromClaims({ preferred_username: "max" })).toBeNull();
  });
});

describe("sanitizeReturnQuery", () => {
  test("keeps the survey link's own parameters", () => {
    expect(sanitizeReturnQuery("lang=de&source=mail")).toBe("lang=de&source=mail");
  });

  test("drops the SSO flow's own parameters", () => {
    expect(sanitizeReturnQuery("lang=de&fsinfSsoError=denied")).toBe("lang=de");
  });

  test("tolerates a leading question mark and empty input", () => {
    expect(sanitizeReturnQuery("?lang=de")).toBe("lang=de");
    expect(sanitizeReturnQuery(null)).toBe("");
  });

  test("caps absurdly long query strings", () => {
    expect(sanitizeReturnQuery(`x=${"a".repeat(5000)}`)).toBe("");
  });
});

describe("buildSurveyReturnUrl", () => {
  test("always points at the canonical origin's survey page", () => {
    expect(buildSurveyReturnUrl("clsurvey0000000000000000", "lang=de")).toBe(
      "https://forms.nak-inf.de/s/clsurvey0000000000000000?lang=de"
    );
  });

  test("appends an error marker when asked", () => {
    expect(buildSurveyReturnUrl("clsurvey0000000000000000", "", "denied")).toBe(
      "https://forms.nak-inf.de/s/clsurvey0000000000000000?fsinfSsoError=denied"
    );
  });

  test("never lets the survey id smuggle in another path or host", () => {
    expect(() => buildSurveyReturnUrl("../../evil", "")).toThrow();
    expect(() => buildSurveyReturnUrl("//evil.example", "")).toThrow();
  });
});

describe("discoveryUrlFor", () => {
  test("handles issuers with and without trailing slash", () => {
    expect(discoveryUrlFor("https://a/application/o/x/")).toBe(
      "https://a/application/o/x/.well-known/openid-configuration"
    );
    expect(discoveryUrlFor("https://a/application/o/x")).toBe(
      "https://a/application/o/x/.well-known/openid-configuration"
    );
  });
});
