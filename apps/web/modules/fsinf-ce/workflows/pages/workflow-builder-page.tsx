"use client";

import { createId } from "@paralleldrive/cuid2";
import { GitBranchIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import { SendEmailStepForm } from "@/modules/fsinf-ce/workflows/components/builder/send-email-step-form";
import { TriggerForm } from "@/modules/fsinf-ce/workflows/components/builder/trigger-form";
import { ValidationPanel } from "@/modules/fsinf-ce/workflows/components/builder/validation-panel";
import { useWorkflowEditor } from "@/modules/fsinf-ce/workflows/components/workflow-editor-provider";
import {
  addSendEmailStep,
  createDefaultSendEmailConfig,
  getOrderedNodes,
  hasBranchNodes,
  moveNode,
  removeNode,
  updateSendEmailConfig,
} from "@/modules/fsinf-ce/workflows/lib/editor/definition";
import { describeWorkflowProblems } from "@/modules/fsinf-ce/workflows/lib/editor/problems";
import { WorkflowBuilderBodyLoading } from "@/modules/fsinf-ce/workflows/loading";
import type { TWorkflowEmailAuthoringContext } from "@/modules/fsinf-ce/workflows/types/email-authoring-context";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { Button } from "@/modules/ui/components/button";

/**
 * FSINF CE: the workflow builder. A structured editor rather than a canvas: the trigger card, then
 * the steps in run order (add / reorder / remove), plus a validation panel fed by the server-side
 * dry-run check. It supports everything the runner executes — the `response.completed` trigger and
 * `send_email` steps. `if_else` branch nodes are defined by the schema but not executable, so they
 * cannot be added here; one created through the API is shown with a remove action only.
 */
export const WorkflowBuilderPage = ({
  workspaceId,
  workflowId,
  isReadOnly,
  emailAuthoringContext,
}: Readonly<{
  workspaceId: string;
  workflowId: string;
  isReadOnly: boolean;
  emailAuthoringContext: TWorkflowEmailAuthoringContext;
}>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { workflow, workflowQuery, definition, updateDefinition, saveState, hasUnsavedChanges, testQuery } =
    useWorkflowEditor();

  // The recipient options and recall editor come from the server-resolved bound survey. When the
  // saved trigger points at another survey, refresh the server props once for that survey.
  const savedSurveyId = workflow?.definition.trigger?.config.surveyId ?? null;
  const refreshedForSurveyRef = useRef<string | null>(emailAuthoringContext.boundSurvey?.id ?? null);
  useEffect(() => {
    if (!savedSurveyId || hasUnsavedChanges || saveState === "saving") return;
    if (savedSurveyId === refreshedForSurveyRef.current) return;
    refreshedForSurveyRef.current = savedSurveyId;
    router.refresh();
  }, [savedSurveyId, hasUnsavedChanges, saveState, router]);

  const problems = useMemo(
    () =>
      testQuery.data && workflow
        ? describeWorkflowProblems(testQuery.data.problems, workflow.definition)
        : null,
    [testQuery.data, workflow]
  );

  if (workflowQuery.isPending) {
    return <WorkflowBuilderBodyLoading />;
  }

  if (workflowQuery.isError || !workflow || !definition) {
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {getV3ApiErrorMessage(workflowQuery.error, t("workspace.workflows.load_failed"))}
      </div>
    );
  }

  const isStatusEditable = workflow.status === "draft" || workflow.status === "disabled";
  const isEditable = !isReadOnly && isStatusEditable;
  const blockedReason = isReadOnly
    ? t("workspace.workflows.edit_blocked_read_only")
    : workflow.status === "enabled"
      ? t("workspace.workflows.edit_blocked_active")
      : workflow.status === "archived"
        ? t("workspace.workflows.edit_blocked_archived")
        : null;

  const nodes = getOrderedNodes(definition);
  const isBranched = hasBranchNodes(definition);
  const problemNodeIds = new Set((problems ?? []).map((problem) => problem.nodeId).filter(Boolean));

  return (
    <div className="mt-6 grid min-h-0 flex-1 gap-6 pb-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {blockedReason ? (
          <Alert variant="info">
            <AlertDescription>{blockedReason}</AlertDescription>
          </Alert>
        ) : null}

        {isBranched ? (
          <Alert variant="warning">
            <AlertDescription>{t("workspace.workflows.branch_nodes_notice")}</AlertDescription>
          </Alert>
        ) : null}

        <TriggerForm
          definition={definition}
          surveys={emailAuthoringContext.surveys}
          isEditable={isEditable}
          hasProblem={problemNodeIds.has("trigger")}
          onChange={updateDefinition}
        />

        {nodes.map((node, index) =>
          node.type === "action" ? (
            <SendEmailStepForm
              key={node.id}
              node={node}
              index={index}
              total={nodes.length}
              context={emailAuthoringContext}
              isEditable={isEditable}
              hasProblem={problemNodeIds.has(node.id)}
              onConfigChange={(patch) =>
                updateDefinition((current) => updateSendEmailConfig(current, node.id, patch))
              }
              onMove={(direction) => updateDefinition((current) => moveNode(current, node.id, direction))}
              onRemove={() => updateDefinition((current) => removeNode(current, node.id))}
            />
          ) : (
            <section
              key={node.id}
              id={`workflow-node-${node.id}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-white p-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-slate-100 p-2">
                  <GitBranchIcon className="size-4 text-slate-700" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {t("workspace.workflows.if_else")}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t("workspace.workflows.inspector_unsupported_node")}
                  </p>
                </div>
              </div>
              {isEditable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.remove")}
                  onClick={() => updateDefinition((current) => removeNode(current, node.id))}>
                  <TrashIcon />
                </Button>
              ) : null}
            </section>
          )
        )}

        {isEditable ? (
          <Button
            variant="secondary"
            onClick={() =>
              updateDefinition((current) =>
                addSendEmailStep(current, {
                  id: createId(),
                  config: createDefaultSendEmailConfig(emailAuthoringContext.mailFrom),
                })
              )
            }>
            <PlusIcon />
            {t("workspace.workflows.add_action")}: {t("workspace.workflows.send_email")}
          </Button>
        ) : null}
      </div>

      {workflow.status === "archived" ? null : (
        <div className="lg:sticky lg:top-4 lg:self-start">
          <ValidationPanel
            isChecking={testQuery.isFetching}
            problems={problems}
            checkError={
              testQuery.isError
                ? getV3ApiErrorMessage(testQuery.error, t("workspace.workflows.validation_failed"))
                : null
            }
          />
          <p className="mt-2 px-1 text-xs text-slate-500">
            <a className="underline" href={`/workspaces/${workspaceId}/workflows/${workflowId}/runs`}>
              {t("common.workflow_runs")}
            </a>
          </p>
        </div>
      )}
    </div>
  );
};
