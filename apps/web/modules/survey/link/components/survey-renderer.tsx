import { notFound } from "next/navigation";
import { type Response } from "@formbricks/database/prisma-browser";
import { normalizeLanguageCode } from "@formbricks/i18n-utils/src/canonical";
import { TSurvey, TSurveyStyling } from "@formbricks/types/surveys/types";
import { TUserLocale } from "@formbricks/types/user";
import { TWorkspaceStyling } from "@formbricks/types/workspace";
import {
  IMPRINT_URL,
  IS_FORMBRICKS_CLOUD,
  IS_RECAPTCHA_CONFIGURED,
  PRIVACY_URL,
  RECAPTCHA_SITE_KEY,
  TERMS_URL,
} from "@/lib/constants";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { getIsContactsEnabled } from "@/modules/ee/license-check/lib/utils";
import { FsinfFingerprintConsentScreen } from "@/modules/survey/link/components/fsinf-fingerprint-consent-screen";
import { FsinfRespondentSsoScreen } from "@/modules/survey/link/components/fsinf-respondent-sso-screen";
import { PinScreen } from "@/modules/survey/link/components/pin-screen";
import { SurveyClientWrapper } from "@/modules/survey/link/components/survey-client-wrapper";
import { SurveyCompletedMessage } from "@/modules/survey/link/components/survey-completed-message";
import { SurveyInactive } from "@/modules/survey/link/components/survey-inactive";
import { VerifyEmail } from "@/modules/survey/link/components/verify-email";
import { getResponseBySingleUseId } from "@/modules/survey/link/lib/data";
import { getFingerprintDecision } from "@/modules/survey/link/lib/fsinf-device-fingerprint/page-gate";
import { RESPONDENT_SSO_ERROR_PARAM } from "@/modules/survey/link/lib/fsinf-respondent-sso/oidc";
import { buildLoginLinks, getPageAccess } from "@/modules/survey/link/lib/fsinf-respondent-sso/page-gate";
import { getEmailVerificationDetails } from "@/modules/survey/link/lib/helper";
import type { TLinkSurveySearchParams } from "@/modules/survey/link/lib/types";
import { hasUserIdSearchParam } from "@/modules/survey/link/lib/user-id";
import { TWorkspaceContextForLinkSurvey } from "@/modules/survey/link/lib/workspace";

interface SurveyRendererProps {
  survey: TSurvey;
  searchParams: TLinkSurveySearchParams;
  singleUseId?: string;
  singleUseResponse?: Pick<Response, "id" | "finished">;
  contactId?: string;
  allowUrlUserIdLookup?: boolean;
  isPreview: boolean;
  // New props - pre-fetched in parent
  workspaceContext: TWorkspaceContextForLinkSurvey;
  locale: TUserLocale;
  responseCount?: number;
}

/**
 * Renders link survey with pre-fetched data from parent.
 *
 * This function receives all necessary data as props to avoid additional
 * database queries. The parent (page.tsx) fetches data in parallel stages
 * to minimize latency for users geographically distant from servers.
 *
 * @param workspaceContext - Pre-fetched workspace and organization data
 * @param locale - User's locale from Accept-Language header
 * @param responseCount - Conditionally fetched if showResponseCount is enabled
 */
