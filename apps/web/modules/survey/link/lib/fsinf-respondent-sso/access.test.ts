import { describe, expect, test } from "vitest";
import { type TRespondentIdentity, isRespondentAllowed } from "./access";

const identity: TRespondentIdentity = {
  sub: "hashed-sub",
  username: "max.muster",
  email: "Max.Muster@nak-studis.de",
  name: "Max Muster",
  groups: ["Studierende", "Fachschaft Informatik"],
};

const config = (overrides: { allowedGroups?: string[]; allowedUsers?: string[] } = {}) => ({
  enabled: true,
  allowedGroups: [],
  allowedUsers: [],
  recordIdentity: false,
  oneResponsePerUser: true,
  ...overrides,
});

describe("isRespondentAllowed", () => {
  test("any Authentik account may answer when neither groups nor users are configured", () => {
    expect(isRespondentAllowed(config(), identity)).toBe(true);
  });

  test("a member of one of the allowed groups may answer", () => {
    expect(isRespondentAllowed(config({ allowedGroups: ["Fachschaft BWL", "Studierende"] }), identity)).toBe(
      true
    );
  });

  test("group names match case-insensitively and ignore surrounding whitespace", () => {
    expect(isRespondentAllowed(config({ allowedGroups: ["  fachschaft informatik "] }), identity)).toBe(true);
  });

  test("a group name must match exactly, not as a prefix", () => {
    expect(isRespondentAllowed(config({ allowedGroups: ["Fachschaft Informatik Vorstand"] }), identity)).toBe(
      false
    );
    expect(isRespondentAllowed(config({ allowedGroups: ["Fachschaft"] }), identity)).toBe(false);
  });

  test("a listed user may answer by username or by email, case-insensitively", () => {
    expect(isRespondentAllowed(config({ allowedUsers: ["MAX.MUSTER"] }), identity)).toBe(true);
    expect(isRespondentAllowed(config({ allowedUsers: ["max.muster@nak-studis.de"] }), identity)).toBe(true);
  });

  test("groups and users combine as OR — either one is enough", () => {
    const narrowed = config({ allowedGroups: ["Fachschaft BWL"], allowedUsers: ["max.muster"] });
    expect(isRespondentAllowed(narrowed, identity)).toBe(true);
    expect(isRespondentAllowed(narrowed, { ...identity, username: "someone.else", email: "x@y.de" })).toBe(
      false
    );
  });

  test("someone outside every configured group and user list is rejected", () => {
    expect(
      isRespondentAllowed(config({ allowedGroups: ["Fachschaft BWL"], allowedUsers: ["erika"] }), identity)
    ).toBe(false);
  });

  test("an empty email or username never matches an empty-looking list entry", () => {
    const anonymousish = { ...identity, email: "", username: "" };
    expect(isRespondentAllowed(config({ allowedUsers: ["   ", "erika"] }), anonymousish)).toBe(false);
  });

  test("blank list entries alone do not turn an allowlist into 'everyone'", () => {
    // ["  "] is what a stray empty line in the editor produces — it must not silently open the survey
    // to every account, but it must also not lock everybody out: it is treated as not configured.
    expect(isRespondentAllowed(config({ allowedGroups: ["  "] }), identity)).toBe(true);
  });
});

describe("formatRecordedFsinfSsoIdentity", () => {
  test("formats a recorded identity", async () => {
    const { formatRecordedFsinfSsoIdentity } = await import("./access");
    expect(
      formatRecordedFsinfSsoIdentity({
        fsinfSsoName: "Max Muster",
        fsinfSsoUsername: "max",
        fsinfSsoEmail: "m@x.de",
      })
    ).toBe("Max Muster (max) · m@x.de");
  });

  test("is empty for pseudonymous responses", async () => {
    const { formatRecordedFsinfSsoIdentity, getRecordedFsinfSsoIdentity } = await import("./access");
    expect(formatRecordedFsinfSsoIdentity({ q1: "a" })).toBe("");
    expect(getRecordedFsinfSsoIdentity({ q1: "a" })).toBeNull();
  });
});
