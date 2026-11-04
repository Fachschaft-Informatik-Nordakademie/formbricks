"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import { createWorkflow } from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";
import { createEmptyDefinition } from "@/modules/fsinf-ce/workflows/lib/editor/definition";
import { Button } from "@/modules/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";

/**
 * FSINF CE: "New workflow" action of the workspace workflows header. Creates an empty draft through
 * `POST /api/v3/workflows` and opens it in the builder. Hidden for read-only members.
 */
export const WorkspaceWorkflowsHeaderCta = ({
  workspaceId,
  isReadOnly,
}: Readonly<{ workspaceId: string; isReadOnly: boolean }>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (workflowName: string) =>
      createWorkflow({ workspaceId, name: workflowName, definition: createEmptyDefinition() }),
    onSuccess: async (workflow) => {
      queryClient.setQueryData(workflowKeys.detail(workflow.id), workflow);
      await queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      setOpen(false);
      router.push(`/workspaces/${workspaceId}/workflows/${workflow.id}`);
    },
    onError: (error) => {
      toast.error(getV3ApiErrorMessage(error, t("workspace.workflows.create_failed")));
    },
  });

  if (isReadOnly) {
    return null;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("workspace.workflows.name_required"));
      return;
    }
    if (trimmed.length > 120) {
      setNameError(t("workspace.workflows.name_invalid"));
      return;
    }
    setNameError(null);
    createMutation.mutate(trimmed);
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setName("");
          setNameError(null);
          setOpen(true);
        }}>
        <PlusIcon />
        {t("common.new_workflow")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.new_workflow")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit}>
            <DialogBody className="space-y-2">
              <Label htmlFor="workflow-name">{t("common.workflow_name")}</Label>
              <Input
                id="workflow-name"
                value={name}
                autoFocus
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                isInvalid={!!nameError}
              />
              {nameError ? <p className="text-sm text-red-500">{nameError}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
