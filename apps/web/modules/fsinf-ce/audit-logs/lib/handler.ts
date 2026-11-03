import { logger } from "@formbricks/logger";
import { AUDIT_LOG_ENABLED, AUDIT_LOG_GET_USER_IP } from "@/lib/constants";
import type { ActionClientCtx } from "@/lib/utils/action-client/types/context";
import { getClientIpFromHeaders } from "@/lib/utils/client-ip";
import { deepDiff, redactPII } from "@/lib/utils/logger-helpers";
import {
  type TAuditAction,
  type TAuditEventInput,
  type TAuditStatus,
  type TAuditTarget,
  UNKNOWN_DATA,
} from "../types/audit-log";

/**
 * FSINF CE audit log.
 *
 * Enabled with AUDIT_LOG_ENABLED=1. Each event becomes one structured log line (`audit: true`) on the
 * regular application logger, so it ends up wherever the container logs go — no extra table, no
 * extra service. Data minimisation (DSGVO Art. 5 (1) c):
 *   - only the CHANGE is recorded (deep diff of old → new), never full objects, with credentials and
 *     known PII keys redacted by `redactPII`;
 *   - the client IP is recorded only when AUDIT_LOG_GET_USER_IP=1.
 * Auditing never breaks the audited operation: every failure here is caught and logged.
 */

const auditLogger = logger.withContext({ audit: true });

export type TAuditRecord = {
  timestamp: string;
  action: TAuditAction;
  targetType: TAuditTarget;
  targetId: string;
  actor: { id: string; type: TAuditEventInput["userType"] };
  organizationId: string;
  status: TAuditStatus;
  eventId?: string;
  apiUrl?: string;
  ipAddress?: string;
  changes?: unknown;
};

/** Pure: turns an event into the record that is written. Exported for tests. */
export const buildAuditRecord = (
  event: TAuditEventInput,
  { includeIp, now = new Date() }: { includeIp: boolean; now?: Date }
): TAuditRecord => {
  const oldObject = event.oldObject ? redactPII(event.oldObject) : undefined;
  const newObject = event.newObject ? redactPII(event.newObject) : undefined;
  let changes: unknown;
  if (oldObject && newObject) changes = deepDiff(oldObject, newObject);
  else changes = newObject ?? (oldObject ? { deleted: oldObject } : undefined);

  return {
    timestamp: now.toISOString(),
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId || UNKNOWN_DATA,
    actor: { id: event.userId || UNKNOWN_DATA, type: event.userType },
    organizationId: event.organizationId || UNKNOWN_DATA,
    status: event.status,
    ...(event.eventId ? { eventId: event.eventId } : {}),
    ...(event.apiUrl ? { apiUrl: event.apiUrl } : {}),
    ...(includeIp && event.ipAddress ? { ipAddress: event.ipAddress } : {}),
    ...(changes === undefined ? {} : { changes }),
  };
};

const writeAuditRecord = (event: TAuditEventInput): void => {
  const record = buildAuditRecord(event, { includeIp: AUDIT_LOG_GET_USER_IP });
  auditLogger.info({ auditEvent: record }, `audit ${record.action} ${record.targetType}`);
};

/** Records an event that belongs to an incoming request; resolves the client IP if configured. */
export const queueAuditEvent = async (event: TAuditEventInput): Promise<void> => {
  if (!AUDIT_LOG_ENABLED) return;
  try {
    let ipAddress = event.ipAddress;
    if (AUDIT_LOG_GET_USER_IP && !ipAddress) {
      ipAddress = await getClientIpFromHeaders().catch(() => undefined);
    }
    writeAuditRecord({ ...event, ipAddress });
  } catch (error) {
    logger.error({ error }, "Failed to write audit event");
  }
};

/** For jobs and other code that runs outside a request (no headers to read). */
export const queueAuditEventWithoutRequest = async (event: TAuditEventInput): Promise<void> => {
  if (!AUDIT_LOG_ENABLED) return;
  try {
    writeAuditRecord(event);
  } catch (error) {
    logger.error({ error }, "Failed to write audit event");
  }
};

/** Fire-and-forget variant: never delays or fails the caller. */
export const queueAuditEventBackground = async (event: TAuditEventInput): Promise<void> => {
  queueAuditEvent(event).catch((error) => logger.error({ error }, "Failed to write audit event"));
};

type TAuditCtxIdKey = Extract<keyof ActionClientCtx["auditLoggingCtx"], `${string}Id`>;

const getTargetId = (ctx: ActionClientCtx, targetType: TAuditTarget): string => {
  const key = `${targetType}Id` as TAuditCtxIdKey;
  const value = ctx.auditLoggingCtx[key];
  return typeof value === "string" && value ? value : UNKNOWN_DATA;
};

/**
 * Wraps a server-action handler: records `action` on `targetType` with success/failure status. The
 * handler fills `ctx.auditLoggingCtx` (organizationId, `<target>Id`, oldObject/newObject). A failing
 * handler is always recorded and its error re-thrown; `suppressEvent` only silences a SUCCESSFUL run.
 */
export const withAuditLogging = <TCtx extends ActionClientCtx, TParsedInput, TResult>(
  action: TAuditAction,
  targetType: TAuditTarget,
  handler: (args: { ctx: TCtx; parsedInput: TParsedInput }) => Promise<TResult>
) => {
  return async (args: { ctx: TCtx; parsedInput: TParsedInput }): Promise<TResult> => {
    const { ctx } = args;
    let status: TAuditStatus = "failure";
    try {
      const result = await handler(args);
      status = "success";
      return result;
    } finally {
      const audit = ctx.auditLoggingCtx;
      if (!(status === "success" && audit.suppressEvent)) {
        void queueAuditEventBackground({
          action,
          targetType,
          targetId: getTargetId(ctx, targetType),
          userId: ctx.user?.id ?? audit.userId ?? UNKNOWN_DATA,
          userType: "user",
          organizationId: audit.organizationId ?? UNKNOWN_DATA,
          status,
          oldObject: audit.oldObject ?? undefined,
          newObject: audit.newObject ?? undefined,
          eventId: audit.eventId,
          ipAddress: audit.ipAddress !== UNKNOWN_DATA ? audit.ipAddress : undefined,
        });
      }
    }
  };
};
