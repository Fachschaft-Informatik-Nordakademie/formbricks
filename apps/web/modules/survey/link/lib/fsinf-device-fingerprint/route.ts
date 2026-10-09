import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@formbricks/logger";
import { ZId } from "@formbricks/types/common";
import { WEBAPP_URL } from "@/lib/constants";
import { getSurvey } from "@/lib/survey/service";
import {
  FINGERPRINT_TTL_SECONDS,
  createFingerprintToken,
  deriveBrowserId,
  deriveDeviceId,
  fingerprintCookieName,
} from "./token";
import { ZDeviceTraits, formatDeviceTraits } from "./traits";

/**
 * FSINF: POST /api/fsinf/device-fingerprint — the consent step of the device fingerprint audit.
 *
 * The survey page asks first; only after "Einverstanden" does the browser run FingerprintJS and send
 * the result here. "Ablehnen" sends just the decision. Either way the answer becomes a signed httpOnly
 * cookie for this survey, which the response endpoints turn into the audit entry (gate.ts). Raw values
 * are reduced to keyed ids right here and never stored.
 */

export const FINGERPRINT_API_PATH = "/api/fsinf/device-fingerprint";
const MAX_BODY_BYTES = 8 * 1024;

const ZDecision = z.discriminatedUnion("consent", [
  z.object({
    surveyId: ZId,
    consent: z.literal(true),
    /** FingerprintJS visitorId: 128-bit MurmurHash3 as hex. */
    visitorId: z.string().regex(/^[0-9a-f]{32}$/),
    traits: ZDeviceTraits,
  }),
  z.object({ surveyId: ZId, consent: z.literal(false) }),
]);

const noStore = (response: NextResponse): NextResponse => {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

const plainError = (status: number, message: string) =>
  noStore(new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }));

export const handleFingerprintDecision = async (request: NextRequest): Promise<NextResponse> => {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return plainError(413, "Payload too large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return plainError(400, "Invalid JSON");
  }
  const parsed = ZDecision.safeParse(body);
  if (!parsed.success) return plainError(400, "Invalid fingerprint decision");
  const decision = parsed.data;

  const survey = await getSurvey(decision.surveyId);
  if (!survey?.fsinfFingerprint?.enabled) return plainError(404, "Survey does not use device fingerprints");

  const token =
    decision.consent === true
      ? createFingerprintToken({
          surveyId: survey.id,
          status: "recorded",
          device: deriveDeviceId(survey.id, decision.traits),
          browser: deriveBrowserId(survey.id, decision.visitorId),
          info: formatDeviceTraits(decision.traits),
        })
      : createFingerprintToken({ surveyId: survey.id, status: "declined" });

  logger.info(
    { surveyId: survey.id, consent: decision.consent },
    "FSINF device fingerprint: decision recorded"
  );

  const response = noStore(new NextResponse(null, { status: 204 }));
  response.cookies.set(fingerprintCookieName(survey.id), token, {
    httpOnly: true,
    secure: WEBAPP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: FINGERPRINT_TTL_SECONDS,
  });
  return response;
};
