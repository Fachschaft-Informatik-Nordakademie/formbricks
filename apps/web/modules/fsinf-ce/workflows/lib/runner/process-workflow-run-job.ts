import "server-only";
import { prisma } from "@formbricks/database";
import type { JobExecutionContext, JobHandler, TWorkflowRunJobData } from "@formbricks/jobs";
import { logger } from "@formbricks/logger";
import {
  type TWorkflowExecutableStep,
  type TWorkflowTriggerRunPayload,
  WorkflowPlanError,
  ZWorkflowExecutableDefinition,
  planExecutableSteps,
} from "@formbricks/workflows";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { isDatabasePoolExhaustionError } from "@/lib/jobs/pool-exhaustion";
import { getOrganizationByWorkspaceId } from "@/lib/organization/service";
import { getResponse } from "@/lib/response/service";
import { getSurvey } from "@/lib/survey/service";
import { getIsWorkflowsEnabled } from "@/modules/fsinf-ce/features";
import { claimStep, finishStep, syncRunStepSummary } from "./run-log";
import { WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS, getRetryDelayMs, isTerminalWorkflowRunStatus } from "./run-policy";
import { buildSendEmailStepInput, executeSendEmailStep } from "./send-email-step";

/**
 * FSINF CE: worker handler of `workflow-run.process` — executes one workflow run.
 *
 * Lifecycle: queued → running → completed | failed | canceled.
 *  - The run executes the immutable `WorkflowVersion` it was created against, never the live draft.
 *  - Every step is claimed in `WorkflowRunLog` before it runs (see `run-log.ts`), so BullMQ retries
 *    and reconciler re-dispatches resume after the last finished step without re-sending.
 *  - A retryable step failure (SMTP transport) records `error` / `lastErrorAt` / `nextAttemptAt` and
 *    rethrows, so BullMQ retries with its exponential backoff. On the job's last attempt — or when the
 *    run's total attempt budget is used up — the run is failed instead.
 *  - A run of a workflow that was disabled/archived meanwhile, or of an organization that lost the
 *    feature, is canceled rather than executed.
 */

class RetryableRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableRunError";
  }
}

const finalizeRun = async (
  runId: string,
  status: "completed" | "failed" | "canceled",
  error?: string
): Promise<void> => {
  const now = new Date();
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: now,
      nextAttemptAt: null,
      error: error ?? null,
      ...(status === "failed" ? { lastErrorAt: now } : {}),
    },
  });
};

const canRetry = (context: JobExecutionContext, runAttempt: number): boolean =>
  context.attempt < context.maxAttempts && runAttempt < WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS;

const scheduleRetry = async (runId: string, runAttempt: number, error: string): Promise<void> => {
  const now = new Date();
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      error,
      lastErrorAt: now,
      nextAttemptAt: new Date(now.getTime() + getRetryDelayMs(runAttempt)),
    },
  });
};

const executeSteps = async ({
  runId,
  workspaceId,
  logoUrl,
  isDryRun,
  steps,
  trigger,
  context,
  runAttempt,
  logContext,
}: {
  runId: string;
  workspaceId: string;
  logoUrl?: string;
  isDryRun: boolean;
  steps: TWorkflowExecutableStep[];
  trigger: TWorkflowTriggerRunPayload;
  context: JobExecutionContext;
  runAttempt: number;
  logContext: Record<string, unknown>;
}): Promise<void> => {
  const [response, survey] = await Promise.all([
    getResponse(trigger.responseId),
    getSurvey(trigger.surveyId),
  ]);

  if (!response || !survey) {
    await finalizeRun(runId, "failed", "The triggering survey or response no longer exists.");
    return;
  }

  if (survey.workspaceId !== workspaceId || response.surveyId !== survey.id) {
    await finalizeRun(runId, "failed", "The triggering response does not belong to this workspace.");
    return;
  }

  for (const [sequence, step] of steps.entries()) {
    const claim = await claimStep({
      runId,
      sequence,
      stepId: step.stepId,
      stepType: step.stepType,
      input: buildSendEmailStepInput(step),
    });

    if (claim === "done") {
      continue;
    }

    if (claim === "in_doubt") {
      const error =
        "The step was interrupted while sending. It is not repeated, so the email is never sent twice.";
      await finishStep({ runId, stepId: step.stepId, status: "failed", error });
      await syncRunStepSummary({ runId, trigger });
      await finalizeRun(runId, "failed", error);
      return;
    }

    const outcome = await executeSendEmailStep({
      step,
      runId,
      workspaceId,
      isDryRun,
      survey,
      response,
      logoUrl,
      locale: DEFAULT_LOCALE,
    });

    if (outcome.status !== "failed") {
      await finishStep({ runId, stepId: step.stepId, status: outcome.status, output: outcome.output });
      await syncRunStepSummary({ runId, trigger });
      continue;
    }

    await finishStep({
      runId,
      stepId: step.stepId,
      status: "failed",
      output: outcome.output,
      error: outcome.error,
    });
    await syncRunStepSummary({ runId, trigger });

    if (outcome.retryable && canRetry(context, runAttempt)) {
      await scheduleRetry(runId, runAttempt, outcome.error);
      throw new RetryableRunError(outcome.error);
    }

    logger.warn({ ...logContext, stepId: step.stepId, error: outcome.error }, "Workflow run step failed");
    await finalizeRun(runId, "failed", outcome.error);
    return;
  }

  await finalizeRun(runId, "completed");
};

