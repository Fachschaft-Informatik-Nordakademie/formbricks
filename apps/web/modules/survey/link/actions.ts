"use server";

import { z } from "zod";
import { ZLinkSurveyEmailData } from "@formbricks/types/email";
import { InvalidInputError, ResourceNotFoundError } from "@formbricks/types/errors";
import { actionClient } from "@/lib/utils/action-client";
import { applyIPRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { sendLinkSurveyToVerifiedEmail } from "@/modules/email";
import { getSurveyWithMetadata, isSurveyResponsePresent } from "@/modules/survey/link/lib/data";
import { getPageAccess } from "@/modules/survey/link/lib/fsinf-respondent-sso/page-gate";
import { checkAndValidateSingleUseId } from "@/modules/survey/link/lib/helper";
import { createLinkSurveyPinToken } from "@/modules/survey/link/lib/pin-token";
import { isLinkSurveyOpenForResponses } from "@/modules/survey/link/lib/public-access";

/**
 * Loads the survey behind one of the link page's public, session-less actions. A survey respondents can't
 * take right now (draft, scheduled, paused, completed, archived, non-link) is "not found", with the same
 * error as an unknown id, before anything else is checked (upstream ENG-4032, Formbricks 6.1.2).
 */
const getSurveyOpenForResponses = async (surveyId: string) => {
  const survey = await getSurveyWithMetadata(surveyId);
  if (!survey || !isLinkSurveyOpenForResponses(survey)) {
    throw new ResourceNotFoundError("Survey", surveyId);
  }
  return survey;
};

export const sendLinkSurveyEmailAction = actionClient
  .inputSchema(ZLinkSurveyEmailData)
  .action(async ({ parsedInput }) => {
    await applyIPRateLimit(rateLimitConfigs.actions.sendLinkSurveyEmail);

    const survey = await getSurveyOpenForResponses(parsedInput.surveyId);

    if (!survey.isVerifyEmailEnabled) {
      throw new InvalidInputError("EMAIL_VERIFICATION_NOT_ENABLED");
    }

    // FSINF CE: no organization email logo (whitelabel is not part of this build) — default logo.
    await sendLinkSurveyToVerifiedEmail({ ...parsedInput, logoUrl: "" });
    return { success: true };
  });

const ZValidateSurveyPinAction = z.object({
  surveyId: z.cuid2(),
  pin: z.string(),
  // The single-use link the page was opened with; required when the survey is single-use (ENG-4041).
  suId: z.string().max(1024).optional(),
  suToken: z.string().max(1024).optional(),
});

export const validateSurveyPinAction = actionClient
  .inputSchema(ZValidateSurveyPinAction)
  .action(async ({ parsedInput }) => {
    await applyIPRateLimit(rateLimitConfigs.actions.validateSurveyPin);

    // Every gate the page applies runs before the PIN comparison: this action returns the full survey
    // definition, so it must not be a way around the page, and a hidden survey can't be probed for its PIN.
    const survey = await getSurveyOpenForResponses(parsedInput.surveyId);

    // Single-use: without a valid link the page shows "link invalid", so this answers "not found" (ENG-4041).
    if (
      survey.singleUse?.enabled &&
      !checkAndValidateSingleUseId(
        parsedInput.suId,
        survey.singleUse.isEncrypted,
        survey.id,
        parsedInput.suToken
      )
    ) {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }

    // FSINF: an SSO-only survey shows its questions only to an allowed, signed-in respondent.
    if (survey.fsinfSso?.enabled && (await getPageAccess(survey)).kind !== "allowed") {
      throw new ResourceNotFoundError("Survey", parsedInput.surveyId);
    }

    const surveyPin = survey.pin;
    const originalPin = surveyPin?.toString();

    if (!originalPin) return { survey };
    if (originalPin !== parsedInput.pin) {
      throw new InvalidInputError("INVALID_PIN");
    }

    return { survey, pinAuthToken: createLinkSurveyPinToken(survey.id) };
  });

const ZIsSurveyResponsePresentAction = z.object({
  surveyId: z.cuid2(),
  email: z.email(),
});

export const isSurveyResponsePresentAction = actionClient
  .inputSchema(ZIsSurveyResponsePresentAction)
  .action(async ({ parsedInput }) => {
    await applyIPRateLimit(rateLimitConfigs.actions.isSurveyResponsePresent);

    const survey = await getSurveyOpenForResponses(parsedInput.surveyId);

    if (!survey.isSingleResponsePerEmailEnabled) {
      throw new InvalidInputError("SINGLE_RESPONSE_PER_EMAIL_NOT_ENABLED");
    }

    return await isSurveyResponsePresent(parsedInput.surveyId, parsedInput.email)();
  });
