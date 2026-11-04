/**
 * FSINF CE: pure retry / idempotency / stuck-run policy of the workflow runner. No I/O, so it is
 * unit-tested in isolation and shared by the producer, the run job and the reconciler.
 */
import { WORKFLOW_TRIGGERS } from "@formbricks/workflows";
import { WORKFLOW_RUN_STALE_AFTER_MS, WORKFLOW_RUN_UNDISPATCHED_GRACE_MS } from "./reconcile-constants";

/**
 * Hard cap on how often one run is executed in total, across BullMQ retries of one job and the
 * reconciler's re-dispatches. Without it a run whose job keeps getting lost would be re-dispatched
 * forever.
 */
export const WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS = 6;

/** Mirrors the queue's default exponential backoff (5s base) so `nextAttemptAt` is an honest estimate. */
export const WORKFLOW_RUN_RETRY_BASE_DELAY_MS = 5_000;

export const TERMINAL_WORKFLOW_RUN_STATUSES = ["completed", "failed", "canceled"] as const;

export const isTerminalWorkflowRunStatus = (status: string): boolean =>
  (TERMINAL_WORKFLOW_RUN_STATUSES as readonly string[]).includes(status);

/** Delay BullMQ applies before attempt `attempt + 1`, for an attempt counted from 1. */
export const getRetryDelayMs = (attempt: number): number =>
  WORKFLOW_RUN_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);

/**
 * One run per (workflow, completed response): the response pipeline job can be retried, and each
 * retry must not create a second run. Backed by `@@unique([workflowId, idempotencyKey])`.
 */
export const buildResponseCompletedIdempotencyKey = (responseId: string): string =>
  `${WORKFLOW_TRIGGERS.RESPONSE_COMPLETED}:${responseId}`;

/**
 * BullMQ job id for a reconciler re-dispatch. The first dispatch uses the run id; it can still sit in
 * the completed/failed set (where an `add` with the same id is silently ignored), so a re-dispatch
 * needs a different id. Keying it on the attempt counter keeps repeated sweeps idempotent: until the
 * re-dispatched job actually runs (and bumps `attempt`), every sweep produces the same id.
 * BullMQ forbids `:` in custom ids, hence the dashes.
 */
export const buildReconcileJobId = (runId: string, attempt: number): string =>
  `${runId}-reconcile-${attempt}`;

export interface TReconcileCandidate {
  status: string;
  attempt: number;
  createdAt: Date;
  updatedAt: Date;
  dispatchedAt: Date | null;
  nextAttemptAt: Date | null;
}

export type TReconcileDecision = "none" | "dispatch" | "redispatch" | "fail";

/**
 * What the reconciler does with a run:
 *  - `dispatch`: queued and never handed to the queue, past the grace period;
 *  - `redispatch`: dispatched or running but untouched for too long (its job was lost);
 *  - `fail`: would need a re-dispatch but has used up its attempt budget;
 *  - `none`: healthy, terminal, or waiting for a scheduled BullMQ retry.
 */
export const decideReconcileAction = (run: TReconcileCandidate, now: Date): TReconcileDecision => {
  if (run.status !== "queued" && run.status !== "running") {
    return "none";
  }

  const nowMs = now.getTime();
  const isStale = (date: Date) => nowMs - date.getTime() >= WORKFLOW_RUN_STALE_AFTER_MS;
  const budgetLeft = run.attempt < WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS;

  if (run.status === "queued" && run.dispatchedAt === null) {
    if (nowMs - run.createdAt.getTime() < WORKFLOW_RUN_UNDISPATCHED_GRACE_MS) {
      return "none";
    }
    return budgetLeft ? "dispatch" : "fail";
  }

  // A scheduled BullMQ retry that is not overdue yet is still owned by the queue.
  if (run.nextAttemptAt && !isStale(run.nextAttemptAt)) {
    return "none";
  }

  const lastActivity =
    run.dispatchedAt && run.dispatchedAt > run.updatedAt ? run.dispatchedAt : run.updatedAt;
  if (!isStale(lastActivity)) {
    return "none";
  }

  return budgetLeft ? "redispatch" : "fail";
};

/** Builds a stable RFC 5322 Message-ID for one step of one run, so mail servers can de-duplicate. */
export const buildWorkflowStepMessageId = ({
  runId,
  stepId,
  from,
}: {
  runId: string;
  stepId: string;
  from: string;
}): string => {
  const domainCandidate = from.split("@")[1]?.trim().toLowerCase() ?? "";
  const domain = /^[a-z0-9.-]+$/.test(domainCandidate) ? domainCandidate : "formbricks.local";
  const safeStepId = stepId.replaceAll(/[^A-Za-z0-9._-]/g, "_");
  return `<workflow-run.${runId}.${safeStepId}@${domain}>`;
};
