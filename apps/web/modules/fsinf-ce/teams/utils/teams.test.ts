import { describe, expect, test } from "vitest";
import { getTeamPermissionFlags } from "./teams";

describe("getTeamPermissionFlags", () => {
  test("read", () => {
    expect(getTeamPermissionFlags("read")).toEqual({
      hasReadAccess: true,
      hasReadWriteAccess: false,
      hasManageAccess: false,
    });
  });

  test("readWrite is not also read (call sites derive read-only from hasReadAccess)", () => {
    expect(getTeamPermissionFlags("readWrite")).toEqual({
      hasReadAccess: false,
      hasReadWriteAccess: true,
      hasManageAccess: false,
    });
  });

  test("manage", () => {
    expect(getTeamPermissionFlags("manage")).toEqual({
      hasReadAccess: false,
      hasReadWriteAccess: false,
      hasManageAccess: true,
    });
  });

  test.each([null, undefined])("%s sets no flag", (permission) => {
    expect(getTeamPermissionFlags(permission)).toEqual({
      hasReadAccess: false,
      hasReadWriteAccess: false,
      hasManageAccess: false,
    });
  });
});
