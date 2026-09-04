import { beforeEach, describe, expect, test, vi } from "vitest";

const signupDisabled = () => {
  throw new Error("Signup is disabled on this instance.");
};

const baseUserCreateBefore = vi.fn(async () => signupDisabled());
const baseUserCreateAfter = vi.fn(async () => undefined);
const baseAccountCreateAfter = vi.fn(async () => undefined);
const provisionFsinfSsoUser = vi.fn(async () => undefined);

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/types/user", () => ({
  normalizeUserName: (name: string) => name.replace(/[^a-zA-Z0-9 ]/g, "").trim(),
}));
vi.mock("@/lib/utils/locale", () => ({ findMatchingLocale: async () => "de-DE" }));
vi.mock("@/modules/auth/lib/fsinf-sso-config", () => ({ FSINF_SSO_PROVIDER_ID: "fsinf-authentik" }));
vi.mock("@/modules/auth/lib/fsinf-sso-provisioning", () => ({ provisionFsinfSsoUser }));
vi.mock("@/modules/ee/sso/lib/better-auth-hooks", () => ({
  ssoDatabaseHooks: {
    user: { create: { before: baseUserCreateBefore, after: baseUserCreateAfter } },
    account: { create: { after: baseAccountCreateAfter } },
  },
}));

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

    // The bug: the EE hook cannot recognise "fsinf-authentik" as SSO, so it treated the callback as a
    // credential sign-up and rejected it with "Signup is disabled on this instance." on this closed
    // instance. Ours must handle the callback itself and never delegate.
    const result = await hooks.user?.create?.before?.(ssoUser as never, {
      path: "/oauth2/callback/:providerId",
      params: { providerId: "fsinf-authentik" },
    } as never);

    expect(baseUserCreateBefore).not.toHaveBeenCalled();
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

    expect(baseUserCreateBefore).not.toHaveBeenCalled();
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

  test("leaves every other provider to the stock SSO hooks", async () => {
    const hooks = await loadHooks();

    await expect(
      hooks.user?.create?.before?.(ssoUser as never, { path: "/sign-up/email" } as never)
    ).rejects.toThrow("Signup is disabled on this instance.");
    expect(baseUserCreateBefore).toHaveBeenCalledTimes(1);

    await hooks.user?.create?.after?.(ssoUser as never, {
      path: "/oauth2/callback/openid",
      params: { providerId: "openid" },
    } as never);
    expect(baseUserCreateAfter).toHaveBeenCalledTimes(1);
    expect(provisionFsinfSsoUser).not.toHaveBeenCalled();
  });

  test("provisions the new user after our own callback", async () => {
    const hooks = await loadHooks();

    await hooks.user?.create?.after?.(ssoUser as never, {
      path: "/oauth2/callback/fsinf-authentik",
    } as never);

    expect(provisionFsinfSsoUser).toHaveBeenCalledWith({ userId: "user-1" });
    expect(baseUserCreateAfter).not.toHaveBeenCalled();
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
    expect(baseAccountCreateAfter).not.toHaveBeenCalled();
  });

  test("leaves credential account rows to the stock hook", async () => {
    const hooks = await loadHooks();

    await hooks.account?.create?.after?.(
      { userId: "user-1", accountId: "user-1", providerId: "credential" } as never,
      null as never
    );

    expect(baseAccountCreateAfter).toHaveBeenCalledTimes(1);
  });
});
