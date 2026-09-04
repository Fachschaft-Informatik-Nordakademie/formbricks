import "server-only";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_ISSUER, WEBAPP_URL } from "@/lib/constants";

/**
 * FSINF: our own, always-on OIDC login against Authentik (portal.nak-studis.de).
 *
 * This is deliberately independent of `@/modules/ee/sso` — that module's SSO providers are gated
 * behind `ENTERPRISE_LICENSE_KEY` per the Formbricks Enterprise Edition license
 * (apps/web/modules/ee/LICENSE), which we don't hold. Better Auth's `genericOAuth` plugin itself is
 * MIT-licensed (third-party, not Formbricks' own EE code), so registering our own provider entry here
 * — outside apps/web/modules/ee/ — uses only AGPL-licensed code we're free to run and modify.
 *
 * Reuses the same OIDC_CLIENT_ID/SECRET/ISSUER env vars the (unused, license-gated) EE OIDC provider
 * would have used, since those constants are plain config, not EE code. Provider ID is
 * "fsinf-authentik" (distinct from the EE module's "openid") so the callback path is
 * /api/auth/oauth2/callback/fsinf-authentik — the Authentik provider's redirect_uri must match.
 */
export const FSINF_SSO_ENABLED = !!(OIDC_CLIENT_ID && OIDC_CLIENT_SECRET && OIDC_ISSUER);

export const FSINF_SSO_DISPLAY_NAME = "Authentik";

/**
 * Distinct from the EE module's "openid" on purpose — see above. Exported because the callback path
 * (/api/auth/oauth2/callback/fsinf-authentik) and the database hooks in fsinf-sso-hooks.ts both have to
 * agree with it.
 */
export const FSINF_SSO_PROVIDER_ID = "fsinf-authentik";

/**
 * Authentik reports its issuer WITH a trailing slash (…/application/o/<slug>/), and OIDC_ISSUER is
 * normally copied from the provider config in exactly that form. Appending the well-known path to it
 * verbatim yields a double slash, which Authentik answers with 404 — Better Auth then never learns
 * the authorization_endpoint and rejects sign-in with INVALID_OAUTH_CONFIGURATION. Strip trailing
 * slashes so both spellings of the env var work.
 */
const discoveryUrlFor = (issuer: string): string =>
  `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/** Authentik's redirect_uri is fixed to this origin — see fsinf-authentik-button.tsx for why. */
export const FSINF_SSO_CANONICAL_ORIGIN = WEBAPP_URL ?? "";

export const fsinfSsoConfig: GenericOAuthConfig[] = FSINF_SSO_ENABLED
  ? [
      {
        providerId: FSINF_SSO_PROVIDER_ID,
        clientId: OIDC_CLIENT_ID ?? "",
        clientSecret: OIDC_CLIENT_SECRET ?? "",
        discoveryUrl: discoveryUrlFor(OIDC_ISSUER ?? ""),
        scopes: ["openid", "email", "profile"],
        pkce: true,
        // Authentik doesn't return the RFC 9207 `iss` param on the callback (same situation as the
        // Azure provider above — verified live: enabling this makes every login fail with
        // error=issuer_missing). PKCE + state validation above already bind the exchange.
        requireIssuerValidation: false,
        mapProfileToUser: (profile) => ({
          email: profile.email,
          name:
            profile.name ||
            [profile.given_name, profile.family_name].filter(Boolean).join(" ") ||
            profile.preferred_username,
        }),
      } satisfies GenericOAuthConfig,
    ]
  : [];
