import {
  FSINF_FINGERPRINT_DEFAULT_BANNER,
  type TSurveyFsinfFingerprint,
} from "@formbricks/types/surveys/types";

export type TFsinfFingerprintConfig = NonNullable<TSurveyFsinfFingerprint>;

/**
 * Surveys created before the column existed (or via API) may carry null or a partial object. Does not
 * pre-fill: it runs on every edit, so clearing the text field would otherwise refill it instantly. An
 * empty banner text still shows the generic default to respondents (fingerprintBannerFor).
 */
export const withFingerprintDefaults = (
  config: TSurveyFsinfFingerprint | undefined
): TFsinfFingerprintConfig => ({
  enabled: config?.enabled ?? false,
  purpose: config?.purpose ?? "",
  bannerText: config?.bannerText ?? "",
});

/** Toggle; switching on pre-fills the generic popup text into an empty banner text. */
export const setFingerprintEnabled = (
  config: TFsinfFingerprintConfig,
  enabled: boolean
): TFsinfFingerprintConfig => ({
  ...config,
  enabled,
  bannerText: enabled && !config.bannerText.trim() ? FSINF_FINGERPRINT_DEFAULT_BANNER : config.bannerText,
});
