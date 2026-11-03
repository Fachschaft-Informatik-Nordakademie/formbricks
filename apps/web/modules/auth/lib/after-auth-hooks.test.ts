import { describe, expect, test, vi } from "vitest";
import { runAfterAuthHooks } from "./after-auth-hooks";
import { auditFailedAuthAfter } from "./better-auth-observability";
import { twoFactorBackfillAfterHandler } from "./better-auth-two-factor-backfill";

vi.mock("server-only", () => ({}));
vi.mock("./better-auth-observability", () => ({ auditFailedAuthAfter: vi.fn() }));
vi.mock("./better-auth-two-factor-backfill", () => ({ twoFactorBackfillAfterHandler: vi.fn() }));

describe("runAfterAuthHooks", () => {
  test("records the failed-auth audit before the 2FA backfill", async () => {
    const calls: string[] = [];
    vi.mocked(auditFailedAuthAfter).mockImplementation(async () => {
      calls.push("audit");
    });
    vi.mocked(twoFactorBackfillAfterHandler).mockImplementation(async () => {
      calls.push("backfill");
    });

    await runAfterAuthHooks({} as never);
    expect(calls).toEqual(["audit", "backfill"]);
  });

  test("a failing audit stops the chain instead of being swallowed", async () => {
    vi.mocked(auditFailedAuthAfter).mockRejectedValueOnce(new Error("audit down"));
    vi.mocked(twoFactorBackfillAfterHandler).mockClear();

    await expect(runAfterAuthHooks({} as never)).rejects.toThrow("audit down");
    expect(twoFactorBackfillAfterHandler).not.toHaveBeenCalled();
  });
});
