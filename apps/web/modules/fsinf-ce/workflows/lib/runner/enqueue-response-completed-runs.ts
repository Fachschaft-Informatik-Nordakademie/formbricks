import "server-only";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { WORKFLOW_TRIGGERS, ZWorkflowExecutableDefinition } from "@formbricks/workflows";
import { isUniqueConstraintError } from "@/lib/utils/prisma-error";
import { getIsWorkflowsEnabled } from "@/modules/fsinf-ce/features";
import type { TWorkflowRunDispatcher } from "./dispatch";
import { buildResponseCompletedIdempotencyKey } from "./run-policy";
import {
  type TCompletedResponseRef,
  buildResponseCompletedTriggerPayload,
  matchesResponseCompletedTrigger,
} from "./trigger-matching";

/**
 * FSINF CE: producer side of the workflow runner, called by the response pipeline for every
 * `responseFinished` event.
 *
 * For each enabled workflow of the workspace whose published version is triggered by this response,
 * one `WorkflowRun` is created (idempotent through `@@unique([workflowId, idempotencyKey])`, so a
 * retried pipeline job never doubles a run) and dispatched to the queue. A failed dispatch is only
 * logged: the run stays `queued` without `dispatchedAt` and the reconciler dispatches it later, so the
 * trigger is never lost.
 */
export interface TEnqueueResponseCompletedWorkflowRunsArgs {
  response: TCompletedResponseRef;
  workspaceId: string;
  organizationId: string;
  /** Part of the pipeline contract; this build has no usage metering, so it is not read. */
  stripeCustomerId?: string | null;
  dispatch: TWorkflowRunDispatcher;
  logContext?: Record<string, unknown>;
}

export const enqueueResponseCompletedWorkflowRuns = async (
  args: TEnqueueResponseCompletedWorkflowRunsArgs
): Promise<void> => {
  const { response, workspaceId, organizationId, dispatch } = args;
  const logContext = { ...args.logContext, workspaceId, responseId: response.id };

  if (!response.finished) {
    return;
  }

  if (!(await getIsWorkflowsEnabled(organizationId))) {
    return;
  }

  // Narrow in the database by the trigger's survey; the published version is re-checked below.
  const workflows = await prisma.workflow.findMany({
    where: {
      workspaceId,
      status: "enabled",
      definition: { path: ["trigger", "config", "surveyId"], equals: response.surveyId },
    },
    select: {
      id: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, definition: true },
      },
    },
  });

  const triggeredAt = new Date();

  for (const workflow of workflows) {
    const version = workflow.versions[0];
    if (!version) {
      logger.warn({ ...logContext, workflowId: workflow.id }, "Enabled workflow has no published version");
      continue;
    }

    const parsedDefinition = ZWorkflowExecutableDefinition.safeParse(version.definition);
    if (!parsedDefinition.success) {
      logger.error(
        { ...logContext, workflowId: workflow.id, workflowVersionId: version.id },
        "Published workflow version is not executable; skipping"
      );
      continue;
    }

    if (!matchesResponseCompletedTrigger(parsedDefinition.data, response)) {
      continue;
    }

    const triggerPayload = buildResponseCompletedTriggerPayload({ workspaceId, response, triggeredAt });

    let runId: string;
    try {
      const run = await prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          workspaceId,
          workflowVersionId: version.id,
          responseId: response.id,
          surveyId: response.surveyId,
          status: "queued",
          triggerType: WORKFLOW_TRIGGERS.RESPONSE_COMPLETED,
          idempotencyKey: buildResponseCompletedIdempotencyKey(response.id),
          triggerPayload,
          data: { trigger: triggerPayload, steps: [] },
        },
        select: { id: true },
      });
      runId = run.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Already created by an earlier attempt of this pipeline job; the reconciler owns it now.
        continue;
      }
      throw error;
    }

    try {
      await dispatch({ workflowRunId: runId, workflowId: workflow.id, workspaceId });
    } catch (error) {
      logger.error(
        { ...logContext, err: error, workflowId: workflow.id, workflowRunId: runId },
        "Workflow run dispatch failed; the reconciler will dispatch it"
      );
    }
  }
};
