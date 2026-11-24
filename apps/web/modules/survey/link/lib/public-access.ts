import type { TSurvey } from "@formbricks/types/surveys/types";

// FSINF: ported from upstream Formbricks 6.1.2 (ENG-4032, AGPL part), reduced to what this fork's public
// link-survey actions need.
export type TLinkSurveyAccessFields = Pick<TSurvey, "type" | "status"> & { archivedAt?: Date | null };

/**
 * Whether a link survey is taking responses: the only state in which the page shows the PIN or
 * email-verification gate, so the only state in which their public, session-less actions may act on it.
 * Drafts, scheduled, paused, completed, archived and non-link surveys never leave their definition there.
 */
export const isLinkSurveyOpenForResponses = (survey: TLinkSurveyAccessFields): boolean =>
  survey.type === "link" && survey.status === "inProgress" && !survey.archivedAt;
