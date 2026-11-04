import "server-only";
import { prisma } from "@formbricks/database";
import { ZSurveyEndings } from "@formbricks/types/surveys/types";
import { getTextContent } from "@formbricks/types/surveys/validation";
import { ZWorkflowDefinition } from "@formbricks/workflows";
import { MAIL_FROM } from "@/lib/constants";
import { getLocalizedValue } from "@/lib/i18n/utils";
import { getSurvey } from "@/lib/survey/service";
import { getWorkspaceMembers } from "@/lib/workspace/service";
import type {
  TWorkflowEmailAuthoringContext,
  TWorkflowSurveyOption,
} from "@/modules/fsinf-ce/workflows/types/email-authoring-context";
import { getUserEmail } from "@/modules/survey/editor/lib/user";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

/**
 * FSINF CE: resolves the authoring context of the workflow builder page server-side: the workspace's
 * surveys (with ending labels) for the trigger form, the bound survey for the recall body editor and
 * recipient options, and the workspace members allowed as literal recipients.
 *
 * Every query is scoped to the workspace the caller was authorized for. An unknown workflow id simply
 * yields no bound survey; the client page then reports the API's 403 on its own.
 */

const FALLBACK_SENDER = "noreply@formbricks.com";

const getEndingLabel = (ending: ReturnType<typeof ZSurveyEndings.parse>[number], index: number): string => {
  if (ending.type === "endScreen") {
    const headline = getTextContent(getLocalizedValue(ending.headline, "default")).trim();
    if (headline) return headline;
  } else {
    const label = ending.label?.trim() || ending.url?.trim();
    if (label) return label;
  }
  return `#${index + 1}`;
};

const getWorkspaceSurveyOptions = async (workspaceId: string): Promise<TWorkflowSurveyOption[]> => {
  const surveys = await prisma.survey.findMany({
    where: { workspaceId },
    select: { id: true, name: true, status: true, endings: true },
    orderBy: { updatedAt: "desc" },
  });

  return surveys.map((survey) => {
    const parsedEndings = ZSurveyEndings.safeParse(survey.endings);
    return {
      id: survey.id,
      name: survey.name,
      status: survey.status,
      endings: parsedEndings.success
        ? parsedEndings.data.map((ending, index) => ({ id: ending.id, label: getEndingLabel(ending, index) }))
        : [],
    };
  });
};

const getBoundSurveyId = async (workflowId: string, workspaceId: string): Promise<string | null> => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, workspaceId },
    select: { definition: true },
  });
  if (!workflow) return null;

  const parsed = ZWorkflowDefinition.safeParse(workflow.definition);
  return parsed.success ? (parsed.data.trigger?.config.surveyId ?? null) : null;
};

export const getWorkflowEmailAuthoringContext = async ({
  workflowId,
  workspaceId,
}: {
  workflowId: string;
  workspaceId: string;
}): Promise<TWorkflowEmailAuthoringContext> => {
  const { session } = await getWorkspaceAuth(workspaceId);

  const [surveys, boundSurveyId, members, userEmail] = await Promise.all([
    getWorkspaceSurveyOptions(workspaceId),
    getBoundSurveyId(workflowId, workspaceId),
    getWorkspaceMembers(workspaceId),
    getUserEmail(session.user.id),
  ]);

  const boundSurvey = boundSurveyId ? await getSurvey(boundSurveyId) : null;

  return {
    surveys,
    boundSurvey: boundSurvey?.workspaceId === workspaceId ? boundSurvey : null,
    workspaceMembers: members.map((member) => ({ name: member.name, email: member.email })),
    userEmail: userEmail ?? "",
    mailFrom: MAIL_FROM ?? FALLBACK_SENDER,
  };
};
