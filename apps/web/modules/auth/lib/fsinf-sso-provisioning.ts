import "server-only";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { createMembership } from "@/lib/membership/service";

/**
 * FSINF: just-in-time provisioning for a user created by our own Authentik provider
 * (fsinf-sso-config.ts). Deliberately lives outside modules/ee/sso — see that file's comment for why
 * we don't touch the license-gated EE provisioning (`gateSsoProvisioning` /
 * `provisionSsoUserMemberships`) even though this mirrors its non-Cloud behaviour.
 *
 * Policy, matching what a single-organization self-hosted instance needs: whoever Authentik lets
 * through is a Fachschaft member, so no Formbricks invite is required. Access control stays with
 * Authentik's application policies — this instance has exactly one organization and every SSO user
 * joins it as `member`.
 *
 * Before the first organization exists (a freshly set-up instance), no membership is written: the
 * app redirects a user without one to /setup/organization/create, where they become its owner.
 */

/** Same shape as the EE writes: post-commit, idempotent, best-effort, and never throws. */
export const provisionFsinfSsoUser = async ({ userId }: { userId: string }): Promise<void> => {
  try {
    const organization = await prisma.organization.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    // Fresh instance: onboarding turns this user into the owner of the organization they create.
    if (!organization) return;

    await createMembership(organization.id, userId, { role: "member", accepted: true });
  } catch (error) {
    // The user and account rows are already committed by Better Auth, so throwing here would not roll
    // them back — it would only break an otherwise successful sign-in. Log for reconciliation instead;
    // createMembership upserts, so an operational retry (or the operator adding the member by hand) is
    // safe. Same trade-off the EE provisioning makes.
    logger.error(error, "FSINF SSO provisioning: failed to assign the new user to its organization");
  }
};
