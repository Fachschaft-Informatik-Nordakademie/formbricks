import "server-only";
import { cookies } from "next/headers";
import type { TSurvey } from "@formbricks/types/surveys/types";
import { fingerprintCookieName } from "./token";

/** The survey's fingerprint cookie — only looked up when the survey uses fingerprinting. */
export const getFingerprintTokenFor = async (
  survey: Pick<TSurvey, "id" | "fsinfFingerprint">
): Promise<string | undefined> => {
  if (!survey.fsinfFingerprint?.enabled) return undefined;
  const cookieStore = await cookies();
  return cookieStore.get(fingerprintCookieName(survey.id))?.value;
};
