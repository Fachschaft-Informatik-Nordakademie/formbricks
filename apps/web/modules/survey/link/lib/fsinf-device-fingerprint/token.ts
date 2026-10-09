import "server-only";
import { createHmac } from "node:crypto";
import { BETTER_AUTH_SECRET, NEXTAUTH_SECRET } from "@/lib/constants";
import { signFsinfToken, verifyFsinfToken } from "../fsinf-respondent-sso/session";
import { type TDeviceTraits, canonicalDeviceTraits } from "./traits";

/**
 * FSINF: the signed, httpOnly cookie that carries a respondent's fingerprint decision from the consent
 * step on the survey page to the response endpoints (gate.ts), plus the keyed ids stored with responses.
 *
 * The raw FingerprintJS visitorId and device traits never reach the database: only per-survey HMACs
 * (and a short human-readable device summary) do. Per survey, so audits of two surveys cannot be joined;
 * keyed with the server secret, so an id cannot be recomputed from a device by anyone else.
 */

export const FINGERPRINT_COOKIE_PREFIX = "fsinf_fp_";
/** Long enough to fill in a long survey; the decision is asked again on a later visit. */
export const FINGERPRINT_TTL_SECONDS = 24 * 60 * 60;
const PURPOSE = "fsinf_device_fingerprint";

/** One cookie per survey, so two surveys open in parallel do not overwrite each other's decision. */
export const fingerprintCookieName = (surveyId: string): string => `${FINGERPRINT_COOKIE_PREFIX}${surveyId}`;

export type TFingerprintDecision =
  | { surveyId: string; status: "recorded"; device: string; browser: string; info: string }
  | { surveyId: string; status: "declined" };

export const createFingerprintToken = (decision: TFingerprintDecision): string =>
  signFsinfToken(decision, PURPOSE, FINGERPRINT_TTL_SECONDS);

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export const readFingerprintToken = (
  token: string | null | undefined,
  surveyId: string
): TFingerprintDecision | null => {
  const payload = verifyFsinfToken(token, PURPOSE);
  if (payload?.surveyId !== surveyId) return null;
  if (payload.status === "declined") return { surveyId, status: "declined" };
  if (payload.status !== "recorded" || !asString(payload.device)) return null;
  return {
    surveyId,
    status: "recorded",
    device: asString(payload.device),
    browser: asString(payload.browser),
    info: asString(payload.info),
  };
};

const hmacKey = (): string => {
  const secret = BETTER_AUTH_SECRET ?? NEXTAUTH_SECRET;
  if (!secret) throw new Error("No auth secret set (BETTER_AUTH_SECRET or NEXTAUTH_SECRET)");
  return createHmac("sha256", secret).update("fsinf-device-fingerprint:id").digest("hex");
};

const keyedId = (prefix: string, surveyId: string, input: string): string =>
  prefix +
  createHmac("sha256", hmacKey()).update(`${prefix}${surveyId}:${input}`).digest("base64url").slice(0, 16);

export const deriveDeviceId = (surveyId: string, traits: TDeviceTraits): string =>
  keyedId("dev_", surveyId, canonicalDeviceTraits(traits));

export const deriveBrowserId = (surveyId: string, visitorId: string): string =>
  keyedId("brw_", surveyId, visitorId);
