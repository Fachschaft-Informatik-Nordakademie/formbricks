import { beforeEach, describe, expect, test, vi } from "vitest";

const getSession = vi.fn();
const prismaMock = {
  workspace: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn() },
  teamUser: { findFirst: vi.fn() },
};

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@formbricks/database", () => ({ prisma: prismaMock }));
vi.mock("@formbricks/logger", () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock("@/modules/auth/lib/session", () => ({ getSession }));

const load = async () => {
  vi.resetModules();
  return await import("./fsinf-survey-visibility");
};

const asMember = () => {
  getSession.mockResolvedValue({ user: { id: "student-1" } });
  prismaMock.workspace.findUnique.mockResolvedValue({ organizationId: "org-1" });
  prismaMock.membership.findUnique.mockResolvedValue({ role: "member" });
  prismaMock.teamUser.findFirst.mockResolvedValue(null);
};

describe("FSINF survey visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("restricts a plain member who only contributes to the workspace", async () => {
    asMember();
    const { getSurveyViewerRestriction } = await load();

    expect(await getSurveyViewerRestriction("ws-1")).toEqual({ restrictedToCreatorId: "student-1" });
  });

  test.each(["owner", "manager"])("leaves an organization %s unrestricted", async (role) => {
    asMember();
    prismaMock.membership.findUnique.mockResolvedValue({ role });
    const { getSurveyViewerRestriction } = await load();

    expect(await getSurveyViewerRestriction("ws-1")).toBeNull();
  });

  test("leaves an admin of a team that reaches the workspace unrestricted", async () => {
    asMember();
    prismaMock.teamUser.findFirst.mockResolvedValue({ teamId: "team-1" });
    const { getSurveyViewerRestriction } = await load();

    expect(await getSurveyViewerRestriction("ws-1")).toBeNull();
    expect(prismaMock.teamUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "student-1",
          role: "admin",
          team: { workspaceTeams: { some: { workspaceId: "ws-1" } } },
        }),
      })
    );
  });

  test("does not restrict a request without a session, so public links keep working", async () => {
    getSession.mockResolvedValue(null);
    const { getSurveyViewerRestriction } = await load();

    expect(await getSurveyViewerRestriction("ws-1")).toBeNull();
    expect(prismaMock.workspace.findUnique).not.toHaveBeenCalled();
  });

  test("does not restrict outside a request scope, where headers() throws", async () => {
    getSession.mockRejectedValue(new Error("`headers` was called outside a request scope."));
    const { getSurveyViewerRestriction } = await load();

    expect(await getSurveyViewerRestriction("ws-1")).toBeNull();
  });

  describe("isSurveyVisibleToViewer", () => {
    test("shows a restricted viewer their own survey", async () => {
      asMember();
      const { isSurveyVisibleToViewer } = await load();

      expect(await isSurveyVisibleToViewer({ workspaceId: "ws-1", createdBy: "student-1" })).toBe(true);
    });

    test("hides someone else's survey from a restricted viewer", async () => {
      asMember();
      const { isSurveyVisibleToViewer } = await load();

      expect(await isSurveyVisibleToViewer({ workspaceId: "ws-1", createdBy: "student-2" })).toBe(false);
    });

    test("hides a survey without a creator from a restricted viewer", async () => {
      asMember();
      const { isSurveyVisibleToViewer } = await load();

      expect(await isSurveyVisibleToViewer({ workspaceId: "ws-1", createdBy: null })).toBe(false);
    });

    test("shows everything to an unrestricted viewer", async () => {
      asMember();
      prismaMock.membership.findUnique.mockResolvedValue({ role: "owner" });
      const { isSurveyVisibleToViewer } = await load();

      expect(await isSurveyVisibleToViewer({ workspaceId: "ws-1", createdBy: null })).toBe(true);
      expect(await isSurveyVisibleToViewer({ workspaceId: "ws-1", createdBy: "student-2" })).toBe(true);
    });
  });

  describe("buildViewerSurveyWhere", () => {
    test("scopes a list to the viewer's own surveys", async () => {
      asMember();
      const { buildViewerSurveyWhere } = await load();

      expect(await buildViewerSurveyWhere("ws-1")).toEqual({ createdBy: "student-1" });
    });

    test("adds no clause for an unrestricted viewer", async () => {
      asMember();
      prismaMock.membership.findUnique.mockResolvedValue({ role: "manager" });
      const { buildViewerSurveyWhere } = await load();

      expect(await buildViewerSurveyWhere("ws-1")).toEqual({});
    });
  });
});
