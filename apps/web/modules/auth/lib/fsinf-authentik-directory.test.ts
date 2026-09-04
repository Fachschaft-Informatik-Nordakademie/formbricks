import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const constantsMock = {
  AUTHENTIK_URL: "https://portal.nak-studis.de/" as string | undefined,
  AUTHENTIK_API_TOKEN: "secret-token" as string | undefined,
  AUTHENTIK_DIRECTORY_GROUP: undefined as string | undefined,
};

const loggerError = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/constants", () => constantsMock);
vi.mock("@formbricks/logger", () => ({ logger: { error: loggerError } }));

const loadDirectory = async () => {
  vi.resetModules();
  return await import("./fsinf-authentik-directory");
};

const okResponse = (results: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ results }),
});

describe("FSINF Authentik directory", () => {
  beforeEach(() => {
    constantsMock.AUTHENTIK_URL = "https://portal.nak-studis.de/";
    constantsMock.AUTHENTIK_API_TOKEN = "secret-token";
    constantsMock.AUTHENTIK_DIRECTORY_GROUP = undefined;
    loggerError.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("asks Authentik for active internal users matching the search term", async () => {
    const fetchMock = vi.fn(async () =>
      okResponse([{ pk: 7, name: "Erika Musterfrau", email: "20066@nordakademie.de", username: "erika" }])
    );
    vi.stubGlobal("fetch", fetchMock);

    const { searchAuthentikMembers } = await loadDirectory();
    const members = await searchAuthentikMembers("  erika ");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Trailing slash on AUTHENTIK_URL must not produce "//api/v3/..." — same class of bug as the
    // OIDC discovery URL.
    expect(url).toContain("https://portal.nak-studis.de/api/v3/core/users/?");
    expect(url).toContain("is_active=true");
    expect(url).toContain("type=internal");
    expect(url).toContain("search=erika");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");

    expect(members).toEqual([
      { id: "7", name: "Erika Musterfrau", email: "20066@nordakademie.de", username: "erika" },
    ]);
  });

  test("omits the search parameter when nothing has been typed yet", async () => {
    const fetchMock = vi.fn(async () => okResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const { searchAuthentikMembers } = await loadDirectory();
    await searchAuthentikMembers("   ");

    expect(fetchMock.mock.calls[0][0]).not.toContain("search=");
  });

  test("restricts the lookup to the configured group", async () => {
    constantsMock.AUTHENTIK_DIRECTORY_GROUP = "Fachschaft Informatik";
    const fetchMock = vi.fn(async () => okResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    const { searchAuthentikMembers } = await loadDirectory();
    await searchAuthentikMembers("");

    expect(fetchMock.mock.calls[0][0]).toContain("groups_by_name=Fachschaft+Informatik");
  });

  test("falls back to the username when Authentik has no display name, and drops users without email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okResponse([
          { pk: 1, name: "   ", email: "20067@nordakademie.de", username: "jdoe" },
          { pk: 2, name: "No Mail", username: "nomail" },
        ])
      )
    );

    const { searchAuthentikMembers } = await loadDirectory();

    expect(await searchAuthentikMembers("")).toEqual([
      { id: "1", name: "jdoe", email: "20067@nordakademie.de", username: "jdoe" },
    ]);
  });

  test("degrades to manual entry when Authentik answers with an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));

    const { searchAuthentikMembers } = await loadDirectory();

    expect(await searchAuthentikMembers("erika")).toEqual([]);
    expect(loggerError).toHaveBeenCalled();
  });

  test("degrades to manual entry when Authentik is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );

    const { searchAuthentikMembers } = await loadDirectory();

    expect(await searchAuthentikMembers("erika")).toEqual([]);
    expect(loggerError).toHaveBeenCalled();
  });

  test("stays inert while the API token is missing", async () => {
    constantsMock.AUTHENTIK_API_TOKEN = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { isAuthentikDirectoryConfigured, searchAuthentikMembers } = await loadDirectory();

    expect(isAuthentikDirectoryConfigured()).toBe(false);
    expect(await searchAuthentikMembers("erika")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
