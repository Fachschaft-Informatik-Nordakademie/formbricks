import { describe, expect, test } from "vitest";
import {
  getHighestTeamPermission,
  getTeamCapabilities,
  isEligibleTeamMember,
  isOrganizationOwnerOrManager,
} from "./permissions";

describe("getHighestTeamPermission", () => {
  test("returns null without grants", () => {
    expect(getHighestTeamPermission([])).toBeNull();
  });

  test("picks the strongest grant regardless of order", () => {
    expect(getHighestTeamPermission(["read", "manage", "readWrite"])).toBe("manage");
    expect(getHighestTeamPermission(["readWrite", "read"])).toBe("readWrite");
    expect(getHighestTeamPermission(["read", "read"])).toBe("read");
  });
});

describe("isOrganizationOwnerOrManager", () => {
  test.each([
    ["owner", true],
    ["manager", true],
    ["member", false],
    ["billing", false],
    [undefined, false],
    [null, false],
  ] as const)("%s -> %s", (role, expected) => {
    expect(isOrganizationOwnerOrManager(role)).toBe(expected);
  });
});

describe("getTeamCapabilities", () => {
  test("owners and managers manage everything, even without a team role", () => {
    for (const organizationRole of ["owner", "manager"] as const) {
      expect(getTeamCapabilities({ organizationRole, teamRole: null })).toEqual({
        canView: true,
        canManageMembers: true,
        canManageTeam: true,
      });
    }
  });

  test("a team admin manages members but not the team's workspace access", () => {
    expect(getTeamCapabilities({ organizationRole: "member", teamRole: "admin" })).toEqual({
      canView: true,
      canManageMembers: true,
      canManageTeam: false,
    });
  });

  test("a contributor only sees the team", () => {
    expect(getTeamCapabilities({ organizationRole: "member", teamRole: "contributor" })).toEqual({
      canView: true,
      canManageMembers: false,
      canManageTeam: false,
    });
  });

  test("a member outside the team sees nothing", () => {
    expect(getTeamCapabilities({ organizationRole: "member", teamRole: null })).toEqual({
      canView: false,
      canManageMembers: false,
      canManageTeam: false,
    });
  });

  test("billing users get nothing, even with a stale team admin role", () => {
    expect(getTeamCapabilities({ organizationRole: "billing", teamRole: "admin" })).toEqual({
      canView: false,
      canManageMembers: false,
      canManageTeam: false,
    });
  });
});

describe("isEligibleTeamMember", () => {
  test("excludes only billing users", () => {
    expect(isEligibleTeamMember("owner")).toBe(true);
    expect(isEligibleTeamMember("manager")).toBe(true);
    expect(isEligibleTeamMember("member")).toBe(true);
    expect(isEligibleTeamMember("billing")).toBe(false);
  });
});
