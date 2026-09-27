import { beforeEach, describe, expect, test, vi } from "vitest";

const constantsMock = {
  BETTER_AUTH_SECRET: "a".repeat(64) as string | undefined,
  NEXTAUTH_SECRET: undefined as string | undefined,
};

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/constants", () => constantsMock);

const load = async () => {
  vi.resetModules();
  return await import("./session");
};

const identity = {
  sub: "hashed-sub",
  username: "max.muster",
  email: "max@nak-studis.de",
  name: "Max Muster",
  groups: ["Studierende"],
};

describe("respondent session token", () => {
  beforeEach(() => {
    constantsMock.BETTER_AUTH_SECRET = "a".repeat(64);
    constantsMock.NEXTAUTH_SECRET = undefined;
  });

  test("round-trips the identity", async () => {
    const { createRespondentSessionToken, readRespondentSessionToken } = await load();
    const token = createRespondentSessionToken(identity);

    expect(readRespondentSessionToken(token)).toEqual(identity);
  });

  test("rejects a missing, garbage or foreign-secret token", async () => {
    const { createRespondentSessionToken, readRespondentSessionToken } = await load();
    const token = createRespondentSessionToken(identity);

    expect(readRespondentSessionToken(undefined)).toBeNull();
    expect(readRespondentSessionToken("not-a-jwt")).toBeNull();

    constantsMock.BETTER_AUTH_SECRET = "b".repeat(64);
    const reloaded = await load();
    expect(reloaded.readRespondentSessionToken(token)).toBeNull();
  });

  test("a login-state token is not accepted as a session and vice versa", async () => {
    const {
      createLoginStateToken,
      readLoginStateToken,
      createRespondentSessionToken,
      readRespondentSessionToken,
    } = await load();
    const state = createLoginStateToken({
      state: "s",
      nonce: "n",
      codeVerifier: "v",
      surveyId: "clsurvey0000000000000000",
      query: "",
    });

    expect(readRespondentSessionToken(state)).toBeNull();
    expect(readLoginStateToken(createRespondentSessionToken(identity))).toBeNull();
    expect(readLoginStateToken(state)).toMatchObject({ state: "s", nonce: "n", codeVerifier: "v" });
  });

  test("an expired session is rejected", async () => {
    vi.useFakeTimers();
    try {
      const { createRespondentSessionToken, readRespondentSessionToken, RESPONDENT_SESSION_TTL_SECONDS } =
        await load();
      const token = createRespondentSessionToken(identity);
      vi.advanceTimersByTime((RESPONDENT_SESSION_TTL_SECONDS + 5) * 1000);
      expect(readRespondentSessionToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("deriveRespondentSingleUseId", () => {
  test("is stable per survey and account", async () => {
    const { deriveRespondentSingleUseId } = await load();
    expect(deriveRespondentSingleUseId("survey-a", "sub-1")).toBe(
      deriveRespondentSingleUseId("survey-a", "sub-1")
    );
  });

  test("differs between surveys and between accounts, so it cannot link answers across surveys", async () => {
    const { deriveRespondentSingleUseId } = await load();
    const base = deriveRespondentSingleUseId("survey-a", "sub-1");
    expect(deriveRespondentSingleUseId("survey-b", "sub-1")).not.toBe(base);
    expect(deriveRespondentSingleUseId("survey-a", "sub-2")).not.toBe(base);
  });

  test("does not contain the account id in readable form", async () => {
    const { deriveRespondentSingleUseId } = await load();
    expect(deriveRespondentSingleUseId("survey-a", "max.muster")).not.toContain("max");
  });
});