export const renderSurvey = async ({
  survey,
  searchParams,
  singleUseId,
  singleUseResponse,
  contactId,
  allowUrlUserIdLookup = false,
  isPreview,
  workspaceContext,
  locale,
  responseCount,
}: SurveyRendererProps) => {
  const langParam = searchParams.lang;
  const isEmbed = searchParams.embed === "true";

  // Archived surveys are absent from the workspace for respondents — treat the public link as a
  // missing survey (same as a draft or non-link survey) rather than showing an inactive/scheduled state.
  if (survey.status === "draft" || survey.type !== "link" || survey.archivedAt) {
    notFound();
  }

  // Extract workspace from pre-fetched context
  const { workspace } = workspaceContext;

  // Every prop passed to a client component is serialized into the RSC payload and readable in the
  // page source, so the survey handed to them must never carry the PIN — the pin gate itself stays
  // server-side (see the `survey.pin` branch below and `validateSurveyPinAction`).
  // FSINF: likewise the SSO allowlist — who may answer is nobody else's business.
  const publicSurvey: TSurvey = {
    ...survey,
    pin: null,
    fsinfSso: survey.fsinfSso ? { ...survey.fsinfSso, allowedGroups: [], allowedUsers: [] } : survey.fsinfSso,
  };

  const isSpamProtectionEnabled = Boolean(IS_RECAPTCHA_CONFIGURED && survey.recaptcha?.enabled);
  const isScheduled = survey.status === "paused" && survey.publishOn !== null;

  if (survey.status !== "inProgress") {
    return (
      <SurveyInactive
        status={survey.status}
        isScheduled={isScheduled}
        surveyClosedMessage={survey.surveyClosedMessage}
        workspace={workspace}
      />
    );
  }

  // Check if single-use survey has already been completed
  if (singleUseResponse?.finished) {
    return <SurveyCompletedMessage singleUseMessage={survey.singleUse} workspace={workspace} />;
  }

  // FSINF: SSO-protected survey — only an allowed, signed-in NAK-Studis account gets past this point.
  // The response endpoints enforce the same decision server-side (fsinf-respondent-sso/gate.ts).
  // Deliberately NOT skipped for `?preview=true`: that is a public query parameter, and skipping on it
  // would show the questions to anyone who appends it. Editors preview inside the survey editor.
  if (survey.fsinfSso?.enabled) {
    const access = await getPageAccess(survey);
    if (access.kind !== "allowed") {
      const { loginUrl, switchAccountUrl } = buildLoginLinks(survey.id, searchParams);
      const error = searchParams[RESPONDENT_SSO_ERROR_PARAM];
      return (
        <FsinfRespondentSsoScreen
          mode={access.kind}
          surveyName={survey.name}
          loginUrl={loginUrl}
          switchAccountUrl={switchAccountUrl}
          recordIdentity={survey.fsinfSso.recordIdentity}
          oneResponsePerUser={survey.fsinfSso.oneResponsePerUser && !survey.singleUse?.enabled}
          signedInAs={access.kind === "denied" ? access.signedInAs : undefined}
          error={typeof error === "string" ? error : undefined}
        />
      );
    }

    // One response per account: the pseudonym stands in for a single-use id, so a finished response
    // shows "already answered" and an unfinished one is continued instead of started over.
    if (access.singleUseId) {
      singleUseId = access.singleUseId;
      singleUseResponse = (await getResponseBySingleUseId(survey.id, access.singleUseId)()) ?? undefined;
      if (singleUseResponse?.finished) {
        return <SurveyInactive status="response submitted" workspace={workspace} />;
      }
    }
  }

  // FSINF: device fingerprint audit — ask for consent before the survey (log only, declining is fine).
  // After the SSO gate on purpose: nobody is asked about a survey they may not answer anyway.
  if (survey.fsinfFingerprint?.enabled && !(await getFingerprintDecision(survey.id))) {
    return (
      <FsinfFingerprintConsentScreen
        surveyId={survey.id}
        surveyName={survey.name}
        purpose={survey.fsinfFingerprint.purpose}
        publicDomain={getPublicDomain()}
        privacyUrl={PRIVACY_URL}
        imprintUrl={IMPRINT_URL}
      />
    );
  }

  // Handle email verification flow if enabled
  let emailVerificationStatus = "";
  let verifiedEmail: string | undefined = undefined;

  if (survey.isVerifyEmailEnabled) {
    const token = searchParams.verify;

    if (token) {
      const emailVerificationDetails = await getEmailVerificationDetails(survey.id, token);
      emailVerificationStatus = emailVerificationDetails.status;
      verifiedEmail = emailVerificationDetails.email;
    }
  }

  if (survey.isVerifyEmailEnabled && emailVerificationStatus !== "verified" && !isPreview) {
    if (emailVerificationStatus === "fishy") {
      return (
        <VerifyEmail
          survey={publicSurvey}
          isErrorComponent={true}
          languageCode={getLanguageCode(langParam, survey)}
          styling={workspace.styling}
          locale={locale}
        />
      );
    }
    return (
      <VerifyEmail
        singleUseId={searchParams.suId ?? ""}
        singleUseToken={searchParams.suToken}
        survey={publicSurvey}
        languageCode={getLanguageCode(langParam, survey)}
        styling={workspace.styling}
        locale={locale}
      />
    );
  }

  // Compute final styling based on workspace and survey settings
  const styling = computeStyling(workspace.styling, survey.styling);
  const languageCode = getLanguageCode(langParam, survey);
  const publicDomain = getPublicDomain();
  const canReadUserIdFromUrl =
    allowUrlUserIdLookup && !contactId && hasUserIdSearchParam(searchParams)
      ? await getIsContactsEnabled(workspaceContext.organizationId)
      : false;

  // Handle PIN-protected surveys
  if (survey.pin) {
    return (
      <PinScreen
        surveyId={survey.id}
        styling={styling}
        publicDomain={publicDomain}
        workspace={workspace}
        singleUseId={singleUseId}
        singleUseResponse={singleUseResponse}
        IMPRINT_URL={IMPRINT_URL}
        PRIVACY_URL={PRIVACY_URL}
        TERMS_URL={TERMS_URL}
        IS_FORMBRICKS_CLOUD={IS_FORMBRICKS_CLOUD}
        verifiedEmail={verifiedEmail}
        languageCode={languageCode}
        isEmbed={isEmbed}
        isPreview={isPreview}
        contactId={contactId}
        canReadUserIdFromUrl={canReadUserIdFromUrl}
        recaptchaSiteKey={RECAPTCHA_SITE_KEY}
        isSpamProtectionEnabled={isSpamProtectionEnabled}
        responseCount={responseCount}
      />
    );
  }

  // Render interactive survey with client component for interactivity
  return (
    <SurveyClientWrapper
      survey={publicSurvey}
      workspace={workspace}
      styling={styling}
      publicDomain={publicDomain}
      responseCount={responseCount}
      languageCode={languageCode}
      isEmbed={isEmbed}
      singleUseId={singleUseId}
      singleUseResponseId={singleUseResponse?.id}
      contactId={contactId}
      canReadUserIdFromUrl={canReadUserIdFromUrl}
      recaptchaSiteKey={RECAPTCHA_SITE_KEY}
      isSpamProtectionEnabled={isSpamProtectionEnabled}
      isPreview={isPreview}
      verifiedEmail={verifiedEmail}
      IMPRINT_URL={IMPRINT_URL}
      PRIVACY_URL={PRIVACY_URL}
      TERMS_URL={TERMS_URL}
      IS_FORMBRICKS_CLOUD={IS_FORMBRICKS_CLOUD}
    />
  );
};

