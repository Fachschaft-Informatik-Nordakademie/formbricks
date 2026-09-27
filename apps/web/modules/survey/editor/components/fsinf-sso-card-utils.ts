import type { TSurveyFsinfSso } from "@formbricks/types/surveys/types";

export type TFsinfSsoConfig = NonNullable<TSurveyFsinfSso>;

/** Users are typed one per line (or comma/semicolon separated) — usernames or email addresses. */
export const parseHandleList = (text: string): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const entry = raw.trim();
    if (!entry || seen.has(entry.toLowerCase())) continue;
    seen.add(entry.toLowerCase());
    result.push(entry);
  }
  return result;
};

export const formatHandleList = (entries: readonly string[]): string => entries.join("\n");

/** Surveys created before the column existed (or via API) may carry null or a partial object. */
export const withFsinfSsoDefaults = (config: TSurveyFsinfSso | undefined): TFsinfSsoConfig => ({
  enabled: config?.enabled ?? false,
  allowedGroups: config?.allowedGroups ?? [],
  allowedUsers: config?.allowedUsers ?? [],
  recordIdentity: config?.recordIdentity ?? false,
  oneResponsePerUser: config?.oneResponsePerUser ?? true,
});
