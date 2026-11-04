"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { SecondaryNavigation } from "@/modules/ui/components/secondary-navigation";

/** FSINF CE: tabs of the workspace workflows area (workflow list / all runs). */
export const WorkspaceWorkflowsSecondaryNavigation = ({ workspaceId }: Readonly<{ workspaceId: string }>) => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const baseHref = `/workspaces/${workspaceId}/workflows`;

  return (
    <SecondaryNavigation
      ariaLabel={t("common.workflows")}
      activeId={pathname?.endsWith("/workflows/runs") ? "runs" : "workflows"}
      navigation={[
        { id: "workflows", label: t("common.workflows"), href: baseHref },
        { id: "runs", label: t("common.workflow_runs"), href: `${baseHref}/runs` },
      ]}
    />
  );
};
