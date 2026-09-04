import { beforeEach, describe, expect, test, vi } from "vitest";

const constantsMock = { FSINF_GROUP_WORKSPACE_MAP: undefined as string | undefined };
const loggerError = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/logger", () => ({ logger: { error: loggerError, warn: vi.fn() } }));
vi.mock("@/lib/constants", () => constantsMock);

const load = async () => {
  vi.resetModules();
  return await import("./fsinf-group-workspace-map");
};

describe("FSINF group → workspace mapping", () => {
  beforeEach(() => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP = undefined;
    loggerError.mockClear();
  });

  test("maps nothing when unconfigured", async () => {
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()).toEqual([]);
  });

  test("reads the shorthand form and defaults to readWrite", async () => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP = '{"Studierende": "NAK Studis"}';
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()).toEqual([
      { groupName: "Studierende", workspaceName: "NAK Studis", permission: "readWrite" },
    ]);
  });

  test("reads an explicit permission", async () => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP =
      '{"Studierende": {"workspace": "NAK Studis", "permission": "read"}}';
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()[0].permission).toBe("read");
  });

  test("trims names so a stray space cannot break the lookup", async () => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP = '{" Studierende ": " NAK Studis "}';
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()).toEqual([
      { groupName: "Studierende", workspaceName: "NAK Studis", permission: "readWrite" },
    ]);
  });

  test("maps several groups", async () => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP =
      '{"Studierende": "NAK Studis", "Fachschaft Informatik": {"workspace": "Intern", "permission": "manage"}}';
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()).toHaveLength(2);
  });

  test("grants nothing when the JSON is broken", async () => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP = "{not json";
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()).toEqual([]);
    expect(loggerError).toHaveBeenCalled();
  });

  test("grants nothing when a permission is not a real one", async () => {
    constantsMock.FSINF_GROUP_WORKSPACE_MAP =
      '{"Studierende": {"workspace": "NAK Studis", "permission": "admin"}}';
    const { getGroupWorkspaceLinks } = await load();

    expect(getGroupWorkspaceLinks()).toEqual([]);
    expect(loggerError).toHaveBeenCalled();
  });
});
