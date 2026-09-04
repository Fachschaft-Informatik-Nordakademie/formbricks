import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { getSession } from "@/modules/auth/lib/session";

/**
 * FSINF: per-survey isolation for people who only contribute to a workspace.
 *
 * Formbricks' own access control stops at the workspace: everyone who can open a workspace sees every
 * survey in it, including the responses. `Survey.createdBy` exists but is only a display filter
 * ("Created by: you / others"), never a permission. This module turns it into one.
 *
 * THE RULE (decided 2026-09-04): a viewer is RESTRICTED in a workspace when their access to it comes
 * only from being a team `contributor`. Then they see exactly the surveys they created. Anyone who is
 * an organization owner or manager, or a `admin` of a team that reaches the workspace, is unrestricted
 * and sees everything — that is the Vorstand's view.
 *
 * Surveys with no creator (`createdBy` null — templates, imports, seeds) are visible only to
 * unrestricted viewers. That is the safe direction: the worst case is that someone is missing a
 * survey, not that someone sees one they shouldn't.
 *
 * WHERE THIS IS ENFORCED, and why that is enough:
 *   • `getSurvey()` — the single choke point for one survey. Pages read through it, and every
 *     survey-scoped server action authorizes through `getWorkspaceIdFromSurveyId()`, which itself
 *     calls `getSurvey()` and throws ResourceNotFoundError on null. So hiding a survey here denies
 *     both reading it AND writing to it, across ~51 action call sites, without touching any of them.
 *   • The list services in `modules/survey/list/lib/survey.ts` — scoped with the same predicate.
 *   • The summary and responses pages resolve the survey through `getSurvey()` first, so response
 *     data follows the same boundary.
 *   • The management APIs (v1/v2/v3) authenticate with API keys, and creating one requires
 *     organization owner or manager — a restricted viewer cannot mint one, so that surface is not
 *     reachable for them. A session-authenticated v3 call goes through the same `getSurvey()`.
 *
 * OUTSIDE A USER REQUEST there is no session — public survey links, webhooks, integrations and cron
 * all resolve to "no viewer" and stay unrestricted, which is what keeps published surveys working.
 */

export interface TSurveyViewerRestriction {
  /** The viewer may only see surveys they created themselves. */
  restrictedToCreatorId: string;
}

/**
 * Resolve whether the CURRENT request's viewer is restricted in this workspace.
 *
 * Returns null for "no restriction" — which covers the unrestricted roles, and equally the system and
 * public paths that have no session at all. Cached per request, so the extra queries are paid once
 * even though `getSurvey` may run many times while rendering a page.
 */
export const getSurveyViewerRestriction = reactCache(
  async (workspaceId: string): Promise<TSurveyViewerRestriction | null> => {
    try {
      const session = await getSession();
      if (!session?.user?.id) return null; // public link, webhook, cron, API key — not a viewer

      const userId = session.user.id;

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { organizationId: true },
      });
      if (!workspace) return null;

      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId: workspace.organizationId } },
        select: { role: true },
      });
      // Not a member at all: the caller's own authorization decides that, and it is not this module's
      // job to invent an access rule for it.
      if (!membership) return null;
      if (membership.role === "owner" || membership.role === "manager") return null;

      // A team admin administers the team's workspaces, so they see everything the team can reach.
      const adminOfReachingTeam = await prisma.teamUser.findFirst({
        where: {
          userId,
          role: "admin",
          team: { workspaceTeams: { some: { workspaceId } } },
        },
        select: { teamId: true },
      });
      if (adminOfReachingTeam) return null;

      return { restrictedToCreatorId: userId };
    } catch (error) {
      // Outside a request scope `headers()` throws; that is a system path, and system paths are
      // unrestricted by design. Anything else is logged — but this must never take the app down.
      logger.debug({ error, workspaceId }, "FSINF survey visibility: no viewer restriction resolved");
      return null;
    }
  }
);

/** Is this one survey visible to the current viewer? */
export const isSurveyVisibleToViewer = async (survey: {
  workspaceId: string;
  createdBy?: string | null;
}): Promise<boolean> => {
  const restriction = await getSurveyViewerRestriction(survey.workspaceId);
  if (!restriction) return true;
  return survey.createdBy === restriction.restrictedToCreatorId;
};

/**
 * The Prisma clause that scopes a survey LIST to what the current viewer may see. Empty object when
 * unrestricted, so it can be spread into any existing `where` without changing it.
 */
export const buildViewerSurveyWhere = async (
  workspaceId: string
): Promise<{ createdBy?: string }> => {
  const restriction = await getSurveyViewerRestriction(workspaceId);
  return restriction ? { createdBy: restriction.restrictedToCreatorId } : {};
};
