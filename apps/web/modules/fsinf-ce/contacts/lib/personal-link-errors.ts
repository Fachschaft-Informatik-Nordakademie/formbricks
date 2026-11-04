/**
 * FSINF CE: stable error codes for personal-link generation, translated on the client.
 */
import type { TFunction } from "i18next";

export const NO_CONTACTS_IN_SEGMENT_ERROR_CODE = "NO_CONTACTS_IN_SEGMENT";
export const SEGMENT_SURVEY_WORKSPACE_MISMATCH_ERROR_CODE = "SEGMENT_SURVEY_WORKSPACE_MISMATCH";

/** Maps a server error message/code to a translated text; unknown messages pass through unchanged. */
export const getTranslatedPersonalLinkError = (message: string, t: TFunction): string => {
  if (message === NO_CONTACTS_IN_SEGMENT_ERROR_CODE) {
    return t("workspace.surveys.share.personal_links.no_contacts_in_segment");
  }
  if (message === SEGMENT_SURVEY_WORKSPACE_MISMATCH_ERROR_CODE) {
    return t("workspace.surveys.share.personal_links.segment_survey_workspace_mismatch");
  }
  return message;
};
