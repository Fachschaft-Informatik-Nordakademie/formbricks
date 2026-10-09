import "server-only";
import type { TSurvey } from "@formbricks/types/surveys/types";
import { readFingerprintToken } from "./token";
import { FSINF_FP_RESPONSE_KEYS, FSINF_FP_RESPONSE_KEY_LIST } from "./traits";

/**
 * FSINF: attaches the device fingerprint audit entry to a new response (v1 POST, v2 POST). Never
 * rejects: the feature is a log for a later audit, not an access control. A response without a valid
 * cookie (no consent step, expired, or posted straight to the API) is recorded as "missing" — which is
 * itself worth seeing in an audit.
 */

type TFingerprintSurvey = Pick<TSurvey, "id" | "fsinfFingerprint">;

export const dropFingerprintKeys = (data: Record<string, unknown> | undefined | null): void => {
  if (!data) return;
  for (const key of FSINF_FP_RESPONSE_KEY_LIST) {
    delete data[key];
  }
};

export const applyDeviceFingerprint = ({
  survey,
  data,
  token,
}: {
  survey: TFingerprintSurvey;
  data: Record<string, unknown>;
  token: string | undefined | null;
}): void => {
  dropFingerprintKeys(data);
  if (!survey.fsinfFingerprint?.enabled) return;

  const decision = readFingerprintToken(token, survey.id);
  if (!decision) {
    data[FSINF_FP_RESPONSE_KEYS.status] = "missing";
    return;
  }
  data[FSINF_FP_RESPONSE_KEYS.status] = decision.status;
  if (decision.status === "recorded") {
    data[FSINF_FP_RESPONSE_KEYS.device] = decision.device;
    data[FSINF_FP_RESPONSE_KEYS.browser] = decision.browser;
    data[FSINF_FP_RESPONSE_KEYS.info] = decision.info;
  }
};
