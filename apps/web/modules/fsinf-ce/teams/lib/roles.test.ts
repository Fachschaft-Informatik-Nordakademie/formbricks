import { beforeEach, describe, expect, test, vi } from "vitest";
import { getTeamRoleByTeamIdUserId, getTeamsWhereUserIsAdmin, getWorkspacePermissionByUserId } from "./roles";

const mocks = vi.hoisted(() => ({
  teamUserFindUnique: vi.fn(),
  teamUserFindMany: vi.fn(),
  workspaceTeamFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: (...args: unknown[]) => unknown) => fn }));
vi.mock("@formbricks/database", () => ({
  prisma: {
    teamUser: { findUnique: mocks.teamUserFindUnique, findMany: mocks.teamUserFindMany },
    workspaceTeam: { findMany: mocks.workspaceTeamFindMany },
  },
}));
vi.mock("@/lib/utils/validate", () => ({ validateInputs: vi.fn() }));

const userId = "user1";
const teamId = "team1";
const workspaceId = "workspace1";
const organizationId = "org1";

describe("teams/lib/roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("getTeamRoleByTeamIdUserId returns the team role", async () => {
    mocks.teamUserFindUnique.mockResolvedValue({ role: "admin" });
    await expect(getTeamRoleByTeamIdUserId(teamId, userId)).resolves.toBe("admin");
    expect(mocks.teamUserFindUnique).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });
  });

  test("getTeamRoleByTeamIdUserId returns null outside the team", async () => {
    mocks.teamUserFindUnique.mockResolvedValue(null);
    await expect(getTeamRoleByTeamIdUserId(teamId, userId)).resolves.toBeNull();
  });

  test("getTeamsWhereUserIsAdmin is scoped to admin rows of the organization", async () => {
    mocks.teamUserFindMany.mockResolvedValue([{ teamId: "a" }, { teamId: "b" }]);
    await expect(getTeamsWhereUserIsAdmin(userId, organizationId)).resolves.toEqual(["a", "b"]);
    expect(mocks.teamUserFindMany).toHaveBeenCalledWith({
      where: { userId, role: "admin", team: { organizationId } },
      select: { teamId: true },
    });
  });

  test("getWorkspacePermissionByUserId returns the strongest grant of the user's teams", async () => {
    mocks.workspaceTeamFindMany.mockResolvedValue([
      { permission: "read" },
      { permission: "manage" },
      { permission: "readWrite" },
    ]);
    await expect(getWorkspacePermissionByUserId(userId, workspaceId)).resolves.toBe("manage");
    expect(mocks.workspaceTeamFindMany).toHaveBeenCalledWith({
      where: { workspaceId, team: { teamUsers: { some: { userId } } } },
      select: { permission: true },
    });
  });

  test("getWorkspacePermissionByUserId returns null without a grant", async () => {
    mocks.workspaceTeamFindMany.mockResolvedValue([]);
    await expect(getWorkspacePermissionByUserId(userId, workspaceId)).resolves.toBeNull();
  });
});
