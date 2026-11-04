"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { SecondaryNavigation } from "@/modules/ui/components/secondary-navigation";

/**
 * FSINF CE: tabs of one workflow (builder / runs). Static links only, so it also renders on the
 * upgrade-prompt branch of the detail layout where no workflow data is loaded.
 */
export const WorkflowSecondaryNavigation = ({
  workspaceId,
  workflowId,
}: Readonly<{ workspaceId: string; workflowId: string }>) => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const baseHref = `/workspaces/${workspaceId}/workflows/${workflowId}`;

  return (
    <SecondaryNavigation
      ariaLabel={t("common.workflows")}
      activeId={pathname?.endsWith("/runs") ? "runs" : "builder"}
      navigation={[
        { id: "builder", label: t("workspace.workflows.tab_builder"), href: baseHref },
        { id: "runs", label: t("common.runs"), href: `${baseHref}/runs` },
      ]}
    />
  );
};
