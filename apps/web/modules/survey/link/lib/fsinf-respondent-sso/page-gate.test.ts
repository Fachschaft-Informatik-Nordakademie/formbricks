import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => ({
  BETTER_AUTH_SECRET: "d".repeat(64),
  WEBAPP_URL: "https://forms.nak-inf.de",
  FSINF_RESPONDENT_OIDC_CLIENT_ID: "client",
  FSINF_RESPONDENT_OIDC_CLIENT_SECRET: "secret",
  FSINF_RESPONDENT_OIDC_ISSUER: "https://portal.nak-studis.de/application/o/x/",
}));

const { decidePageAccess, buildLoginLinks } = await import("./page-gate");
const { deriveRespondentSingleUseId } = await import("./session");

const SURVEY_ID = "clsurvey0000000000000000";
const identity = {
  sub: "s1",
  username: "max",
  email: "max@nak-studis.de",
  name: "Max",
  groups: ["Studierende"],
};
const survey = (fsinfSso: Record<string, unknown>, singleUseEnabled = false) => ({
  id: SURVEY_ID,
  singleUse: { enabled: singleUseEnabled, isEncrypted: true },
  fsinfSso: {
    enabled: true,
    allowedGroups: [],
    allowedUsers: [],
    recordIdentity: false,
    oneResponsePerUser: true,
    ...fsinfSso,
  },
});

describe("decidePageAccess", () => {
  test("asks for a login when nobody is signed in", () => {
    expect(decidePageAccess({ survey: survey({}), identity: null, configured: true })).toEqual({
      kind: "login",
    });
  });

  test("tells the operator side when the login is not configured on this server", () => {
    expect(decidePageAccess({ survey: survey({}), identity, configured: false })).toEqual({
      kind: "unconfigured",
    });
  });

  test("denies an account outside the allowlist, naming it", () => {
    expect(
      decidePageAccess({ survey: survey({ allowedGroups: ["Fachschaft BWL"] }), identity, configured: true })
    ).toEqual({ kind: "denied", signedInAs: "Max (max)" });
  });

  test("lets an allowed account through with its per-survey pseudonym", () => {
    expect(decidePageAccess({ survey: survey({}), identity, configured: true })).toEqual({
      kind: "allowed",
      singleUseId: deriveRespondentSingleUseId(SURVEY_ID, "s1"),
    });
  });

  test("uses no pseudonym when several responses per account are allowed or single-use links are on", () => {
    expect(
      decidePageAccess({ survey: survey({ oneResponsePerUser: false }), identity, configured: true })
    ).toEqual({
      kind: "allowed",
    });
    expect(decidePageAccess({ survey: survey({}, true), identity, configured: true })).toEqual({
      kind: "allowed",
    });
  });
});

describe("buildLoginLinks", () => {
  test("carries the survey link's query through login and account switch", () => {
    const links = buildLoginLinks(SURVEY_ID, { lang: "de", fsinfSsoError: "denied", suId: undefined });
    expect(links.loginUrl).toBe(`/api/fsinf/respondent-sso/login?surveyId=${SURVEY_ID}&query=lang%3Dde`);
    expect(links.switchAccountUrl).toBe(
      `/api/fsinf/respondent-sso/logout?surveyId=${SURVEY_ID}&query=lang%3Dde&switch=1`
    );
  });
});
