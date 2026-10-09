import "server-only";
import { cookies } from "next/headers";
import { type TFingerprintDecision, fingerprintCookieName, readFingerprintToken } from "./token";

/**
 * FSINF: has the respondent already decided (consented or declined) about this survey's device
 * fingerprint? Until then the survey page shows the consent screen instead of the survey.
 */
export const getFingerprintDecision = async (surveyId: string): Promise<TFingerprintDecision | null> => {
  const cookieStore = await cookies();
  return readFingerprintToken(cookieStore.get(fingerprintCookieName(surveyId))?.value, surveyId);
};
