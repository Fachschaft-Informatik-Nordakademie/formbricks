import type { TOrganizationRole } from "@formbricks/types/memberships";
import type { TAuthentikDirectoryMember } from "@/modules/auth/lib/fsinf-authentik-directory";

export interface TDirectoryInvitee {
  name: string;
  email: string;
  role: TOrganizationRole;
  teamIds: string[];
}

/**
 * FSINF: turn the people picked from Authentik into invitees for the bulk invite tab.
 *
 * The role mirrors what the CSV path does with a role cell it isn't allowed to read: without access
 * control (no enterprise license) everyone is created as `owner`, which is also the individual tab's
 * default there. Teams stay empty — assigning them needs access control too.
 *
 * Deduplicated by lower-cased email, because two searches can surface the same person, and the invite
 * action is addressed by email.
 */
export const buildInviteesFromDirectory = (
  members: TAuthentikDirectoryMember[],
  isAccessControlAllowed: boolean
): TDirectoryInvitee[] => {
  const seen = new Set<string>();
  return members.reduce<TDirectoryInvitee[]>((acc, member) => {
    const email = member.email.trim().toLowerCase();
    if (!email || seen.has(email)) return acc;
    seen.add(email);
    acc.push({
      name: member.name.trim(),
      email,
      role: (isAccessControlAllowed ? "member" : "owner") as TOrganizationRole,
      teamIds: [],
    });
    return acc;
  }, []);
};
