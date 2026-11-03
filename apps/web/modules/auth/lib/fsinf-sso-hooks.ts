import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { normalizeUserName } from "@formbricks/types/user";
import { findMatchingLocale } from "@/lib/utils/locale";
import { FSINF_SSO_PROVIDER_ID } from "@/modules/auth/lib/fsinf-sso-config";
import { provisionFsinfSsoUser } from "@/modules/auth/lib/fsinf-sso-provisioning";

/**
 * FSINF: the Better Auth database hooks for our own Authentik provider ("fsinf-authentik").
 *
 * This build has no other SSO provider (the upstream ones lived in the Enterprise Edition, which is not
 * part of this AGPL-only fork), so these hooks only act on our provider and leave every other write to
 * Better Auth's defaults. Credential sign-ups stay governed by the closed-sign-up policy in
 * signup-policy.ts (before-hook on /sign-up/email) and by createUserAction — and are switched off
 * entirely on this instance via EMAIL_AUTH_DISABLED.
 *
 * `identityProvider` is persisted as "openid" — the Prisma enum's value for a generic OIDC identity,
 * which is exactly what Authentik is. Using it keeps these rows indistinguishable from any other OIDC
 * user for the rest of the app (account linking, profile UI).
 */

const FSINF_IDENTITY_PROVIDER = "openid" as const;

/**
 * Better Auth sets `context.path` to the route PATTERN (`/oauth2/callback/:providerId`) and the matched
 * provider on `context.params`, so prefer the param and fall back to parsing a resolved path.
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

/** Email local-part as a display name when Authentik supplies none. */
const deriveNameFromEmail = (email: string): string =>
  normalizeUserName(email.split("@")[0].replace(/[._+]+/g, " "));

export const fsinfSsoDatabaseHooks: NonNullable<BetterAuthOptions["databaseHooks"]> = {
  user: {
    create: {
      before: async (user, context) => {
        // Not our callback: keep Better Auth's default row.
        if (!isFsinfSsoCallback(context)) return;

        // Enrich the row in the single INSERT: the IdP attests the address, `image` is stripped (User has no such column, and Better Auth maps the OIDC
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
        if (!isFsinfSsoCallback(context)) return;
        await provisionFsinfSsoUser({ userId: user.id });
      },
    },
  },
  account: {
    create: {
      after: async (account, context) => {
        if (account.providerId !== FSINF_SSO_PROVIDER_ID || !context) return;
        // The provider account id doesn't exist yet in user.create.before (Better Auth writes the
        // account row separately), so denormalize both columns here.
        await context.context.internalAdapter.updateUser(account.userId, {
          identityProvider: FSINF_IDENTITY_PROVIDER,
          identityProviderAccountId: account.accountId,
        });
      },
    },
  },
};
