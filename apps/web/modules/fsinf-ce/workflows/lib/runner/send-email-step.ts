import "server-only";
import type { TResponse } from "@formbricks/types/responses";
import type { TSurvey } from "@formbricks/types/surveys/types";
import type { TUserLocale } from "@formbricks/types/user";
import {
  type TWorkflowRunLogInput,
  type TWorkflowRunLogOutput,
  type TWorkflowSendEmailStep,
  getBlankSendEmailContentFields,
  isLiteralEmailRecipient,
} from "@formbricks/workflows";
import { normalizeEmailForComparison } from "@/lib/utils/email";
import { getWorkspaceMemberEmails } from "@/lib/workspace/service";
import { sendEmail } from "@/modules/email";
import {
  buildSurveyResponseEmailHtml,
  resolveResponseRecipient,
} from "@/modules/email/lib/survey-response-email";
import { buildWorkflowStepMessageId } from "./run-policy";

/**
 * FSINF CE: executes one `send_email` workflow step. Rendering and recipient resolution are the
 * same AGPL helpers survey Follow-Ups use, so a workflow email looks and resolves exactly like a
 * follow-up. Sending goes through the app's SMTP transport (`@/modules/email`).
 *
 * The step never throws for expected failures; it returns an outcome the run job maps to the run
 * status. Only a transport failure is `retryable` — a bad recipient or missing content does not get
 * better by retrying.
 */
export type TStepOutcome =
  | { status: "succeeded" | "skipped"; output: TWorkflowRunLogOutput }
  | { status: "failed"; error: string; retryable: boolean; output?: TWorkflowRunLogOutput };

export const buildSendEmailStepInput = (step: TWorkflowSendEmailStep): TWorkflowRunLogInput => ({
  to: step.node.config.to,
  recipientSource: isLiteralEmailRecipient(step.node.config.to) ? "literal" : "response_field",
  subject: step.node.config.subject,
  attachResponseData: step.node.config.attachResponseData,
});

export const executeSendEmailStep = async ({
  step,
  runId,
  workspaceId,
  isDryRun,
  survey,
  response,
  logoUrl,
  locale,
}: {
  step: TWorkflowSendEmailStep;
  runId: string;
  workspaceId: string;
  isDryRun: boolean;
  survey: TSurvey;
  response: TResponse;
  logoUrl?: string;
  locale: TUserLocale;
}): Promise<TStepOutcome> => {
  const { config } = step.node;

  const blankFields = getBlankSendEmailContentFields(config);
  if (blankFields.length > 0) {
    return {
      status: "failed",
      retryable: false,
      error: `Email step is missing: ${blankFields.join(", ")}`,
    };
  }

  // Send-time backstop of the enable-time allowlist: a literal recipient must still be able to
  // access the workspace whose response data this email carries.
  if (isLiteralEmailRecipient(config.to)) {
    const memberEmails = await getWorkspaceMemberEmails(workspaceId);
    if (!memberEmails.has(normalizeEmailForComparison(config.to))) {
      return {
        status: "failed",
        retryable: false,
        error: "The recipient cannot access this workspace anymore.",
      };
    }
  }

  const recipient = resolveResponseRecipient(config.to, response);
  if (!recipient.ok) {
    return { status: "failed", retryable: false, error: recipient.error };
  }

  const messageId = buildWorkflowStepMessageId({ runId, stepId: step.stepId, from: config.from });

  if (isDryRun) {
    return { status: "skipped", output: { dryRun: true, messageId } };
  }

  const html = await buildSurveyResponseEmailHtml({
    body: config.body,
    survey,
    response,
    attachResponseData: config.attachResponseData,
    includeVariables: config.includeVariables ?? false,
    includeHiddenFields: config.includeHiddenFields ?? false,
    logoUrl,
    locale,
  });

  let sent: boolean;
  try {
    sent = await sendEmail({
      to: recipient.email,
      ...(config.replyTo.length > 0 ? { replyTo: config.replyTo.join(", ") } : {}),
      subject: config.subject,
      html,
      messageId,
    });
  } catch (error) {
    return {
      status: "failed",
      retryable: true,
      error: error instanceof Error ? error.message : "Sending the email failed",
    };
  }

  if (!sent) {
    return { status: "failed", retryable: false, error: "SMTP is not configured on this instance." };
  }

  // The resolved address is deliberately not logged: for a response-field recipient it is the
  // respondent's personal email, and run logs are readable by every workspace member.
  return { status: "succeeded", output: { messageId } };
};
