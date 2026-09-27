import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => ({ BETTER_AUTH_SECRET: "c".repeat(64), NEXTAUTH_SECRET: undefined }));

const { enforceRespondentSsoGate, enforceRespondentSsoUpdateGate } = await import("./gate");
const { createRespondentSessionToken, deriveRespondentSingleUseId } = await import("./session");

const SURVEY_ID = "clsurvey0000000000000000";

const identity = {
  sub: "hashed-sub-1",
  username: "max.muster",
  email: "max@nak-studis.de",
  name: "Max Muster",
  groups: ["Studierende"],
};

const ssoSurvey = (overrides: Record<string, unknown> = {}) => ({
  id: SURVEY_ID,
  singleUse: { enabled: false, isEncrypted: true },
  fsinfSso: {
    enabled: true,
    allowedGroups: ["Studierende"],
    allowedUsers: [],
    recordIdentity: false,
    oneResponsePerUser: true,
    ...overrides,
  },
});

const statusOf = async (response: Response | null) => (response ? response.status : null);

describe("enforceRespondentSsoGate (response create)", () => {
  let input: { data: Record<string, unknown>; singleUseId?: string | null };

  beforeEach(() => {
    input = { data: { q1: "answer" }, singleUseId: null };
  });

  test("leaves surveys without SSO alone, but still drops reserved identity keys", async () => {
    input.data.fsinfSsoName = "Forged Name";
    const result = enforceRespondentSsoGate({
      survey: {
        id: SURVEY_ID,
        singleUse: null,
        fsinfSso: {
          enabled: false,
          allowedGroups: [],
          allowedUsers: [],
          recordIdentity: false,
          oneResponsePerUser: true,
        },
      },
      responseInput: input,
      sessionToken: undefined,
    });

    expect(result).toBeNull();
    expect(input.data).toEqual({ q1: "answer" });
  });

  test("rejects a submission without a respondent session (direct POST to the public API)", async () => {
    const result = enforceRespondentSsoGate({
      survey: ssoSurvey(),
      responseInput: input,
      sessionToken: undefined,
    });
    expect(await statusOf(result)).toBe(403);
  });

  test("rejects a forged session cookie", async () => {
    const result = enforceRespondentSsoGate({
      survey: ssoSurvey(),
      responseInput: input,
      sessionToken: "eyJhbGciOiJIUzI1NiJ9.e30.x",
    });
    expect(await statusOf(result)).toBe(403);
  });

  test("rejects a logged-in account outside the allowlist", async () => {
    const token = createRespondentSessionToken({ ...identity, groups: ["Fachschaft BWL"] });
    const result = enforceRespondentSsoGate({
      survey: ssoSurvey(),
      responseInput: input,
      sessionToken: token,
    });
    expect(await statusOf(result)).toBe(403);
  });

  test("accepts an allowed account and pins singleUseId to the per-survey pseudonym", async () => {
    input.singleUseId = "client-chosen";
    const token = createRespondentSessionToken(identity);
    const result = enforceRespondentSsoGate({
      survey: ssoSurvey(),
      responseInput: input,
      sessionToken: token,
    });

    expect(result).toBeNull();
    expect(input.singleUseId).toBe(deriveRespondentSingleUseId(SURVEY_ID, identity.sub));
  });

  test("pseudonymous mode stores no identity, and forged identity keys from the client are dropped", async () => {
    input.data.fsinfSsoEmail = "someone@else.de";
    const token = createRespondentSessionToken(identity);
    enforceRespondentSsoGate({ survey: ssoSurvey(), responseInput: input, sessionToken: token });

    expect(input.data).toEqual({ q1: "answer" });
  });

  test("recordIdentity writes the attested identity, overriding anything the client sent", async () => {
    input.data.fsinfSsoEmail = "someone@else.de";
    const token = createRespondentSessionToken(identity);
    enforceRespondentSsoGate({
      survey: ssoSurvey({ recordIdentity: true }),
      responseInput: input,
      sessionToken: token,
    });

    expect(input.data).toEqual({
      q1: "answer",
      fsinfSsoName: "Max Muster",
      fsinfSsoUsername: "max.muster",
      fsinfSsoEmail: "max@nak-studis.de",
    });
  });

  test("without oneResponsePerUser the client's singleUseId is not replaced", async () => {
    input.singleUseId = null;
    const token = createRespondentSessionToken(identity);
    enforceRespondentSsoGate({
      survey: ssoSurvey({ oneResponsePerUser: false }),
      responseInput: input,
      sessionToken: token,
    });

    expect(input.singleUseId).toBeNull();
  });

  test("a survey that also uses single-use links keeps the link's id (already validated upstream)", async () => {
    input.singleUseId = "validated-link-id";
    const token = createRespondentSessionToken(identity);
    enforceRespondentSsoGate({
      survey: { ...ssoSurvey(), singleUse: { enabled: true, isEncrypted: true } },
      responseInput: input,
      sessionToken: token,
    });

    expect(input.singleUseId).toBe("validated-link-id");
  });
});

describe("enforceRespondentSsoUpdateGate (response update)", () => {
  test("rejects an update without a session", async () => {
    const result = enforceRespondentSsoUpdateGate({
      survey: ssoSurvey(),
      existingResponse: { singleUseId: deriveRespondentSingleUseId(SURVEY_ID, identity.sub) },
      updateData: { q1: "x" },
      sessionToken: undefined,
    });
    expect(await statusOf(result)).toBe(403);
  });

  test("rejects updating another account's response", async () => {
    const token = createRespondentSessionToken(identity);
    const result = enforceRespondentSsoUpdateGate({
      survey: ssoSurvey(),
      existingResponse: { singleUseId: deriveRespondentSingleUseId(SURVEY_ID, "someone-else") },
      updateData: { q1: "x" },
      sessionToken: token,
    });
    expect(await statusOf(result)).toBe(403);
  });

  test("lets the owner update, and strips reserved keys from the update", async () => {
    const token = createRespondentSessionToken(identity);
    const updateData: Record<string, unknown> = { q2: "y", fsinfSsoName: "Forged" };
    const result = enforceRespondentSsoUpdateGate({
      survey: ssoSurvey({ recordIdentity: true }),
      existingResponse: { singleUseId: deriveRespondentSingleUseId(SURVEY_ID, identity.sub) },
      updateData,
      sessionToken: token,
    });

    expect(result).toBeNull();
    expect(updateData).toEqual({ q2: "y" });
  });
});
