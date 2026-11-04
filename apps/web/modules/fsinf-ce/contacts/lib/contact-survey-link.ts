/**
 * FSINF CE: personal survey links (`/c/<jwt>`). The JWT binds one contact to one survey, is signed
 * with NEXTAUTH_SECRET and carries a dedicated `purpose` claim so no other token minted with the same
 * secret can be replayed here. The contact id inside is encrypted so links do not expose internal ids.
 */
import "server-only";
import jwt from "jsonwebtoken";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { Result, err, ok } from "@formbricks/types/error-handlers";
import { ENCRYPTION_KEY, NEXTAUTH_SECRET } from "@/lib/constants";
import { symmetricDecrypt, symmetricEncrypt } from "@/lib/crypto";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { ApiErrorResponseV2 } from "@/modules/api/v2/types/api-error";

export const CONTACT_SURVEY_TOKEN_PURPOSE = "contact_survey_link";

interface TContactSurveyTokenPayload {
  contactId: string;
  surveyId: string;
  purpose: string;
}

const getSecrets = (): { secret: string; encryptionKey: string } | null => {
  if (!NEXTAUTH_SECRET || !ENCRYPTION_KEY) return null;
  return { secret: NEXTAUTH_SECRET, encryptionKey: ENCRYPTION_KEY };
};

/** Signs a token for contact + survey; `expirationDays` omitted = no expiry. */
export const createContactSurveyToken = (
  contactId: string,
  surveyId: string,
  expirationDays?: number
): Result<string, ApiErrorResponseV2> => {
  const secrets = getSecrets();
  if (!secrets) {
    return err({
      type: "internal_server_error",
      details: [{ field: "token", issue: "Secrets not configured" }],
    });
  }
  const token = jwt.sign(
    {
      contactId: symmetricEncrypt(contactId, secrets.encryptionKey),
      surveyId,
      purpose: CONTACT_SURVEY_TOKEN_PURPOSE,
    },
    secrets.secret,
    { algorithm: "HS256", ...(expirationDays ? { expiresIn: `${expirationDays}d` } : {}) }
  );
  return ok(token);
};

/** Builds the personal link after checking that contact and survey share a workspace. */
export const getContactSurveyLink = async (
  contactId: string,
  surveyId: string,
  expirationDays?: number
): Promise<Result<string, ApiErrorResponseV2>> => {
  const [contact, survey] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { workspaceId: true } }),
    prisma.survey.findUnique({ where: { id: surveyId }, select: { workspaceId: true } }),
  ]);
  if (!contact)
    return err({ type: "not_found", details: [{ field: "contactId", issue: "Contact not found" }] });
  if (!survey) return err({ type: "not_found", details: [{ field: "surveyId", issue: "Survey not found" }] });
  if (contact.workspaceId !== survey.workspaceId) {
    return err({
      type: "bad_request",
      details: [{ field: "surveyId", issue: "Contact and survey are not in the same workspace" }],
    });
  }

  const token = createContactSurveyToken(contactId, surveyId, expirationDays);
  if (!token.ok) return token;
  return ok(`${getPublicDomain()}/c/${token.data}`);
};

export const verifyContactSurveyToken = (
  token: string
): Result<{ contactId: string; surveyId: string }, ApiErrorResponseV2> => {
  const secrets = getSecrets();
  if (!secrets) {
    return err({
      type: "internal_server_error",
      details: [{ field: "token", issue: "Secrets not configured" }],
    });
  }
  try {
    const payload = jwt.verify(token, secrets.secret, {
      algorithms: ["HS256"],
    }) as TContactSurveyTokenPayload;
    if (payload?.purpose !== CONTACT_SURVEY_TOKEN_PURPOSE || !payload.contactId || !payload.surveyId) {
      return err({ type: "bad_request", details: [{ field: "token", issue: "invalid_token" }] });
    }
    return ok({
      contactId: symmetricDecrypt(payload.contactId, secrets.encryptionKey),
      surveyId: payload.surveyId,
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return err({ type: "bad_request", details: [{ field: "token", issue: "token_expired" }] });
    }
    logger.debug({ error }, "Invalid contact survey token");
    return err({ type: "bad_request", details: [{ field: "token", issue: "invalid_token" }] });
  }
};
