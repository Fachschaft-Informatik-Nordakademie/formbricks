import { beforeEach, describe, expect, test, vi } from "vitest";

const constantsMock = {
  OIDC_CLIENT_ID: undefined as string | undefined,
  OIDC_CLIENT_SECRET: undefined as string | undefined,
  OIDC_ISSUER: undefined as string | undefined,
  WEBAPP_URL: "https://forms.nak-inf.de" as string | undefined,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/constants", () => constantsMock);

const loadConfig = async () => {
  vi.resetModules();
  return await import("./fsinf-sso-config");
};

describe("FSINF Authentik SSO config", () => {
  beforeEach(() => {
    constantsMock.OIDC_CLIENT_ID = "client-id";
    constantsMock.OIDC_CLIENT_SECRET = "client-secret";
    constantsMock.OIDC_ISSUER = "https://portal.nak-studis.de/application/o/nak-inf-forms";
  });

  test("builds the discovery URL from an issuer without a trailing slash", async () => {
    const { fsinfSsoConfig } = await loadConfig();

    expect(fsinfSsoConfig[0].discoveryUrl).toBe(
      "https://portal.nak-studis.de/application/o/nak-inf-forms/.well-known/openid-configuration"
    );
  });

  test("normalises a trailing slash on the issuer instead of producing a double slash", async () => {
    // Authentik reports its issuer WITH a trailing slash, so OIDC_ISSUER is usually copied from the
    // provider config in exactly that form. Naive concatenation then yields
    // "…nak-inf-forms//.well-known/openid-configuration", which Authentik answers with 404 — Better
    // Auth never learns the authorization_endpoint and fails sign-in with
    // INVALID_OAUTH_CONFIGURATION.
    constantsMock.OIDC_ISSUER = "https://portal.nak-studis.de/application/o/nak-inf-forms/";

    const { fsinfSsoConfig } = await loadConfig();

    expect(fsinfSsoConfig[0].discoveryUrl).toBe(
      "https://portal.nak-studis.de/application/o/nak-inf-forms/.well-known/openid-configuration"
    );
  });

  test("is disabled when the OIDC env vars are missing", async () => {
    constantsMock.OIDC_CLIENT_ID = undefined;

    const { FSINF_SSO_ENABLED, fsinfSsoConfig } = await loadConfig();

    expect(FSINF_SSO_ENABLED).toBe(false);
    expect(fsinfSsoConfig).toEqual([]);
  });
});
