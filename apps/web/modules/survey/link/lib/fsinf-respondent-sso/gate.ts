import "server-only";
import type { TSurvey } from "@formbricks/types/surveys/types";
import { responses } from "@/app/lib/api/response";
import { FSINF_SSO_RESPONSE_KEYS, FSINF_SSO_RESPONSE_KEY_LIST, isRespondentAllowed } from "./access";
import type { TRespondentIdentity } from "./access";
import { deriveRespondentSingleUseId, readRespondentSessionToken } from "./session";

/**
 * FSINF: server-side enforcement of a survey's respondent SSO requirement, for the public response
 * endpoints (v1 POST, v2 POST and the shared PUT).
 *
 * The survey page refuses to render an SSO survey to someone who is not logged in (or not allowed),
 * but those endpoints are public — without this gate anyone could POST straight to them. Same reason
 * and same shape as enforceVerifiedEmailGate / the PIN token check next to which it is called.
 *
 * The identity comes from the httpOnly session cookie, which the browser sends because the survey page
 * and the API share the canonical origin (the login always returns there, see the login route).
 */

type TGateSurvey = Pick<TSurvey, "id" | "singleUse" | "fsinfSso">;

const dropReservedKeys = (data: Record<string, unknown> | undefined | null): void => {
  if (!data) return;
  for (const key of FSINF_SSO_RESPONSE_KEY_LIST) {
    delete data[key];
  }
};

type TSessionCheck = { identity: TRespondentIdentity } | { response: Response };

const requireAllowedRespondent = (
  survey: TGateSurvey,
  sessionToken: string | undefined | null
): TSessionCheck => {
  const config = survey.fsinfSso!;
  const identity = readRespondentSessionToken(sessionToken);
  if (!identity) {
    return {
      response: responses.forbiddenResponse("Survey requires an SSO login", true, { surveyId: survey.id }),
    };
  }
  if (!isRespondentAllowed(config, identity)) {
    return {
      response: responses.forbiddenResponse("This account may not answer this survey", true, {
        surveyId: survey.id,
      }),
    };
  }
  return { identity };
};

/** Whether the per-account pseudonym is what keys the response (see deriveRespondentSingleUseId). */
const usesAccountPseudonym = (survey: TGateSurvey): boolean =>
  Boolean(survey.fsinfSso?.oneResponsePerUser) && !survey.singleUse?.enabled;

/**
 * Gate for creating a response. Mutates `responseInput` on success: reserved identity keys are
 * replaced by the attested identity (or removed, for pseudonymous surveys) and `singleUseId` is pinned
 * to the account pseudonym, so the database's (surveyId, singleUseId) unique index enforces "once".
 *
 * @returns an error `Response` when the submission must be rejected, otherwise `null`.
 */
export const enforceRespondentSsoGate = ({
  survey,
  responseInput,
  sessionToken,
}: {
  survey: TGateSurvey;
  responseInput: { data: Record<string, unknown>; singleUseId?: string | null };
  sessionToken: string | undefined | null;
}): Response | null => {
  dropReservedKeys(responseInput.data);
  if (!survey.fsinfSso?.enabled) return null;

  const check = requireAllowedRespondent(survey, sessionToken);
  if ("response" in check) return check.response;
  const { identity } = check;

  if (survey.fsinfSso.recordIdentity) {
    responseInput.data[FSINF_SSO_RESPONSE_KEYS.name] = identity.name;
    responseInput.data[FSINF_SSO_RESPONSE_KEYS.username] = identity.username;
    responseInput.data[FSINF_SSO_RESPONSE_KEYS.email] = identity.email;
  }

  if (usesAccountPseudonym(survey)) {
    responseInput.singleUseId = deriveRespondentSingleUseId(survey.id, identity.sub);
  }

  return null;
};

/**
 * Gate for updating (continuing / finishing) a response. The identity was recorded when the response
 * was created, so an update may never touch the reserved keys. When responses are keyed by the account
 * pseudonym, only that account may continue its response.
 */
export const enforceRespondentSsoUpdateGate = ({
  survey,
  existingResponse,
  updateData,
  sessionToken,
}: {
  survey: TGateSurvey;
  existingResponse: { singleUseId: string | null };
  updateData: Record<string, unknown> | undefined | null;
  sessionToken: string | undefined | null;
}): Response | null => {
  dropReservedKeys(updateData);
  if (!survey.fsinfSso?.enabled) return null;

  const check = requireAllowedRespondent(survey, sessionToken);
  if ("response" in check) return check.response;

  if (
    usesAccountPseudonym(survey) &&
    existingResponse.singleUseId !== deriveRespondentSingleUseId(survey.id, check.identity.sub)
  ) {
    return responses.forbiddenResponse("This response belongs to another account", true, {
      surveyId: survey.id,
    });
  }

  return null;
};
