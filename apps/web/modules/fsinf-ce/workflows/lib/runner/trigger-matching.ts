/**
 * FSINF CE: pure trigger evaluation for the workflow runner. Decides whether a completed survey
 * response fires a published workflow version and builds the trigger payload snapshot stored on the
 * run. No I/O — unit-tested.
 */
import {
  type TWorkflowExecutableDefinition,
  type TWorkflowTriggerRunPayload,
  WORKFLOW_TRIGGERS,
} from "@formbricks/workflows";

export interface TCompletedResponseRef {
  id: string;
  surveyId: string;
  finished: boolean;
  endingId?: string | null;
}

/**
 * A `response.completed` trigger fires for a finished response of its survey. With `endingCardIds`
 * set it only fires when the respondent reached one of those endings; an empty list means any ending
 * (including a response that finished without a recorded ending).
 */
export const matchesResponseCompletedTrigger = (
  definition: TWorkflowExecutableDefinition,
  response: TCompletedResponseRef
): boolean => {
  const { trigger } = definition;
  if (trigger.triggerType !== WORKFLOW_TRIGGERS.RESPONSE_COMPLETED) {
    return false;
  }

  if (!response.finished || trigger.config.surveyId !== response.surveyId) {
    return false;
  }

  const endingCardIds = trigger.config.endingCardIds ?? [];
  if (endingCardIds.length === 0) {
    return true;
  }

  return !!response.endingId && endingCardIds.includes(response.endingId);
};

export const buildResponseCompletedTriggerPayload = ({
  workspaceId,
  response,
  triggeredAt,
}: {
  workspaceId: string;
  response: TCompletedResponseRef;
  triggeredAt: Date;
}): TWorkflowTriggerRunPayload => ({
  type: WORKFLOW_TRIGGERS.RESPONSE_COMPLETED,
  workspaceId,
  surveyId: response.surveyId,
  responseId: response.id,
  ...(response.endingId ? { endingCardId: response.endingId } : {}),
  triggeredAt: triggeredAt.toISOString(),
});
