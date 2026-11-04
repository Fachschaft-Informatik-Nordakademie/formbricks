import "server-only";
import { prisma } from "@formbricks/database";
import { type TWorkflowRunJobData, enqueueWorkflowRunJob } from "@formbricks/jobs";

/**
 * FSINF CE: hands a persisted workflow run to the background queue.
 *
 * The run row is the source of truth; the queue only carries its ids. The default BullMQ job id is
 * the run id, so dispatching the same run twice never creates a second job. `dispatchedAt` is stamped
 * after a successful enqueue — a run without it is picked up again by the reconciler.
 */
export type TWorkflowRunDispatcher = (
  data: TWorkflowRunJobData,
  options?: { jobId?: string }
) => Promise<void>;

export const dispatchWorkflowRunViaJobs: TWorkflowRunDispatcher = async (data, options) => {
  await enqueueWorkflowRunJob(data, { jobId: options?.jobId ?? data.workflowRunId });

  await prisma.workflowRun.updateMany({
    where: { id: data.workflowRunId, workflowId: data.workflowId, workspaceId: data.workspaceId },
    data: { dispatchedAt: new Date() },
  });
};
