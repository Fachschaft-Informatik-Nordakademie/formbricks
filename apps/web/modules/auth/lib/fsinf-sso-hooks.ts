import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { normalizeUserName } from "@formbricks/types/user";
import { findMatchingLocale } from "@/lib/utils/locale";
import { FSINF_SSO_PROVIDER_ID } from "@/modules/auth/lib/fsinf-sso-config";
import { provisionFsinfSsoUser } from "@/modules/auth/lib/fsinf-sso-provisioning";
import { ssoDatabaseHooks } from "@/modules/ee/sso/lib/better-auth-hooks";

/**
 * FSINF: the database hooks for our own Authentik provider, wrapped around the stock `ssoDatabaseHooks`.
 *
 * WHY this exists. `ssoDatabaseHooks.user.create.before` decides whether a sign-up is an SSO sign-up by
 * running the callback's provider id through the EE `normalizeSsoProvider`, whose map only knows
 * google/github/azuread/openid/saml. Our provider id is "fsinf-authentik" (it has to be: the EE
 * license gate `ssoLicenseGateBeforeHandler` rejects every callback whose id DOES normalize, since
 * this instance holds no enterprise license), so it normalizes to null and the hook falls through to
 * its credential-sign-up branch — which on a closed instance rejects with
 * `error=signup_is_disabled_on_this_instance`. That is the error a first-time Authentik login hit.
 *
 * So our provider needs the SSO half of that hook, and gets it here rather than by teaching the EE
 * module about us: everything below is our own AGPL-side code, and the EE hooks stay untouched and in
 * charge of every provider that is not ours.
 *
 * `identityProvider` is persisted as "openid" — the Prisma enum's value for a generic OIDC identity,
 * which is exactly what Authentik is. The enum is schema, not EE code; using it keeps these rows
 * indistinguishable from any other OIDC user for the rest of the app (account linking, profile UI).
 */

const FSINF_IDENTITY_PROVIDER = "openid" as const;

/**
 * Better Auth sets `context.path` to the route PATTERN (`/oauth2/callback/:providerId`) and the matched
 * provider on `context.params`, so prefer the param and fall back to parsing a resolved path — the same
 * two shapes the EE `getSsoProviderFromContext` handles.
 */
const isFsinfSsoCallback = (
  context: { path?: string; params?: Record<string, string | undefined> } | null | undefined
): boolean => {
  const path = context?.path;
  if (!path?.includes("/callback")) return false;
  const fromParams = context?.params?.providerId ?? context?.params?.id;
  if (fromParams && !fromParams.startsWith(":")) return fromParams === FSINF_SSO_PROVIDER_ID;
  return new RegExp(`/callback/${FSINF_SSO_PROVIDER_ID}$`).test(path.split("?")[0]);
};

/** Email local-part as a display name when Authentik supplies none — parity with the EE fallback. */
const deriveNameFromEmail = (email: string): string =>
  normalizeUserName(email.split("@")[0].replace(/[._+]+/g, " "));

export const fsinfSsoDatabaseHooks: NonNullable<BetterAuthOptions["databaseHooks"]> = {
  ...ssoDatabaseHooks,
  user: {
    ...ssoDatabaseHooks.user,
    create: {
      ...ssoDatabaseHooks.user?.create,
      before: async (user, context) => {
        if (!isFsinfSsoCallback(context)) {
          return ssoDatabaseHooks.user?.create?.before?.(user, context);
        }

        // Enrich the row in the single INSERT, mirroring the EE SSO branch: the IdP attests the
        // address, `image` is stripped (User has no such column, and Better Auth maps the OIDC
        // `picture` claim into it), and the display name is normalized so a name carrying punctuation
        // can't persist in a form the profile form would later reject.
        return {
          data: {
            emailVerified: true,
            identityProvider: FSINF_IDENTITY_PROVIDER,
            locale: await findMatchingLocale(),
            image: undefined,
            name: (user.name && normalizeUserName(user.name)) || deriveNameFromEmail(user.email) || "User",
          },
        };
      },
      after: async (user, context) => {
        if (!isFsinfSsoCallback(context)) {
          return ssoDatabaseHooks.user?.create?.after?.(user, context);
        }
        await provisionFsinfSsoUser({ userId: user.id });
      },
    },
  },
  account: {
    ...ssoDatabaseHooks.account,
    create: {
      ...ssoDatabaseHooks.account?.create,
      after: async (account, context) => {
        if (account.providerId !== FSINF_SSO_PROVIDER_ID) {
          return ssoDatabaseHooks.account?.create?.after?.(account, context);
        }
        if (!context) return;
        // The provider account id doesn't exist yet in user.create.before (Better Auth writes the
        // account row separately), so denormalize both columns here — same as the EE hook does for its
        // own providers.
        await context.context.internalAdapter.updateUser(account.userId, {
          identityProvider: FSINF_IDENTITY_PROVIDER,
          identityProviderAccountId: account.accountId,
        });
      },
    },
  },
};
