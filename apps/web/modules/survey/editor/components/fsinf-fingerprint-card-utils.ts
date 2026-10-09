import {
  FSINF_FINGERPRINT_DEFAULT_PURPOSE,
  type TSurveyFsinfFingerprint,
} from "@formbricks/types/surveys/types";

export type TFsinfFingerprintConfig = NonNullable<TSurveyFsinfFingerprint>;

/**
 * Surveys created before the column existed (or via API) may carry null or a partial object. Does not
 * pre-fill: it runs on every edit, so clearing the text field would otherwise refill it instantly. An
 * empty purpose still shows the default text to respondents (fingerprintPurposeFor).
 */
export const withFingerprintDefaults = (
  config: TSurveyFsinfFingerprint | undefined
): TFsinfFingerprintConfig => ({ enabled: config?.enabled ?? false, purpose: config?.purpose ?? "" });

/** Toggle; switching on pre-fills the default text into an empty purpose. */
export const setFingerprintEnabled = (
  config: TFsinfFingerprintConfig,
  enabled: boolean
): TFsinfFingerprintConfig => ({
  enabled,
  purpose: enabled && !config.purpose.trim() ? FSINF_FINGERPRINT_DEFAULT_PURPOSE : config.purpose,
});
