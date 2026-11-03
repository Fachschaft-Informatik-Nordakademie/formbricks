import { auth } from "@/modules/auth/lib/auth";

// Force-no-store so Better Auth's outbound SSO fetches (token exchange, userinfo, JWKS) are never
// served from Next's fetch cache — carried over from the NextAuth [...nextauth] route.
export const fetchCache = "force-no-store";

/**
 * Better Auth HTTP handler (ENG-1054 cutover) — replaces the NextAuth `[...nextauth]` catch-all (the
 * two cannot coexist: both own `/api/auth/*`). More specific `/api/auth/*` routes still take
 * precedence over this catch-all.
 *
 * FSINF CE: mounted directly. Upstream wrapped it in an AsyncLocalStorage request context for the
 * Enterprise SSO provisioning hooks; our Authentik hooks (fsinf-sso-hooks.ts) carry no per-request
 * state, so no wrapper is needed.
 */
const handler = (request: Request): Promise<Response> => auth.handler(request);

export { handler as GET, handler as POST };
