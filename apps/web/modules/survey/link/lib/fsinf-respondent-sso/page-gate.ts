import "server-only";
import { cookies } from "next/headers";
import type { TSurvey } from "@formbricks/types/surveys/types";
import { isRespondentAllowed } from "./access";
import type { TRespondentIdentity } from "./access";
import { RESPONDENT_SSO_BASE_PATH, isRespondentSsoConfigured, sanitizeReturnQuery } from "./oidc";
import {
  RESPONDENT_SESSION_COOKIE,
  deriveRespondentSingleUseId,
  readRespondentSessionToken,
} from "./session";

/**
 * FSINF: the survey page's side of the respondent SSO gate. The response endpoints enforce the same
 * decision (gate.ts); this only decides what to render.
 */

type TPageGateSurvey = Pick<TSurvey, "id" | "singleUse" | "fsinfSso">;

export type TPageAccess =
  | { kind: "login" }
  | { kind: "unconfigured" }
  | { kind: "denied"; signedInAs: string }
  | { kind: "allowed"; singleUseId?: string };

const describeAccount = (identity: TRespondentIdentity): string => {
  const handle = identity.username || identity.email;
  return identity.name && identity.name !== handle ? `${identity.name} (${handle})` : handle;
};

export const decidePageAccess = ({
  survey,
  identity,
  configured,
}: {
  survey: TPageGateSurvey;
  identity: TRespondentIdentity | null;
  configured: boolean;
}): TPageAccess => {
  const config = survey.fsinfSso!;
  if (!configured) return { kind: "unconfigured" };
  if (!identity) return { kind: "login" };
  if (!isRespondentAllowed(config, identity))
    return { kind: "denied", signedInAs: describeAccount(identity) };
  if (config.oneResponsePerUser && !survey.singleUse?.enabled) {
    return { kind: "allowed", singleUseId: deriveRespondentSingleUseId(survey.id, identity.sub) };
  }
  return { kind: "allowed" };
};

export const getPageAccess = async (survey: TPageGateSurvey): Promise<TPageAccess> => {
  const cookieStore = await cookies();
  return decidePageAccess({
    survey,
    identity: readRespondentSessionToken(cookieStore.get(RESPONDENT_SESSION_COOKIE)?.value),
    configured: isRespondentSsoConfigured(),
  });
};

/** Relative on purpose: the login route itself hops to the canonical origin if needed. */
export const buildLoginLinks = (
  surveyId: string,
  searchParams: Record<string, string | string[] | undefined>
): { loginUrl: string; switchAccountUrl: string } => {
  const passThrough = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") passThrough.set(key, value);
  }
  const query = sanitizeReturnQuery(passThrough.toString());
  return {
    loginUrl: `${RESPONDENT_SSO_BASE_PATH}/login?${new URLSearchParams({ surveyId, query })}`,
    switchAccountUrl: `${RESPONDENT_SSO_BASE_PATH}/logout?${new URLSearchParams({ surveyId, query, switch: "1" })}`,
  };
};
