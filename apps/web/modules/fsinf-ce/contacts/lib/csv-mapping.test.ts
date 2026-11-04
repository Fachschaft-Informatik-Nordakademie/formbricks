import { describe, expect, test } from "vitest";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import {
  buildImportRows,
  buildInitialMapping,
  countRowsWithoutIdentity,
  findTypeMismatches,
  validateMapping,
} from "./csv-mapping";

const key = (k: string, dataType: "string" | "number" | "date" = "string", name: string | null = null) =>
  ({
    id: k,
    key: k,
    name,
    dataType,
    type: "custom",
    isUnique: false,
    workspaceId: "w",
  }) as TContactAttributeKey;

const existing = [
  key("email"),
  key("userId"),
  key("semester", "number"),
  key("enrolled_at", "date", "Enrolled"),
];

describe("csv mapping", () => {
  test("maps columns to existing keys (case-insensitive, by name) or safe identifiers", () => {
    expect(buildInitialMapping(["Email", "UserId", "Enrolled", "Group Name!"], existing)).toEqual({
      Email: "email",
      UserId: "userId",
      Enrolled: "enrolled_at",
      "Group Name!": "group_name",
    });
  });

  test("flags duplicates, reserved and invalid new keys, and a missing identity column", () => {
    expect(validateMapping({ a: "email", b: "email" }, existing)).toContainEqual({
      type: "duplicate",
      keys: ["email"],
    });
    expect(validateMapping({ a: "email", b: "user_id" }, existing)).toContainEqual({
      type: "reserved",
      keys: ["user_id"],
    });
    expect(validateMapping({ a: "email", b: "Bad-Key" }, existing)).toContainEqual({
      type: "invalid_name",
      keys: ["Bad-Key"],
    });
    expect(validateMapping({ a: "semester" }, existing)).toContainEqual({ type: "no_identity" });
    expect(validateMapping({ a: "email", b: "semester" }, existing)).toEqual([]);
  });

  test("builds import rows, dropping empty cells and unmapped columns", () => {
    expect(
      buildImportRows([{ A: " a@b.de ", B: "", C: "x" }], { A: "email", B: "firstName", C: "" })
    ).toEqual([{ email: "a@b.de" }]);
  });

  test("detects values that do not fit typed attributes", () => {
    expect(
      findTypeMismatches([{ semester: "three", enrolled_at: "2026-01-01" }, { semester: "4" }], existing)
    ).toEqual([{ key: "semester", dataType: "number", values: ["three"] }]);
  });

  test("counts rows without email and userId", () => {
    expect(countRowsWithoutIdentity([{ email: "a" }, { userId: "u" }, { firstName: "x" }])).toBe(1);
  });
});