export const processWorkflowRunJob: JobHandler<TWorkflowRunJobData> = async (data, context) => {
  const logContext = {
    workflowRunId: data.workflowRunId,
    workflowId: data.workflowId,
    workspaceId: data.workspaceId,
    jobId: context.jobId,
    attempt: context.attempt,
  };

  const run = await prisma.workflowRun.findFirst({
    where: { id: data.workflowRunId, workflowId: data.workflowId, workspaceId: data.workspaceId },
    select: {
      id: true,
      status: true,
      attempt: true,
      isDryRun: true,
      triggerPayload: true,
      workflow: { select: { status: true } },
      workflowVersion: { select: { definition: true } },
    },
  });

  if (!run) {
    // Deleted together with its workflow or response; nothing left to do.
    logger.info(logContext, "Workflow run no longer exists; skipping");
    return;
  }

  if (isTerminalWorkflowRunStatus(run.status)) {
    return;
  }

  if (run.attempt >= WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS) {
    await finalizeRun(run.id, "failed", "The run exceeded its retry budget.");
    return;
  }

  const runAttempt = run.attempt + 1;
  const now = new Date();
  const claimed = await prisma.workflowRun.updateMany({
    where: { id: run.id, status: { in: ["queued", "running"] }, attempt: run.attempt },
    data: { status: "running", attempt: runAttempt, nextAttemptAt: null },
  });
  if (claimed.count !== 1) {
    // Another worker advanced the run between the read and the claim.
    return;
  }
  await prisma.workflowRun.updateMany({
    where: { id: run.id, startedAt: null },
    data: { startedAt: now },
  });

  try {
    const organization = await getOrganizationByWorkspaceId(data.workspaceId);
    if (!organization || !(await getIsWorkflowsEnabled(organization.id))) {
      await finalizeRun(run.id, "canceled", "Workflows are not enabled for this organization.");
      return;
    }

    if (run.workflow.status !== "enabled" && !run.isDryRun) {
      await finalizeRun(run.id, "canceled", "The workflow was disabled before this run executed.");
      return;
    }

    const parsedDefinition = ZWorkflowExecutableDefinition.safeParse(run.workflowVersion?.definition);
    if (!parsedDefinition.success) {
      await finalizeRun(run.id, "failed", "The published workflow version is not executable.");
      return;
    }

    let steps: TWorkflowExecutableStep[];
    try {
      steps = planExecutableSteps(parsedDefinition.data);
    } catch (error) {
      if (error instanceof WorkflowPlanError) {
        await finalizeRun(run.id, "failed", error.message);
        return;
      }
      throw error;
    }

    await executeSteps({
      runId: run.id,
      workspaceId: data.workspaceId,
      logoUrl: organization.whitelabel?.logoUrl ?? undefined,
      isDryRun: run.isDryRun,
      steps,
      trigger: run.triggerPayload,
      context,
      runAttempt,
      logContext,
    });
  } catch (error) {
    if (error instanceof RetryableRunError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unexpected workflow runner error";

    // Infrastructure trouble (DB pool, Redis, …): let BullMQ retry while attempts remain. Steps that
    // already ran are claimed, so the retry resumes instead of repeating them.
    if (canRetry(context, runAttempt) || isDatabasePoolExhaustionError(error)) {
      logger.warn({ ...logContext, err: error }, "Workflow run failed unexpectedly; will be retried");
      try {
        await scheduleRetry(run.id, runAttempt, message);
      } catch (recordError) {
        logger.error({ ...logContext, err: recordError }, "Could not record workflow run retry");
      }
      throw error;
    }

    logger.error({ ...logContext, err: error }, "Workflow run failed");
    await finalizeRun(run.id, "failed", message);
  }
};
