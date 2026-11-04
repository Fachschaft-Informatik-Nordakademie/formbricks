"use client";

import { WorkflowRunsView } from "@/modules/fsinf-ce/workflows/components/workflow-runs-view";

/** FSINF CE: run history of one workflow. */
export const WorkflowRunsPage = ({
  workspaceId,
  workflowId,
}: Readonly<{ workspaceId: string; workflowId: string }>) => (
  <WorkflowRunsView workspaceId={workspaceId} workflowId={workflowId} />
);
