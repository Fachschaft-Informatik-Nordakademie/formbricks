import { describe, expect, test } from "vitest";
import { WORKFLOW_RUN_STALE_AFTER_MS, WORKFLOW_RUN_UNDISPATCHED_GRACE_MS } from "./reconcile-constants";
import {
  WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS,
  buildReconcileJobId,
  buildResponseCompletedIdempotencyKey,
  buildWorkflowStepMessageId,
  decideReconcileAction,
  getRetryDelayMs,
  isTerminalWorkflowRunStatus,
} from "./run-policy";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const baseRun = {
  status: "queued",
  attempt: 0,
  createdAt: ago(60_000),
  updatedAt: ago(60_000),
  dispatchedAt: null as Date | null,
  nextAttemptAt: null as Date | null,
};

describe("decideReconcileAction", () => {
  test("leaves a fresh undispatched run to the producer", () => {
    expect(decideReconcileAction(baseRun, NOW)).toBe("none");
  });

  test("dispatches an undispatched run after the grace period", () => {
    const createdAt = ago(WORKFLOW_RUN_UNDISPATCHED_GRACE_MS + 1);
    expect(decideReconcileAction({ ...baseRun, createdAt, updatedAt: createdAt }, NOW)).toBe("dispatch");
  });

  test("ignores terminal runs", () => {
    for (const status of ["completed", "failed", "canceled"]) {
      expect(decideReconcileAction({ ...baseRun, status, updatedAt: ago(10 * 60 * 60 * 1000) }, NOW)).toBe(
        "none"
      );
    }
  });

  test("keeps a recently dispatched run with the queue", () => {
    expect(
      decideReconcileAction({ ...baseRun, dispatchedAt: ago(60_000), updatedAt: ago(60_000) }, NOW)
    ).toBe("none");
  });

  test("re-dispatches a dispatched run whose job went silent", () => {
    const stale = ago(WORKFLOW_RUN_STALE_AFTER_MS + 1);
    expect(decideReconcileAction({ ...baseRun, dispatchedAt: stale, updatedAt: stale }, NOW)).toBe(
      "redispatch"
    );
  });

  test("re-dispatches a stalled running run", () => {
    const stale = ago(WORKFLOW_RUN_STALE_AFTER_MS + 1);
    expect(
      decideReconcileAction(
        { ...baseRun, status: "running", attempt: 2, dispatchedAt: stale, updatedAt: stale },
        NOW
      )
    ).toBe("redispatch");
  });

  test("waits for a scheduled retry that is not overdue", () => {
    const stale = ago(WORKFLOW_RUN_STALE_AFTER_MS + 1);
    expect(
      decideReconcileAction(
        {
          ...baseRun,
          status: "running",
          attempt: 1,
          dispatchedAt: stale,
          updatedAt: stale,
          nextAttemptAt: ago(1_000),
        },
        NOW
      )
    ).toBe("none");
  });

  test("fails a stuck run that used up its attempt budget", () => {
    const stale = ago(WORKFLOW_RUN_STALE_AFTER_MS + 1);
    expect(
      decideReconcileAction(
        {
          ...baseRun,
          status: "running",
          attempt: WORKFLOW_RUN_MAX_TOTAL_ATTEMPTS,
          dispatchedAt: stale,
          updatedAt: stale,
        },
        NOW
      )
    ).toBe("fail");
  });
});

describe("run policy helpers", () => {
  test("retry delay follows the queue's exponential backoff", () => {
    expect(getRetryDelayMs(1)).toBe(5_000);
    expect(getRetryDelayMs(2)).toBe(10_000);
    expect(getRetryDelayMs(3)).toBe(20_000);
    expect(getRetryDelayMs(0)).toBe(5_000);
  });

  test("terminal statuses", () => {
    expect(isTerminalWorkflowRunStatus("completed")).toBe(true);
    expect(isTerminalWorkflowRunStatus("canceled")).toBe(true);
    expect(isTerminalWorkflowRunStatus("running")).toBe(false);
    expect(isTerminalWorkflowRunStatus("queued")).toBe(false);
  });

  test("idempotency key is stable per response", () => {
    expect(buildResponseCompletedIdempotencyKey("r1")).toBe("response.completed:r1");
    expect(buildResponseCompletedIdempotencyKey("r1")).toBe(buildResponseCompletedIdempotencyKey("r1"));
  });

  test("reconcile job ids contain no colon and change with the attempt", () => {
    const first = buildReconcileJobId("run1", 1);
    expect(first).not.toContain(":");
    expect(first).toBe(buildReconcileJobId("run1", 1));
    expect(buildReconcileJobId("run1", 2)).not.toBe(first);
  });

  test("message id uses the sender domain and sanitizes the step id", () => {
    expect(
      buildWorkflowStepMessageId({ runId: "run1", stepId: "send email<1>", from: "a@Mail.Example.org" })
    ).toBe("<workflow-run.run1.send_email_1_@mail.example.org>");
  });

  test("message id falls back to a local domain for a malformed sender", () => {
    expect(buildWorkflowStepMessageId({ runId: "run1", stepId: "s", from: "not-an-email" })).toBe(
      "<workflow-run.run1.s@formbricks.local>"
    );
  });
});
