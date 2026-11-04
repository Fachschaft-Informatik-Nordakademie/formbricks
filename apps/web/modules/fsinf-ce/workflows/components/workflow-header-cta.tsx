"use client";

import { AlertCircleIcon, CheckIcon, LoaderIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { WorkflowActionsMenu } from "@/modules/fsinf-ce/workflows/components/workflow-actions-menu";
import { useWorkflowEditor } from "@/modules/fsinf-ce/workflows/components/workflow-editor-provider";
import { useWorkflowActions } from "@/modules/fsinf-ce/workflows/hooks/use-workflow-actions";
import { Button } from "@/modules/ui/components/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/modules/ui/components/tooltip";

/**
 * FSINF CE: header actions of a workflow — autosave status, enable/disable and the action menu.
 * Enabling first flushes pending edits, so what gets published is exactly what the author sees.
 */
const SaveStatus = () => {
  const { t } = useTranslation();
  const { saveState, saveError, hasUnsavedChanges } = useWorkflowEditor();

  if (saveState === "failed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircleIcon className="size-4" />
              {t("workspace.workflows.autosave_failed")}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {saveError
              ? t("workspace.workflows.autosave_failed_tooltip_rejected", { detail: saveError })
              : t("workspace.workflows.autosave_failed_tooltip")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (saveState === "saving" || hasUnsavedChanges) {
    return (
      <span className="flex items-center gap-1 text-sm text-slate-500">
        <LoaderIcon className="size-4 animate-spin" />
        {t("workspace.workflows.saving_changes")}
      </span>
    );
  }

  if (saveState === "saved") {
    return (
      <span className="flex items-center gap-1 text-sm text-slate-500">
        <CheckIcon className="size-4" />
        {t("workspace.workflows.all_changes_saved")}
      </span>
    );
  }

  return null;
};

export const WorkflowHeaderCta = ({
  workflowId,
  isReadOnly,
}: Readonly<{ workflowId: string; isReadOnly: boolean }>) => {
  const { t } = useTranslation();
  const params = useParams<{ workspaceId: string }>();
  const { workflow, flush } = useWorkflowEditor();
  const { lifecycle } = useWorkflowActions();

  if (!workflow || isReadOnly) {
    return null;
  }

  const enable = async () => {
    const saved = await flush();
    if (!saved) {
      toast.error(t("workspace.workflows.enable_blocked_unsaved_changes"));
      return;
    }
    lifecycle.mutate({ workflowId, action: "enable" });
  };

  return (
    <div className="flex items-center gap-3">
      <SaveStatus />
      {workflow.status === "draft" || workflow.status === "disabled" ? (
        <Button size="sm" onClick={enable} loading={lifecycle.isPending}>
          <PlayIcon />
          {t("common.enable")}
        </Button>
      ) : null}
      {workflow.status === "enabled" ? (
        <Button
          size="sm"
          variant="secondary"
          loading={lifecycle.isPending}
          onClick={() => lifecycle.mutate({ workflowId, action: "disable" })}>
          <PauseIcon />
          {t("common.disable")}
        </Button>
      ) : null}
      <WorkflowActionsMenu workspaceId={params.workspaceId} workflow={workflow} redirectAfterDelete />
    </div>
  );
};
