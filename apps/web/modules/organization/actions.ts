"use server";

import { z } from "zod";
import { OperationNotAllowedError } from "@formbricks/types/errors";
import { TUserNotificationSettings } from "@formbricks/types/user";
import { createMembership } from "@/lib/membership/service";
import { createOrganization } from "@/lib/organization/service";
import { capturePostHogEvent, getEmailDomain, groupIdentifyPostHog } from "@/lib/posthog";
import { updateUser } from "@/lib/user/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { DEFAULT_WORKSPACE_NAME } from "@/lib/workspace/constants";
import { withAuditLogging } from "@/modules/fsinf-ce/audit-logs/lib/handler";
import { getIsMultiOrgEnabled } from "@/modules/fsinf-ce/features";
import { createWorkspace } from "@/modules/workspaces/settings/lib/workspace";

const ZCreateOrganizationAction = z.object({
  organizationName: z.string().min(1, "Organization name must be at least 1 character long"),
});

export const createOrganizationAction = authenticatedActionClient
  .inputSchema(ZCreateOrganizationAction)
  .action(
    withAuditLogging("created", "organization", async ({ ctx, parsedInput }) => {
      const isMultiOrgEnabled = await getIsMultiOrgEnabled();
      if (!isMultiOrgEnabled)
        throw new OperationNotAllowedError(
          "Creating Multiple organization is restricted on your instance of Formbricks"
        );

      const newOrganization = await createOrganization({
        name: parsedInput.organizationName,
      });

      await createMembership(newOrganization.id, ctx.user.id, {
        role: "owner",
        accepted: true,
      });

      const newWorkspace = await createWorkspace(newOrganization.id, {
        name: DEFAULT_WORKSPACE_NAME,
      });

      groupIdentifyPostHog("organization", newOrganization.id, {
        name: newOrganization.name,
        email_domain: getEmailDomain(ctx.user.email),
      });
      groupIdentifyPostHog("workspace", newWorkspace.id, { name: newWorkspace.name });

      capturePostHogEvent(
        ctx.user.id,
        "organization_created",
        {
          organization_id: newOrganization.id,
          is_first_org: false,
        },
        { organizationId: newOrganization.id, workspaceId: newWorkspace.id }
      );

      capturePostHogEvent(
        ctx.user.id,
        "workspace_created",
        {
          organization_id: newOrganization.id,
          workspace_id: newWorkspace.id,
          name: newWorkspace.name,
        },
        { organizationId: newOrganization.id, workspaceId: newWorkspace.id }
      );

      const updatedNotificationSettings: TUserNotificationSettings = {
        ...ctx.user.notificationSettings,
        alert: {
          ...ctx.user.notificationSettings?.alert,
        },

        unsubscribedOrganizationIds: Array.from(
          new Set([...(ctx.user.notificationSettings?.unsubscribedOrganizationIds || []), newOrganization.id]) // NOSONAR // We want to check for empty strings too
        ),
      };

      await updateUser(ctx.user.id, {
        notificationSettings: updatedNotificationSettings,
      });

      ctx.auditLoggingCtx.organizationId = newOrganization.id;
      ctx.auditLoggingCtx.newObject = newOrganization;

      return newOrganization;
    })
  );
