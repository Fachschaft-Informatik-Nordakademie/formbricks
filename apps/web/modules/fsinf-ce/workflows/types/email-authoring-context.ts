import type { TSurvey } from "@formbricks/types/surveys/types";
import type { TFollowUpEmailToUser } from "@/modules/survey/editor/types/survey-follow-up";

/**
 * FSINF CE: server-resolved data the workflow builder needs to render its trigger and `send_email`
 * forms. Resolved per page load (the builder refreshes it after the trigger survey changes).
 */
export interface TWorkflowSurveyOption {
  id: string;
  name: string;
  status: string;
  endings: { id: string; label: string }[];
}

export interface TWorkflowEmailAuthoringContext {
  /** Every survey of the workspace, for the trigger survey picker. */
  surveys: TWorkflowSurveyOption[];
  /** The full survey the trigger is bound to (recall editor, recipient options), or null. */
  boundSurvey: TSurvey | null;
  /** People who can access the workspace — the only literal recipients the runner accepts. */
  workspaceMembers: TFollowUpEmailToUser[];
  /** Email of the signed-in user ("Yourself" in the recipient picker). */
  userEmail: string;
  /** Deployment sender address, stored as the vestigial `from` of new email steps. */
  mailFrom: string;
}
