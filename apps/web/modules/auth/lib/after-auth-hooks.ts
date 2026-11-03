import "server-only";
import type { AuthHookContext } from "@/modules/auth/lib/auth-hook-context";
import { auditFailedAuthAfter } from "./better-auth-observability";
import { twoFactorBackfillAfterHandler } from "./better-auth-two-factor-backfill";

/**
 * Composed Better Auth `hooks.after` chain, extracted from auth.ts so the order is unit-testable.
 *
 * FSINF CE: the upstream chain also ran the EE SSO handlers (verify-before-link recovery and the
 * personal-email SSO sign-up block). Those providers are not part of this build — the only SSO path is
 * our own Authentik provider (fsinf-sso-config.ts) — so only the AGPL handlers remain.
 */
export const runAfterAuthHooks = async (ctx: AuthHookContext): Promise<void> => {
  await auditFailedAuthAfter(ctx);
  // ENG-1824: heal legacy 2FA enrollments (no `TwoFactor` row) on successful password sign-in, before
  // the 2FA challenge. Only touches `/sign-in/email`.
  await twoFactorBackfillAfterHandler(ctx);
};
