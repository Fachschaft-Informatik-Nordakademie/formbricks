/**
 * FSINF CE: timing of the workflow run reconciler. Kept dependency-free so the job registration
 * (and its tests) can import the interval without pulling in Prisma or the runner.
 */

/** How often the global `workflow-run.reconcile` sweep runs. */
export const WORKFLOW_RUN_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * A run that was created but never handed to the queue (enqueue failed, process died between the
 * insert and the enqueue) is dispatched once it is older than this.
 */
export const WORKFLOW_RUN_UNDISPATCHED_GRACE_MS = 2 * 60 * 1000;

/**
 * A dispatched/running run that has not been touched for this long is considered stuck: its job was
 * lost (Redis flush, worker killed after BullMQ gave up on the stalled job, …). Every executed step
 * bumps `updatedAt`, and a single send is bounded by SMTP timeouts, so a healthy run never gets here.
 */
export const WORKFLOW_RUN_STALE_AFTER_MS = 15 * 60 * 1000;

/** Upper bound of runs handled per sweep, so a backlog is worked off over several sweeps. */
export const WORKFLOW_RUN_RECONCILE_BATCH_SIZE = 100;
