"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import { WorkflowStatusBadge } from "@/modules/fsinf-ce/workflows/components/status-badges";
import { useWorkflowEditor } from "@/modules/fsinf-ce/workflows/components/workflow-editor-provider";
import { patchWorkflow } from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";
import { Input } from "@/modules/ui/components/input";
import { Skeleton } from "@/modules/ui/components/skeleton";

/**
 * FSINF CE: title of the workflow detail pages — the workflow name (renamable inline unless
 * read-only or archived) plus its status badge.
 */
export const WorkflowPageTitle = ({
  workflowId,
  isReadOnly,
}: Readonly<{ workflowId: string; isReadOnly: boolean }>) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { workflow } = useWorkflowEditor();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");

  const renameMutation = useMutation({
    mutationFn: (nextName: string) => patchWorkflow(workflowId, { name: nextName }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(workflowKeys.detail(workflowId), updated);
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
    onError: (error) => {
      toast.error(getV3ApiErrorMessage(error, t("workspace.workflows.save_failed")));
    },
  });

  if (!workflow) {
    return <Skeleton className="h-9 w-64" />;
  }

  const canRename = !isReadOnly && workflow.status !== "archived";

  const onSubmit = (event: Pick<FormEvent, "preventDefault">) => {
    event.preventDefault();
    if (renameMutation.isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("workspace.workflows.name_required"));
      return;
    }
    if (trimmed.length > 120) {
      toast.error(t("workspace.workflows.name_invalid"));
      return;
    }
    if (trimmed === workflow.name) {
      setIsEditing(false);
      return;
    }
    renameMutation.mutate(trimmed);
  };

  return (
    <span className="flex items-center gap-3">
      {isEditing ? (
        <form onSubmit={onSubmit}>
          <Input
            aria-label={t("common.workflow_name")}
            className="h-10 w-80 text-xl font-bold"
            value={name}
            maxLength={120}
            autoFocus
            disabled={renameMutation.isPending}
            onChange={(event) => setName(event.target.value)}
            onBlur={(event) => onSubmit(event)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsEditing(false);
            }}
          />
        </form>
      ) : (
        <span className="flex items-center gap-2">
          <span className="truncate">{workflow.name}</span>
          {canRename ? (
            <button
              type="button"
              className="rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label={t("common.edit")}
              onClick={() => {
                setName(workflow.name);
                setIsEditing(true);
              }}>
              <PencilIcon className="size-4" />
            </button>
          ) : null}
        </span>
      )}
      <WorkflowStatusBadge status={workflow.status} />
    </span>
  );
};
