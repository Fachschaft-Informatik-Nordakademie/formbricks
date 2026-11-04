import "server-only";
import { prisma } from "@formbricks/database";
import type { JobHandler, TWorkflowRunReconcileJobData } from "@formbricks/jobs";
import { logger } from "@formbricks/logger";
import { dispatchWorkflowRunViaJobs } from "./dispatch";
import {
  WORKFLOW_RUN_RECONCILE_BATCH_SIZE,
  WORKFLOW_RUN_STALE_AFTER_MS,
  WORKFLOW_RUN_UNDISPATCHED_GRACE_MS,
} from "./reconcile-constants";
import { buildReconcileJobId, decideReconcileAction } from "./run-policy";

/**
 * FSINF CE: worker handler of the recurring `workflow-run.reconcile` sweep. Recovers runs the queue
 * lost track of:
 *  - queued runs never dispatched (enqueue failed after the run was created) → dispatch;
 *  - dispatched/running runs untouched for `WORKFLOW_RUN_STALE_AFTER_MS` → re-dispatch under a fresh
 *    job id (the run job resumes after its last claimed step, so nothing is sent twice);
 *  - stuck runs that used up their attempt budget → failed.
 * Global sweep by design (no tenant input); every write is scoped to the run's own ids.
 */
export const processWorkflowRunReconcileJob: JobHandler<TWorkflowRunReconcileJobData> = async (
  _data,
  context
) => {
  const now = new Date();
  const undispatchedCutoff = new Date(now.getTime() - WORKFLOW_RUN_UNDISPATCHED_GRACE_MS);
  const staleCutoff = new Date(now.getTime() - WORKFLOW_RUN_STALE_AFTER_MS);

  const candidates = await prisma.workflowRun.findMany({
    where: {
      OR: [
        { status: "queued", dispatchedAt: null, createdAt: { lte: undispatchedCutoff } },
        { status: { in: ["queued", "running"] }, updatedAt: { lte: staleCutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: WORKFLOW_RUN_RECONCILE_BATCH_SIZE,
    select: {
      id: true,
      workflowId: true,
      workspaceId: true,
      status: true,
      attempt: true,
      createdAt: true,
      updatedAt: true,
      dispatchedAt: true,
      nextAttemptAt: true,
    },
  });

  const counts = { dispatched: 0, redispatched: 0, failed: 0, errors: 0 };

  for (const run of candidates) {
    const decision = decideReconcileAction(run, now);
    if (decision === "none") {
      continue;
    }

    try {
      if (decision === "fail") {
        const updated = await prisma.workflowRun.updateMany({
          where: { id: run.id, status: run.status, attempt: run.attempt },
          data: {
            status: "failed",
            error: "The run stalled and used up its retry budget.",
            finishedAt: now,
            lastErrorAt: now,
            nextAttemptAt: null,
          },
        });
        counts.failed += updated.count;
        continue;
      }

      await dispatchWorkflowRunViaJobs(
        { workflowRunId: run.id, workflowId: run.workflowId, workspaceId: run.workspaceId },
        decision === "redispatch" ? { jobId: buildReconcileJobId(run.id, run.attempt) } : undefined
      );
      counts[decision === "dispatch" ? "dispatched" : "redispatched"] += 1;
    } catch (error) {
      counts.errors += 1;
      logger.error(
        { err: error, workflowRunId: run.id, decision, jobId: context.jobId },
        "Workflow run reconcile action failed"
      );
    }
  }

  if (counts.dispatched + counts.redispatched + counts.failed + counts.errors > 0) {
    logger.info({ ...counts, jobId: context.jobId }, "Workflow run reconcile sweep finished");
  }
};
