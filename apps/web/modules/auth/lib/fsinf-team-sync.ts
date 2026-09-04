import "server-only";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import {
  getAuthentikGroupsForEmail,
  listAuthentikGroupNames,
} from "@/modules/auth/lib/fsinf-authentik-directory";

/**
 * FSINF: keep Formbricks team membership in step with Authentik group membership.
 *
 * Workspace access in Formbricks is granted through teams (TeamUser → Team → WorkspaceTeam), so
 * mapping "who is in the Authentik group" onto "who is in the Formbricks team" is what makes
 * "everyone with the Studierende role can use the Studierende workspace" true without anyone
 * maintaining a second list by hand. Which workspaces a team may see, and with which permission,
 * stays a decision made in the UI under Team Access — this only fills the teams.
 *
 * MATCHING RULE, deliberately conservative. A Formbricks team is in scope only when its name matches
 * the name of SOME Authentik group (case-insensitively) — that is what marks it as "mirrored from
 * Authentik". Two consequences, both intended:
 *   • A team with no Authentik counterpart is never touched, so a hand-curated team cannot be emptied
 *     by this code.
 *   • Within a mirrored team, membership follows Authentik in BOTH directions: joining the group
 *     grants access on the next sign-in, leaving it revokes access the same way.
 * Deciding scope from the instance's full group list (not just the user's groups) is what makes
 * removal safe — otherwise a user's last group would look identical to "team isn't mirrored".
 *
 * New members are added as `contributor`, never `admin`: a team admin can change that team's workspace
 * access, and that authority should not follow automatically from group membership. An existing
 * membership is never downgraded, so a human promotion to admin survives the sync.
 */

/** Runs on sign-in, so it must never throw and never block the login. */
export const syncFsinfTeamsForUser = async ({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<void> => {
  try {
    const [userGroups, allGroupNames] = await Promise.all([
      getAuthentikGroupsForEmail(email),
      listAuthentikGroupNames(),
    ]);

    // Directory unconfigured or unreachable: leave every membership exactly as it is. Guessing here
    // would revoke access on an Authentik outage.
    if (userGroups === null || allGroupNames === null) return;

    const normalize = (value: string): string => value.trim().toLowerCase();
    const userGroupNames = new Set(userGroups.map(normalize));
    const mirroredGroupNames = new Set(allGroupNames.map(normalize));

    // Only the teams of organizations this user actually belongs to are in scope.
    const memberships = await prisma.membership.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    if (memberships.length === 0) return;

    const teams = await prisma.team.findMany({
      where: { organizationId: { in: memberships.map((membership) => membership.organizationId) } },
      select: { id: true, name: true },
    });

    const mirroredTeams = teams.filter((team) => mirroredGroupNames.has(normalize(team.name)));
    const teamsToJoin = mirroredTeams.filter((team) => userGroupNames.has(normalize(team.name)));
    const teamIdsToLeave = mirroredTeams
      .filter((team) => !userGroupNames.has(normalize(team.name)))
      .map((team) => team.id);

    for (const team of teamsToJoin) {
      await prisma.teamUser.upsert({
        where: { teamId_userId: { teamId: team.id, userId } },
        create: { teamId: team.id, userId, role: "contributor" },
        update: {}, // never downgrade a human-promoted team admin
      });
    }

    let removed = 0;
    if (teamIdsToLeave.length > 0) {
      const result = await prisma.teamUser.deleteMany({
        where: { userId, teamId: { in: teamIdsToLeave } },
      });
      removed = result.count;
    }

    logger.info(
      { userId, joined: teamsToJoin.length, removed },
      "FSINF team sync: applied Authentik group membership"
    );
  } catch (error) {
    // Sign-in must succeed even when Authentik or the database misbehaves here; the next sign-in
    // retries, and every write above is idempotent.
    logger.error(error, "FSINF team sync: failed to apply Authentik group membership");
  }
};

/**
 * Sign-in entry point: resolve the account, then sync.
 *
 * Only IdP-backed accounts are synced. Team membership is keyed on the email address, and for a
 * password account that address is whatever the account carries — so honouring it here would let an
 * address alone inherit an Authentik group's workspace access. An `openid` account got its address
 * from Authentik itself, which is the assurance this mapping needs.
 */
export const syncFsinfTeamsOnSignIn = async (userId: string): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, identityProvider: true },
    });
    if (!user?.email || user.identityProvider !== "openid") return;

    await syncFsinfTeamsForUser({ userId, email: user.email });
  } catch (error) {
    logger.error(error, "FSINF team sync: could not resolve the signing-in user");
  }
};
