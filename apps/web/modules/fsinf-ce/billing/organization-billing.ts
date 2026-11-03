import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import type { TOrganizationBilling } from "@formbricks/types/organizations";

/**
 * FSINF CE: billing as seen by a self-hosted instance without Stripe or a license — no plan, no limits.
 *
 * Stored `OrganizationBilling` rows (if any, e.g. from an earlier cloud-style setup) are deliberately
 * ignored: their limits were plan limits, and this build has no plans.
 */
export const SELF_HOSTED_BILLING: Readonly<TOrganizationBilling> = Object.freeze({
  stripeCustomerId: null,
  limits: { workspaces: null, monthly: { responses: null, workflowRuns: null } },
  usageCycleAnchor: null,
});

/** Returns `null` when the organization does not exist (callers map that to a not-found error). */
export const getSelfHostedOrganizationBilling = reactCache(
  async (organizationId: string): Promise<TOrganizationBilling | null> => {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) return null;
    return {
      ...SELF_HOSTED_BILLING,
      limits: {
        ...SELF_HOSTED_BILLING.limits,
        monthly: { ...SELF_HOSTED_BILLING.limits.monthly },
      },
    };
  }
);
