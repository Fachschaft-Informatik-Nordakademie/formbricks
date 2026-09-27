import { describe, expect, test } from "vitest";
import { formatHandleList, parseHandleList, withFsinfSsoDefaults } from "./fsinf-sso-card-utils";

describe("parseHandleList", () => {
  test("splits on newlines, commas and semicolons, trims and de-duplicates case-insensitively", () => {
    expect(parseHandleList("max.muster\n  erika@nak-studis.de , MAX.MUSTER;\n\n jan ")).toEqual([
      "max.muster",
      "erika@nak-studis.de",
      "jan",
    ]);
  });

  test("returns an empty list for blank input", () => {
    expect(parseHandleList("  \n , ")).toEqual([]);
  });
});

describe("formatHandleList", () => {
  test("puts one entry per line", () => {
    expect(formatHandleList(["a", "b"])).toBe("a\nb");
  });
});

describe("withFsinfSsoDefaults", () => {
  test("fills a missing config with the safe defaults", () => {
    expect(withFsinfSsoDefaults(null)).toEqual({
      enabled: false,
      allowedGroups: [],
      allowedUsers: [],
      recordIdentity: false,
      oneResponsePerUser: true,
    });
  });

  test("keeps what is set", () => {
    expect(withFsinfSsoDefaults({ enabled: true, allowedGroups: ["X"] } as never)).toMatchObject({
      enabled: true,
      allowedGroups: ["X"],
      oneResponsePerUser: true,
    });
  });
});
