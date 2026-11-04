"use client";

import { useTranslation } from "react-i18next";
import type { TWorkflowRunLogStatus, TWorkflowRunStatus, TWorkflowStatus } from "@formbricks/workflows";
import { Badge } from "@/modules/ui/components/badge";

/** FSINF CE: status badges of workflows, runs and run steps. */

type TBadgeType = "warning" | "success" | "error" | "gray" | "info";

const WORKFLOW_STATUS_BADGE: Record<TWorkflowStatus, { key: string; type: TBadgeType }> = {
  draft: { key: "common.draft", type: "gray" },
  enabled: { key: "common.enabled", type: "success" },
  disabled: { key: "common.disabled", type: "warning" },
  archived: { key: "common.archived", type: "gray" },
};

const RUN_STATUS_BADGE: Record<TWorkflowRunStatus, { key: string; type: TBadgeType }> = {
  queued: { key: "common.queued", type: "info" },
  running: { key: "common.running", type: "warning" },
  completed: { key: "common.completed", type: "success" },
  failed: { key: "common.failed", type: "error" },
  canceled: { key: "common.canceled", type: "gray" },
};

const STEP_STATUS_BADGE: Record<TWorkflowRunLogStatus, { key: string; type: TBadgeType }> = {
  pending: { key: "common.pending", type: "info" },
  running: { key: "common.running", type: "warning" },
  succeeded: { key: "workspace.workflows.step_succeeded", type: "success" },
  failed: { key: "common.failed", type: "error" },
  skipped: { key: "common.skipped", type: "gray" },
};

export const WorkflowStatusBadge = ({ status }: Readonly<{ status: TWorkflowStatus }>) => {
  const { t } = useTranslation();
  const badge = WORKFLOW_STATUS_BADGE[status];
  return <Badge text={t(badge.key)} type={badge.type} size="tiny" />;
};

export const WorkflowRunStatusBadge = ({ status }: Readonly<{ status: TWorkflowRunStatus }>) => {
  const { t } = useTranslation();
  const badge = RUN_STATUS_BADGE[status];
  return <Badge text={t(badge.key)} type={badge.type} size="tiny" />;
};

export const WorkflowStepStatusBadge = ({ status }: Readonly<{ status: TWorkflowRunLogStatus }>) => {
  const { t } = useTranslation();
  const badge = STEP_STATUS_BADGE[status];
  return <Badge text={t(badge.key)} type={badge.type} size="tiny" />;
};
