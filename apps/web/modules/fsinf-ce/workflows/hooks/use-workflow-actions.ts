"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TWorkflowResource } from "@formbricks/workflows";
import { V3ApiError, getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import {
  type TWorkflowLifecycleAction,
  deleteWorkflow,
  runWorkflowLifecycleAction,
} from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";

/**
 * FSINF CE: lifecycle mutations of a workflow (enable, disable, archive, unarchive, duplicate,
 * delete) with their toasts and cache updates. Shared by the list row menu and the detail header.
 */

const MESSAGES: Record<TWorkflowLifecycleAction, { success: string; failure: string }> = {
  enable: { success: "workspace.workflows.enable_success", failure: "workspace.workflows.enable_failed" },
  disable: { success: "workspace.workflows.disable_success", failure: "workspace.workflows.disable_failed" },
  archive: { success: "workspace.workflows.archive_success", failure: "workspace.workflows.archive_failed" },
  unarchive: {
    success: "workspace.workflows.unarchive_success",
    failure: "workspace.workflows.unarchive_failed",
  },
  duplicate: {
    success: "workspace.workflows.duplicate_success",
    failure: "workspace.workflows.duplicate_failed",
  },
};

/** The API's own explanation (incl. per-field reasons) so a refused enable says why. */
const describeError = (error: unknown, fallback: string): string => {
  if (error instanceof V3ApiError && error.invalid_params?.length) {
    return `${fallback} ${error.invalid_params.map((param) => param.reason).join(" ")}`;
  }
  const detail = getV3ApiErrorMessage(error, "");
  return detail ? `${fallback} ${detail}` : fallback;
};

export const useWorkflowActions = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const lifecycle = useMutation({
    mutationFn: ({ workflowId, action }: { workflowId: string; action: TWorkflowLifecycleAction }) =>
      runWorkflowLifecycleAction(workflowId, action),
    onSuccess: async (workflow: TWorkflowResource, { action }) => {
      queryClient.setQueryData(workflowKeys.detail(workflow.id), workflow);
      toast.success(t(MESSAGES[action].success));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workflowKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: workflowKeys.test(workflow.id) }),
      ]);
    },
    onError: (error, { action }) => {
      toast.error(describeError(error, t(MESSAGES[action].failure)));
    },
  });

  const remove = useMutation({
    mutationFn: (workflowId: string) => deleteWorkflow(workflowId),
    onSuccess: async (_result, workflowId) => {
      queryClient.removeQueries({ queryKey: workflowKeys.detail(workflowId) });
      toast.success(t("workspace.workflows.delete_success"));
      await queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
    onError: (error) => {
      toast.error(describeError(error, t("workspace.workflows.delete_failed")));
    },
  });

  return { lifecycle, remove };
};
