"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TOrganizationRole } from "@formbricks/types/memberships";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { updateInviteAction, updateMembershipAction } from "@/modules/fsinf-ce/role-management/actions";
import { ORGANIZATION_ROLE_LABEL_KEYS } from "@/modules/fsinf-ce/role-management/lib/labels";
import {
  canEditRoleOf,
  getAssignableOrganizationRoles,
  validateRoleChange,
} from "@/modules/fsinf-ce/role-management/lib/role-rules";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

interface EditMembershipRoleProps {
  currentUserRole: TOrganizationRole;
  memberRole: TOrganizationRole;
  /** userId of an accepted/pending membership; empty string for invites. */
  memberId: string;
  organizationId: string;
  /** The signed-in user. */
  userId: string;
  memberAccepted?: boolean;
  /** Invite id; empty string for memberships. */
  inviteId: string;
  doesOrgHaveMoreThanOneOwner: boolean;
  isFormbricksCloud: boolean;
  isUserManagementDisabledFromUi: boolean;
}

/**
 * FSINF CE: organization role of one member or invite in the members list. Interactive only when the
 * signed-in user may change it (`role-rules.ts`); otherwise it just shows the role. The server actions
 * re-check every rule.
 */
export const EditMembershipRole = ({
  currentUserRole,
  memberRole,
  memberId,
  organizationId,
  userId,
  inviteId,
  doesOrgHaveMoreThanOneOwner,
  isFormbricksCloud,
  isUserManagementDisabledFromUi,
}: Readonly<EditMembershipRoleProps>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);

  const isInvite = !!inviteId;
  const ruleInput = {
    actorRole: currentUserRole,
    isSelf: !isInvite && memberId === userId,
    targetRole: memberRole,
    // Invites are not owners yet; for members the list tells us whether another owner exists.
    ownerCount: isInvite || doesOrgHaveMoreThanOneOwner ? 2 : 1,
    isFormbricksCloud,
  };

  const isEditable = !isUserManagementDisabledFromUi && canEditRoleOf(ruleInput);

  if (!isEditable) {
    return <p className="truncate text-sm text-slate-700">{t(ORGANIZATION_ROLE_LABEL_KEYS[memberRole])}</p>;
  }

  const options = getAssignableOrganizationRoles(currentUserRole, isFormbricksCloud).filter(
    (role) => role === memberRole || validateRoleChange({ ...ruleInput, newRole: role }) === null
  );

  const handleChange = async (value: string) => {
    const role = value as TOrganizationRole;
    if (role === memberRole) return;
    setIsUpdating(true);
    try {
      const result = isInvite
        ? await updateInviteAction({ inviteId, organizationId, data: { role } })
        : await updateMembershipAction({ userId: memberId, organizationId, data: { role } });
      if (result?.data) {
        toast.success(t("workspace.settings.teams.role_updated_successfully"));
        router.refresh();
      } else {
        toast.error(
          result ? getFormattedErrorMessage(result) : t("common.something_went_wrong_please_try_again")
        );
      }
    } catch {
      toast.error(t("common.something_went_wrong_please_try_again"));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Select value={memberRole} onValueChange={handleChange} disabled={isUpdating}>
      <SelectTrigger aria-label={t("common.role")} className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(options.includes(memberRole) ? options : [memberRole, ...options]).map((role) => (
          <SelectItem key={role} value={role} disabled={role === memberRole && !options.includes(role)}>
            {t(ORGANIZATION_ROLE_LABEL_KEYS[role])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
