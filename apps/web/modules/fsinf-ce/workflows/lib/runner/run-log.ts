import "server-only";
import { prisma } from "@formbricks/database";
import type {
  TWorkflowRunLogInput,
  TWorkflowRunLogOutput,
  TWorkflowStepResult,
  TWorkflowTriggerRunPayload,
} from "@formbricks/workflows";
import { isUniqueConstraintError } from "@/lib/utils/prisma-error";

/**
 * FSINF CE: per-step persistence of the workflow runner (`WorkflowRunLog`).
 *
 * Steps are claimed BEFORE their side effect runs. `@@unique([runId, stepId])` makes the claim
 * atomic, so a retried or duplicated job can never execute a step twice:
 *  - no row yet            → claimed, execute;
 *  - succeeded / skipped   → done earlier, skip;
 *  - failed (retryable)    → re-claimed by flipping it back to running, execute again;
 *  - running / pending     → an earlier attempt died mid-step; whether the email left is unknown,
 *                            so the step is NOT repeated (at-most-once delivery).
 */
export type TStepClaim = "claimed" | "done" | "in_doubt";

export const claimStep = async ({
  runId,
  sequence,
  stepId,
  stepType,
  input,
}: {
  runId: string;
  sequence: number;
  stepId: string;
  stepType: string;
  input: TWorkflowRunLogInput;
}): Promise<TStepClaim> => {
  const startedAt = new Date();

  try {
    await prisma.workflowRunLog.create({
      data: { runId, sequence, stepId, stepType, status: "running", input, startedAt },
    });
    return "claimed";
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const existing = await prisma.workflowRunLog.findUnique({
    where: { runId_stepId: { runId, stepId } },
    select: { id: true, status: true },
  });

  if (!existing) {
    return "in_doubt";
  }

  if (existing.status === "succeeded" || existing.status === "skipped") {
    return "done";
  }

  if (existing.status === "failed") {
    const reclaimed = await prisma.workflowRunLog.updateMany({
      where: { id: existing.id, status: "failed" },
      data: { status: "running", error: null, startedAt, finishedAt: null, input },
    });
    return reclaimed.count === 1 ? "claimed" : "in_doubt";
  }

  return "in_doubt";
};

export const finishStep = async ({
  runId,
  stepId,
  status,
  output,
  error,
}: {
  runId: string;
  stepId: string;
  status: "succeeded" | "failed" | "skipped";
  output?: TWorkflowRunLogOutput;
  error?: string;
}): Promise<void> => {
  await prisma.workflowRunLog.update({
    where: { runId_stepId: { runId, stepId } },
    data: {
      status,
      output: output ?? {},
      error: error ?? null,
      finishedAt: new Date(),
    },
  });
};

/**
 * Mirrors the step logs into `WorkflowRun.data.steps` (the run's own summary) and, as a side effect
 * of the update, bumps `updatedAt` — the liveness signal the reconciler reads.
 */
export const syncRunStepSummary = async ({
  runId,
  trigger,
}: {
  runId: string;
  trigger: TWorkflowTriggerRunPayload;
}): Promise<void> => {
  const logs = await prisma.workflowRunLog.findMany({
    where: { runId },
    orderBy: { sequence: "asc" },
  });

  const steps: TWorkflowStepResult[] = logs.map((log) => ({
    stepId: log.stepId,
    stepType: log.stepType,
    status: log.status,
    input: log.input,
    output: log.output,
    ...(log.error ? { error: log.error } : {}),
    ...(log.startedAt ? { startedAt: log.startedAt.toISOString() } : {}),
    ...(log.finishedAt ? { finishedAt: log.finishedAt.toISOString() } : {}),
  }));

  await prisma.workflowRun.update({
    where: { id: runId },
    data: { data: { trigger, steps } },
  });
};
