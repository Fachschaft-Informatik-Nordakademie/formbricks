import { beforeEach, describe, expect, test, vi } from "vitest";

const { infoMock } = vi.hoisted(() => ({ infoMock: vi.fn() }));

vi.mock("@formbricks/logger", () => ({
  logger: {
    withContext: () => ({ info: infoMock }),
    error: vi.fn(),
  },
}));
vi.mock("@/lib/constants", () => ({ AUDIT_LOG_ENABLED: true, AUDIT_LOG_GET_USER_IP: false }));
vi.mock("@/lib/utils/client-ip", () => ({ getClientIpFromHeaders: vi.fn(async () => "10.0.0.1") }));

const { buildAuditRecord, queueAuditEventWithoutRequest, withAuditLogging } = await import("./handler");

const baseEvent = {
  action: "updated",
  targetType: "survey",
  targetId: "s1",
  userId: "u1",
  userType: "user" as const,
  organizationId: "o1",
  status: "success" as const,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("buildAuditRecord", () => {
  test("records only the change and redacts PII", () => {
    const record = buildAuditRecord(
      {
        ...baseEvent,
        oldObject: { name: "Alt", status: "draft", email: "a@b.de" },
        newObject: { name: "Neu", status: "inProgress", email: "c@d.de" },
      },
      { includeIp: false, now: new Date("2026-11-03T10:00:00Z") }
    );
    expect(record.changes).toEqual({ status: "inProgress" });
    expect(JSON.stringify(record)).not.toContain("c@d.de");
    expect(record.timestamp).toBe("2026-11-03T10:00:00.000Z");
  });

  test("keeps the IP only when configured", () => {
    const event = { ...baseEvent, ipAddress: "192.0.2.7" };
    expect(buildAuditRecord(event, { includeIp: false }).ipAddress).toBeUndefined();
    expect(buildAuditRecord(event, { includeIp: true }).ipAddress).toBe("192.0.2.7");
  });

  test("marks a deletion with the (redacted) old object", () => {
    const record = buildAuditRecord(
      { ...baseEvent, action: "deleted", oldObject: { status: "draft", password: "x" } },
      { includeIp: false }
    );
    expect(record.changes).toEqual({ deleted: { status: "draft", password: "********" } });
  });

  test("falls back to 'unknown' for missing identifiers", () => {
    const record = buildAuditRecord({ ...baseEvent, targetId: "", userId: "" }, { includeIp: false });
    expect(record.targetId).toBe("unknown");
    expect(record.actor.id).toBe("unknown");
  });
});

describe("audit writers", () => {
  beforeEach(() => infoMock.mockClear());

  test("writes one structured line per event", async () => {
    await queueAuditEventWithoutRequest(baseEvent);
    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(infoMock.mock.calls[0][0].auditEvent).toMatchObject({ action: "updated", targetId: "s1" });
  });

  test("withAuditLogging records success with the target id from ctx", async () => {
    const wrapped = withAuditLogging("deleted", "tag", async () => "ok");
    const ctx = { auditLoggingCtx: { ipAddress: "unknown", organizationId: "o1", tagId: "t1" } };
    await expect(wrapped({ ctx, parsedInput: {} })).resolves.toBe("ok");
    await flush();
    expect(infoMock.mock.calls[0][0].auditEvent).toMatchObject({
      action: "deleted",
      targetType: "tag",
      targetId: "t1",
      status: "success",
    });
  });

  test("withAuditLogging records failures and re-throws", async () => {
    const wrapped = withAuditLogging("created", "survey", async () => {
      throw new Error("boom");
    });
    const ctx = { auditLoggingCtx: { ipAddress: "unknown", suppressEvent: true } };
    await expect(wrapped({ ctx, parsedInput: {} })).rejects.toThrow("boom");
    await flush();
    expect(infoMock.mock.calls[0][0].auditEvent).toMatchObject({ status: "failure" });
  });

  test("suppressEvent silences a successful run only", async () => {
    const wrapped = withAuditLogging("created", "user", async () => "ok");
    const ctx = { auditLoggingCtx: { ipAddress: "unknown", suppressEvent: true } };
    await wrapped({ ctx, parsedInput: {} });
    await flush();
    expect(infoMock).not.toHaveBeenCalled();
  });
});
