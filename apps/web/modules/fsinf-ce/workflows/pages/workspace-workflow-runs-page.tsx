"use client";

import { WorkflowRunsView } from "@/modules/fsinf-ce/workflows/components/workflow-runs-view";

/** FSINF CE: run history across every workflow of a workspace. */
export const WorkspaceWorkflowRunsPage = ({ workspaceId }: Readonly<{ workspaceId: string }>) => (
  <WorkflowRunsView workspaceId={workspaceId} />
);
