import "server-only";
import { cookies } from "next/headers";
import type { TSurvey } from "@formbricks/types/surveys/types";
import { RESPONDENT_SESSION_COOKIE } from "./session";

/**
 * The respondent session cookie of the current request — only looked up for SSO surveys, so routes
 * (and their tests) that never deal with one do not touch the request scope at all.
 */
export const getRespondentSessionTokenFor = async (
  survey: Pick<TSurvey, "fsinfSso">
): Promise<string | undefined> => {
  if (!survey.fsinfSso?.enabled) return undefined;
  const cookieStore = await cookies();
  return cookieStore.get(RESPONDENT_SESSION_COOKIE)?.value;
};