/**
 * Determines which styling to use based on workspace and survey settings.
 * Returns survey styling if theme overwriting is enabled, otherwise returns workspace styling.
 */
function computeStyling(
  workspaceStyling: TWorkspaceStyling,
  surveyStyling?: TSurveyStyling | null
): TWorkspaceStyling | TSurveyStyling {
  if (!workspaceStyling.allowStyleOverwrite) {
    return workspaceStyling;
  }
  return surveyStyling?.overwriteThemeStyling ? surveyStyling : workspaceStyling;
}

/**
 * Determines the language code to use for the survey.
 * Checks URL parameter against available survey languages and returns
 * "default" if language is not found or disabled.
 */
function getLanguageCode(langParam: string | undefined, survey: TSurvey): string {
  if (!langParam) return "default";

  // Match the URL `?lang=` value against the survey's languages in strict precedence so selection is
  // deterministic regardless of array order: (1) an exact stored `code`, then (2) a custom `alias`, then
  // (3) canonical equivalence. Code beats alias because an exact code always lines up with the survey's
  // i18n content keys — without this, one row's alias could shadow another row's exact code. The canonical
  // pass lets a shared link with a legacy code (`?lang=pt`) still resolve to a migrated language (`pt-BR`).
  // Returns the survey's stored code so it lines up with its content keys.
  const langParamLower = langParam.toLowerCase();
  const langParamCanonical = normalizeLanguageCode(langParam);
  const selectedLanguage =
    survey.languages.find(
      (surveyLanguage) => surveyLanguage.language.code.toLowerCase() === langParamLower
    ) ??
    survey.languages.find(
      (surveyLanguage) => surveyLanguage.language.alias?.toLowerCase() === langParamLower
    ) ??
    (langParamCanonical
      ? survey.languages.find(
          (surveyLanguage) => normalizeLanguageCode(surveyLanguage.language.code) === langParamCanonical
        )
      : undefined);

  if (!selectedLanguage || selectedLanguage?.default || !selectedLanguage?.enabled) {
    return "default";
  }
  return selectedLanguage.language.code;
}
