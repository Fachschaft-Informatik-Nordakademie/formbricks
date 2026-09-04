import "server-only";
import { isAiConfigured } from "@formbricks/ai";
import { env } from "@/lib/env";

/**
 * FSINF: our own entitlement for the AI features, alongside the enterprise one.
 *
 * Formbricks implements AI survey generation entirely in AGPL code — the prompt, the generation
 * schema and the validation live in `apps/web/app/api/v3/surveys/generate/`, and the provider plumbing
 * in `apps/web/lib/ai/`. Nothing of it sits under `apps/web/modules/ee/`. The single thing that turns
 * it off here is the entitlement lookup `getIsAISmartToolsEnabled`, which asks the enterprise license
 * we don't hold — so the "Create with AI" card renders as "not available on your current plan".
 *
 * Rather than touching that license check (same line we did not cross for SSO — see
 * fsinf-sso-config.ts), this adds a SECOND, independent reason to be entitled: the operator has
 * configured an AI provider for this instance. That is a deliberate act of configuration, it is the
 * operator's own model and their own API bill, and it entitles only AGPL code paths.
 *
 * Note what this does NOT change: the organization's own `isAISmartToolsEnabled` switch still has to
 * be on (Organization → General → AI), and `isInstanceConfigured` is still required. Entitlement is
 * only the third of the three gates in `getAISmartToolsUnavailableReason`.
 */
export const isFsinfAiEntitled = (): boolean => isAiConfigured(env);
