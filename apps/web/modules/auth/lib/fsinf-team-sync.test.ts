import { beforeEach, describe, expect, test, vi } from "vitest";

const getAuthentikGroupsForEmail = vi.fn();
const listAuthentikGroupNames = vi.fn();

const prismaMock = {
  user: { findUnique: vi.fn() },
  membership: { findMany: vi.fn() },
  teamUser: { upsert: vi.fn(), deleteMany: vi.fn() },
  team: { findMany: vi.fn(), upsert: vi.fn() },
};

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/database", () => ({ prisma: prismaMock }));
vi.mock("@formbricks/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/modules/auth/lib/fsinf-authentik-directory", () => ({
  getAuthentikGroupsForEmail,
  listAuthentikGroupNames,
}));

const loadSync = async () => {
  vi.resetModules();
  const { syncFsinfTeamsForUser } = await import("./fsinf-team-sync");
  return syncFsinfTeamsForUser;
};

const loadSignIn = async () => {
  vi.resetModules();
  const { syncFsinfTeamsOnSignIn } = await import("./fsinf-team-sync");
  return syncFsinfTeamsOnSignIn;
};

const user = { userId: "user-1", email: "20066@nordakademie.de" };

describe("FSINF team sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.membership.findMany.mockResolvedValue([{ organizationId: "org-1" }]);
    prismaMock.teamUser.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.teamUser.upsert.mockResolvedValue({});
    prismaMock.team.upsert.mockResolvedValue({});
    listAuthentikGroupNames.mockResolvedValue(["Studierende", "Fachschaft Informatik"]);
  });

  test("adds the user to the team mirroring their Authentik group", async () => {
    getAuthentikGroupsForEmail.mockResolvedValue(["Studierende"]);
    prismaMock.team.findMany.mockResolvedValue([{ id: "team-stud", name: "Studierende" }]);

    await (await loadSync())(user);

    expect(prismaMock.teamUser.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId_userId: { teamId: "team-stud", userId: "user-1" } },
        create: { teamId: "team-stud", userId: "user-1", role: "contributor" },
        update: {},
      })
    );
  });

  test("matches team and group names case-insensitively", async () => {
    getAuthentikGroupsForEmail.mockResolvedValue(["studierende"]);
    prismaMock.team.findMany.mockResolvedValue([{ id: "team-stud", name: "  Studierende " }]);

    await (await loadSync())(user);

    expect(prismaMock.teamUser.upsert).toHaveBeenCalledTimes(1);
  });

  test("removes the user from a mirrored team once they leave the group", async () => {
    getAuthentikGroupsForEmail.mockResolvedValue(["Fachschaft Informatik"]);
    prismaMock.team.findMany.mockResolvedValue([
      { id: "team-stud", name: "Studierende" },
      { id: "team-fsinf", name: "Fachschaft Informatik" },
    ]);

    await (await loadSync())(user);

    expect(prismaMock.teamUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", teamId: { in: ["team-stud"] } },
    });
  });

  test("never touches a team that mirrors no Authentik group", async () => {
    getAuthentikGroupsForEmail.mockResolvedValue([]);
    prismaMock.team.findMany.mockResolvedValue([{ id: "team-hand", name: "Orga-Team" }]);

    await (await loadSync())(user);

    expect(prismaMock.teamUser.upsert).not.toHaveBeenCalled();
    expect(prismaMock.teamUser.deleteMany).not.toHaveBeenCalled();
  });

  test("changes nothing when Authentik cannot be reached", async () => {
    // The dangerous case: treating an outage as "member of no groups" would revoke everyone's access.
    getAuthentikGroupsForEmail.mockResolvedValue(null);
    listAuthentikGroupNames.mockResolvedValue(null);

    await (await loadSync())(user);

    expect(prismaMock.team.findMany).not.toHaveBeenCalled();
    expect(prismaMock.teamUser.deleteMany).not.toHaveBeenCalled();
  });

test("creates a Formbricks team for every Authentik group", async () => {
    getAuthentikGroupsForEmail.mockResolvedValue(["Studierende"]);
    prismaMock.team.findMany.mockResolvedValue([{ id: "team-stud", name: "Studierende" }]);

    await (await loadSync())(user);

    expect(prismaMock.team.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_name: { organizationId: "org-1", name: "Studierende" } },
        create: { organizationId: "org-1", name: "Studierende" },
        update: {},
      })
    );
    expect(prismaMock.team.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_name: { organizationId: "org-1", name: "Fachschaft Informatik" } },
      })
    );
  });

  test("creates no teams when the directory could not be read", async () => {
    getAuthentikGroupsForEmail.mockResolvedValue(null);
    listAuthentikGroupNames.mockResolvedValue(null);

    await (await loadSync())(user);

    expect(prismaMock.team.upsert).not.toHaveBeenCalled();
  });

    test("never lets a failure escape into the sign-in", async () => {
    getAuthentikGroupsForEmail.mockRejectedValue(new Error("boom"));

    await expect((await loadSync())(user)).resolves.toBeUndefined();
  });
});

describe("FSINF team sync on sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.membership.findMany.mockResolvedValue([{ organizationId: "org-1" }]);
    prismaMock.team.findMany.mockResolvedValue([{ id: "team-stud", name: "Studierende" }]);
    prismaMock.teamUser.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.teamUser.upsert.mockResolvedValue({});
    prismaMock.team.upsert.mockResolvedValue({});
    listAuthentikGroupNames.mockResolvedValue(["Studierende"]);
    getAuthentikGroupsForEmail.mockResolvedValue(["Studierende"]);
  });

  test("syncs an Authentik-backed account", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "20066@nordakademie.de",
      identityProvider: "openid",
    });

    await (await loadSignIn())("user-1");

    expect(getAuthentikGroupsForEmail).toHaveBeenCalledWith("20066@nordakademie.de");
    expect(prismaMock.teamUser.upsert).toHaveBeenCalledTimes(1);
  });

  test("skips a password account, so an address alone cannot inherit a group's access", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "20066@nordakademie.de",
      identityProvider: "email",
    });

    await (await loadSignIn())("user-1");

    expect(getAuthentikGroupsForEmail).not.toHaveBeenCalled();
    expect(prismaMock.teamUser.upsert).not.toHaveBeenCalled();
  });
});
