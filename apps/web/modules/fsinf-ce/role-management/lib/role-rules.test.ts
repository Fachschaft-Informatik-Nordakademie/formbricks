import { describe, expect, test } from "vitest";
import { canEditRoleOf, getAssignableOrganizationRoles, validateRoleChange } from "./role-rules";

const base = { isSelf: false, ownerCount: 2, isFormbricksCloud: false };

describe("getAssignableOrganizationRoles", () => {
  test("owners assign everything, billing only on cloud", () => {
    expect(getAssignableOrganizationRoles("owner", false)).toEqual(["owner", "manager", "member"]);
    expect(getAssignableOrganizationRoles("owner", true)).toEqual(["owner", "manager", "member", "billing"]);
  });

  test("managers assign only member", () => {
    expect(getAssignableOrganizationRoles("manager", true)).toEqual(["member"]);
  });

  test.each(["member", "billing", undefined] as const)("%s assigns nothing", (role) => {
    expect(getAssignableOrganizationRoles(role, true)).toEqual([]);
  });
});

describe("validateRoleChange", () => {
  test("owner promotes a member to manager", () => {
    expect(
      validateRoleChange({ ...base, actorRole: "owner", targetRole: "member", newRole: "manager" })
    ).toBeNull();
  });

  test("members and billing users cannot change roles", () => {
    for (const actorRole of ["member", "billing"] as const) {
      expect(validateRoleChange({ ...base, actorRole, targetRole: "member", newRole: "manager" })).toBe(
        "not_authorized"
      );
    }
  });

  test("nobody changes their own role", () => {
    expect(
      validateRoleChange({
        ...base,
        actorRole: "owner",
        isSelf: true,
        targetRole: "owner",
        newRole: "member",
      })
    ).toBe("cannot_change_own_role");
  });

  test("a manager cannot touch an owner", () => {
    expect(
      validateRoleChange({ ...base, actorRole: "manager", targetRole: "owner", newRole: "member" })
    ).toBe("cannot_change_owner");
  });

  test("a manager cannot promote", () => {
    expect(
      validateRoleChange({ ...base, actorRole: "manager", targetRole: "member", newRole: "manager" })
    ).toBe("role_not_assignable");
    expect(
      validateRoleChange({ ...base, actorRole: "manager", targetRole: "member", newRole: "owner" })
    ).toBe("role_not_assignable");
  });

  test("a manager can demote another manager to member", () => {
    expect(
      validateRoleChange({ ...base, actorRole: "manager", targetRole: "manager", newRole: "member" })
    ).toBeNull();
  });

  test("billing is not assignable outside cloud", () => {
    expect(
      validateRoleChange({ ...base, actorRole: "owner", targetRole: "member", newRole: "billing" })
    ).toBe("role_not_assignable");
    expect(
      validateRoleChange({
        ...base,
        isFormbricksCloud: true,
        actorRole: "owner",
        targetRole: "member",
        newRole: "billing",
      })
    ).toBeNull();
  });

  test("the last owner cannot be demoted", () => {
    expect(
      validateRoleChange({
        ...base,
        ownerCount: 1,
        actorRole: "owner",
        targetRole: "owner",
        newRole: "manager",
      })
    ).toBe("last_owner");
    expect(
      validateRoleChange({
        ...base,
        ownerCount: 2,
        actorRole: "owner",
        targetRole: "owner",
        newRole: "manager",
      })
    ).toBeNull();
  });
});

describe("canEditRoleOf", () => {
  test("owner can edit another member", () => {
    expect(canEditRoleOf({ ...base, actorRole: "owner", targetRole: "member" })).toBe(true);
  });

  test("own row is never editable", () => {
    expect(canEditRoleOf({ ...base, actorRole: "owner", isSelf: true, targetRole: "owner" })).toBe(false);
  });

  test("manager cannot edit a member (member is the only role they can assign)", () => {
    expect(canEditRoleOf({ ...base, actorRole: "manager", targetRole: "member" })).toBe(false);
  });

  test("manager can edit another manager", () => {
    expect(canEditRoleOf({ ...base, actorRole: "manager", targetRole: "manager" })).toBe(true);
  });

  test("an owner row is locked while it is the only owner", () => {
    expect(canEditRoleOf({ ...base, ownerCount: 1, actorRole: "owner", targetRole: "owner" })).toBe(false);
  });
});
