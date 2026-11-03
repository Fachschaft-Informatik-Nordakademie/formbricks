"use client";

import type { Control, FieldValues, Path } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TOrganizationRole } from "@formbricks/types/memberships";
import {
  ORGANIZATION_ROLE_DESCRIPTION_KEYS,
  ORGANIZATION_ROLE_LABEL_KEYS,
} from "@/modules/fsinf-ce/role-management/lib/labels";
import { getAssignableOrganizationRoles } from "@/modules/fsinf-ce/role-management/lib/role-rules";
import { FormField, FormItem, FormLabel } from "@/modules/ui/components/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

interface AddMemberRoleProps<T extends FieldValues & { role: TOrganizationRole }> {
  control: Control<T>;
  isAccessControlAllowed: boolean;
  isFormbricksCloud: boolean;
  membershipRole?: TOrganizationRole;
}

/**
 * FSINF CE: organization role picker in the invite dialog. Offers only the roles the inviting user may
 * assign (see `role-rules.ts`); `inviteUserAction` enforces the same limits server-side.
 */
export const AddMemberRole = <T extends FieldValues & { role: TOrganizationRole }>({
  control,
  isAccessControlAllowed,
  isFormbricksCloud,
  membershipRole,
}: Readonly<AddMemberRoleProps<T>>) => {
  const { t } = useTranslation();
  const assignableRoles = getAssignableOrganizationRoles(membershipRole, isFormbricksCloud);

  return (
    <FormField
      control={control}
      name={"role" as Path<T>}
      render={({ field }) => {
        const value = field.value as TOrganizationRole;
        // Keep the current value selectable even if it is not assignable, so the select never shows blank.
        const options = assignableRoles.includes(value) ? assignableRoles : [value, ...assignableRoles];
        return (
          <FormItem className="flex flex-col gap-y-2">
            <FormLabel htmlFor="memberRoleSelect">
              {t("workspace.settings.teams.organization_role")}
            </FormLabel>
            <Select
              value={value}
              onValueChange={(role) => field.onChange(role)}
              disabled={!isAccessControlAllowed || assignableRoles.length <= 1}>
              <SelectTrigger id="memberRoleSelect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(ORGANIZATION_ROLE_LABEL_KEYS[role])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{t(ORGANIZATION_ROLE_DESCRIPTION_KEYS[value])}</p>
          </FormItem>
        );
      }}
    />
  );
};
