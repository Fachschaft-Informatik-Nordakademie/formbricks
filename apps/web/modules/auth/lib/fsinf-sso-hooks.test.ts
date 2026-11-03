import { beforeEach, describe, expect, test, vi } from "vitest";

const provisionFsinfSsoUser = vi.fn(async () => undefined);

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/types/user", () => ({
  normalizeUserName: (name: string) => name.replace(/[^a-zA-Z0-9 ]/g, "").trim(),
}));
vi.mock("@/lib/utils/locale", () => ({ findMatchingLocale: async () => "de-DE" }));
vi.mock("@/modules/auth/lib/fsinf-sso-config", () => ({ FSINF_SSO_PROVIDER_ID: "fsinf-authentik" }));
vi.mock("@/modules/auth/lib/fsinf-sso-provisioning", () => ({ provisionFsinfSsoUser }));

const loadHooks = async () => {
  vi.resetModules();
  const { fsinfSsoDatabaseHooks } = await import("./fsinf-sso-hooks");
  return fsinfSsoDatabaseHooks;
};

const ssoUser = { id: "user-1", email: "erika.musterfrau@nordakademie.de", name: "" };

describe("FSINF SSO database hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does not run the credential sign-up branch for our Authentik callback", async () => {
    const hooks = await loadHooks();

    // Our callback must produce a fully enriched SSO row in the single INSERT.
    const result = await hooks.user?.create?.before?.(ssoUser as never, {
      path: "/oauth2/callback/:providerId",
      params: { providerId: "fsinf-authentik" },
    } as never);

    expect(result).toMatchObject({
      data: {
        emailVerified: true,
        identityProvider: "openid",
        locale: "de-DE",
        image: undefined,
        // No name from the IdP → humanized email local-part.
        name: "erika musterfrau",
      },
    });
  });

  test("recognises the callback from a resolved path when no params are parsed", async () => {
    const hooks = await loadHooks();

    const result = await hooks.user?.create?.before?.(ssoUser as never, {
      path: "/oauth2/callback/fsinf-authentik",
    } as never);

    expect(result).toMatchObject({ data: { identityProvider: "openid" } });
  });

  test("normalises an IdP-supplied display name", async () => {
    const hooks = await loadHooks();

    const result = await hooks.user?.create?.before?.(
      { ...ssoUser, name: "Erika (Vorstand) Musterfrau" } as never,
      { path: "/oauth2/callback/fsinf-authentik" } as never
    );

    expect(result).toMatchObject({ data: { name: "Erika Vorstand Musterfrau" } });
  });

  test("leaves every other write to Better Auth's defaults", async () => {
    const hooks = await loadHooks();

    await expect(
      hooks.user?.create?.before?.(ssoUser as never, { path: "/sign-up/email" } as never)
    ).resolves.toBeUndefined();

    await hooks.user?.create?.after?.(ssoUser as never, {
      path: "/oauth2/callback/openid",
      params: { providerId: "openid" },
    } as never);
    expect(provisionFsinfSsoUser).not.toHaveBeenCalled();
  });

  test("provisions the new user after our own callback", async () => {
    const hooks = await loadHooks();

    await hooks.user?.create?.after?.(ssoUser as never, {
      path: "/oauth2/callback/fsinf-authentik",
    } as never);

    expect(provisionFsinfSsoUser).toHaveBeenCalledWith({ userId: "user-1" });
  });

  test("denormalises the identity provider onto the user once our account row exists", async () => {
    const hooks = await loadHooks();
    const updateUser = vi.fn(async () => undefined);

    await hooks.account?.create?.after?.(
      { userId: "user-1", accountId: "authentik-sub-1", providerId: "fsinf-authentik" } as never,
      { context: { internalAdapter: { updateUser } } } as never
    );

    expect(updateUser).toHaveBeenCalledWith("user-1", {
      identityProvider: "openid",
      identityProviderAccountId: "authentik-sub-1",
    });
  });

  test("does not touch the user for credential account rows", async () => {
    const hooks = await loadHooks();
    const updateUser = vi.fn(async () => undefined);

    await hooks.account?.create?.after?.(
      { userId: "user-1", accountId: "user-1", providerId: "credential" } as never,
      { context: { internalAdapter: { updateUser } } } as never
    );

    expect(updateUser).not.toHaveBeenCalled();
  });
});
