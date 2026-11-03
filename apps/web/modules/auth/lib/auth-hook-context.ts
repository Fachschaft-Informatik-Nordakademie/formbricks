import type { createAuthMiddleware } from "better-auth/api";

/**
 * The context Better Auth passes to a `hooks.before` / `hooks.after` middleware — the handler argument
 * of `createAuthMiddleware(handler)` (its last, handler-only overload).
 */
export type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
