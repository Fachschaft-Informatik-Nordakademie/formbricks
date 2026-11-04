"use client";

import { ArchiveIcon, ArchiveRestoreIcon, CopyIcon, MoreVerticalIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TWorkflowStatus } from "@formbricks/workflows";
import { useWorkflowActions } from "@/modules/fsinf-ce/workflows/hooks/use-workflow-actions";
import { Button } from "@/modules/ui/components/button";
import { ConfirmationModal } from "@/modules/ui/components/confirmation-modal";
import { DeleteDialog } from "@/modules/ui/components/delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/modules/ui/components/dropdown-menu";

/**
 * FSINF CE: per-workflow action menu (duplicate, archive/unarchive, delete) used by the list rows
 * and the workflow detail header. Callers hide it for read-only members.
 */
export const WorkflowActionsMenu = ({
  workspaceId,
  workflow,
  redirectAfterDelete = false,
}: Readonly<{
  workspaceId: string;
  workflow: { id: string; name: string; status: TWorkflowStatus };
  redirectAfterDelete?: boolean;
}>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { lifecycle, remove } = useWorkflowActions();
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isArchived = workflow.status === "archived";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("workspace.workflows.node_actions")}>
            <MoreVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            icon={<CopyIcon className="size-4" />}
            onClick={() =>
              lifecycle.mutate(
                { workflowId: workflow.id, action: "duplicate" },
                {
                  onSuccess: (duplicate) =>
                    router.push(`/workspaces/${workspaceId}/workflows/${duplicate.id}`),
                }
              )
            }>
            {t("common.duplicate")}
          </DropdownMenuItem>
          {isArchived ? (
            <DropdownMenuItem
              icon={<ArchiveRestoreIcon className="size-4" />}
              onClick={() => lifecycle.mutate({ workflowId: workflow.id, action: "unarchive" })}>
              {t("workspace.workflows.unarchive")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              icon={<ArchiveIcon className="size-4" />}
              onClick={() => setIsArchiveOpen(true)}>
              {t("workspace.workflows.archive_workflow")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem icon={<TrashIcon className="size-4" />} onClick={() => setIsDeleteOpen(true)}>
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationModal
        open={isArchiveOpen}
        setOpen={setIsArchiveOpen}
        title={t("workspace.workflows.archive_confirm_title")}
        body={t("workspace.workflows.archive_workflow_confirmation", { name: workflow.name })}
        description={t("workspace.workflows.archive_confirm_body")}
        buttonText={t("common.archive")}
        buttonLoading={lifecycle.isPending}
        onConfirm={() =>
          lifecycle.mutate(
            { workflowId: workflow.id, action: "archive" },
            { onSettled: () => setIsArchiveOpen(false) }
          )
        }
      />

      <DeleteDialog
        open={isDeleteOpen}
        setOpen={setIsDeleteOpen}
        deleteWhat={workflow.name}
        title={t("workspace.workflows.delete_workflow")}
        text={t("workspace.workflows.delete_workflow_confirmation", { name: workflow.name })}
        isDeleting={remove.isPending}
        onDelete={() =>
          remove.mutate(workflow.id, {
            onSuccess: () => {
              setIsDeleteOpen(false);
              if (redirectAfterDelete) {
                router.push(`/workspaces/${workspaceId}/workflows`);
              }
            },
          })
        }
      />
    </>
  );
};
