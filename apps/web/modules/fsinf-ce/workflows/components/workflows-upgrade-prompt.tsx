"use client";

import { useTranslation } from "react-i18next";
import { getOrganizationBillingPath } from "@/modules/settings/lib/routes";
import { UpgradePrompt } from "@/modules/ui/components/upgrade-prompt";

/**
 * FSINF CE: shown instead of the workflows pages when the organization does not have the feature.
 * In this build the feature flag is on for every organization, so this only appears if an operator
 * turns workflows off; it points to the organization settings instead of a sales page.
 */
export const WorkflowsUpgradePrompt = ({ organizationId }: Readonly<{ organizationId: string }>) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center p-6">
      <UpgradePrompt
        title={t("workspace.workflows.upgrade_prompt_title")}
        description={t("workspace.workflows.upgrade_prompt_description")}
        feature="workflows"
        buttons={[
          { text: t("common.settings"), href: getOrganizationBillingPath(organizationId, false) },
          { text: t("common.learn_more"), href: "https://formbricks.com/docs/workflows/overview" },
        ]}
      />
    </div>
  );
};
