"use client";

import { ArrowDownIcon, ArrowUpIcon, MailIcon, TrashIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type TWorkflowSendEmailActionConfig,
  type TWorkflowSendEmailActionNode,
  getBlankSendEmailContentFields,
} from "@formbricks/workflows";
import type { TWorkflowEmailAuthoringContext } from "@/modules/fsinf-ce/workflows/types/email-authoring-context";
import FollowUpActionMultiEmailInput from "@/modules/survey/follow-ups/components/follow-up-action-multi-email-input";
import {
  buildEmailSendToOptions,
  findEmailSendToOption,
} from "@/modules/survey/follow-ups/lib/email-send-to-options";
import { sanitizeFollowUpBody } from "@/modules/survey/follow-ups/lib/sanitize-follow-up-body";
import { AdvancedOptionToggle } from "@/modules/ui/components/advanced-option-toggle";
import { Button } from "@/modules/ui/components/button";
import { Editor } from "@/modules/ui/components/editor";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

/**
 * FSINF CE: form of one `send_email` step — the same fields as survey Follow-Ups (recipient from the
 * survey's email answers / hidden fields or a workspace member, reply-to, subject, recall-enabled
 * body, response-data attachments). Edits go straight into the definition draft (autosaved).
 */
export const SendEmailStepForm = ({
  node,
  index,
  total,
  context,
  isEditable,
  hasProblem,
  onConfigChange,
  onMove,
  onRemove,
}: Readonly<{
  node: TWorkflowSendEmailActionNode;
  index: number;
  total: number;
  context: TWorkflowEmailAuthoringContext;
  isEditable: boolean;
  hasProblem: boolean;
  onConfigChange: (patch: Partial<TWorkflowSendEmailActionConfig>) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}>) => {
  const { t } = useTranslation();
  const { config } = node;
  const [firstRender, setFirstRender] = useState(true);
  // Lexical reports its content on every update, including the initial load; only edits after the
  // author focused the body may change the draft (otherwise opening a workflow would autosave it).
  const bodyTouchedRef = useRef(false);
  const survey = context.boundSurvey;

  const sendToOptions = useMemo(
    () =>
      survey
        ? buildEmailSendToOptions({
            survey,
            teamMemberDetails: context.workspaceMembers,
            userEmail: context.userEmail,
            selectedLanguageCode: "default",
            t,
          })
        : [],
    [survey, context.workspaceMembers, context.userEmail, t]
  );

  const selectedOption = findEmailSendToOption(sendToOptions, config.to);
  const isRecipientUnavailable = config.to !== "" && !selectedOption;
  const blankFields = new Set(getBlankSendEmailContentFields(config));
  const responseOptions = sendToOptions.filter((option) => option.type !== "user");
  const memberOptions = sendToOptions.filter((option) => option.type === "user");

  const summary =
    config.to && selectedOption
      ? t("workspace.workflows.send_email_summary", { to: selectedOption.label })
      : t("workspace.workflows.send_email_unconfigured");

  return (
    <section
      id={`workflow-node-${node.id}`}
      className={`space-y-4 rounded-xl border bg-white p-4 shadow-2xs ${hasProblem ? "border-amber-300" : "border-slate-200"}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-slate-100 p-2">
            <MailIcon className="size-4 text-slate-700" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              {t("workspace.workflows.step_number", { number: index + 1 })}
            </p>
            <h2 className="text-base font-semibold text-slate-900">
              {node.label ?? t("workspace.workflows.send_email")}
            </h2>
            <p className="text-sm text-slate-500">{summary}</p>
          </div>
        </div>
        {isEditable ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common.move_up")}
              disabled={index === 0}
              onClick={() => onMove("up")}>
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("common.move_down")}
              disabled={index === total - 1}
              onClick={() => onMove("down")}>
              <ArrowDownIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={onRemove}>
              <TrashIcon />
            </Button>
          </div>
        ) : null}
      </header>

      {survey ? null : (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          {t("workspace.workflows.email_needs_survey")}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor={`workflow-email-to-${node.id}`}>{t("workspace.workflows.email_to_label")}</Label>
        <Select
          value={selectedOption?.id ?? (config.to || undefined)}
          disabled={!isEditable || !survey}
          onValueChange={(value) => onConfigChange({ to: value })}>
          <SelectTrigger
            id={`workflow-email-to-${node.id}`}
            className={`max-w-md bg-white ${blankFields.has("to") || isRecipientUnavailable ? "border-red-300" : ""}`}>
            <SelectValue placeholder={t("workspace.workflows.email_to_placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {responseOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>{t("common.response")}</SelectLabel>
                {responseOptions.map((option) => (
                  <SelectItem key={`${option.type}-${option.id}`} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {memberOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>{t("common.recipients")}</SelectLabel>
                {memberOptions.map((option) => (
                  <SelectItem key={`${option.type}-${option.id}`} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {isRecipientUnavailable ? (
              <SelectGroup>
                <SelectLabel>{t("workspace.workflows.email_to_unavailable_group_label")}</SelectLabel>
                <SelectItem value={config.to} disabled>
                  {config.to}
                </SelectItem>
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
        {isRecipientUnavailable ? (
          <p className="text-sm text-amber-700">{t("workspace.workflows.email_to_unavailable_warning")}</p>
        ) : null}
        {blankFields.has("to") ? (
          <p className="text-sm text-red-500">{t("workspace.workflows.email_to_required")}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{t("workspace.workflows.email_reply_to_label")}</Label>
        <FollowUpActionMultiEmailInput
          emails={config.replyTo}
          disabled={!isEditable}
          setEmails={(value) =>
            onConfigChange({ replyTo: typeof value === "function" ? value(config.replyTo) : value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`workflow-email-subject-${node.id}`}>
          {t("workspace.workflows.email_subject_label")}
        </Label>
        <Input
          id={`workflow-email-subject-${node.id}`}
          className="max-w-md"
          value={config.subject}
          maxLength={998}
          disabled={!isEditable}
          placeholder={t("workspace.workflows.email_subject_placeholder")}
          isInvalid={blankFields.has("subject")}
          onChange={(event) => onConfigChange({ subject: event.target.value })}
        />
        {blankFields.has("subject") ? (
          <p className="text-sm text-red-500">{t("workspace.workflows.email_subject_required")}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>{t("workspace.workflows.email_body_label")}</Label>
        {survey ? (
          <div
            onFocusCapture={() => {
              bodyTouchedRef.current = true;
            }}>
            <Editor
              disableLists
              excludedToolbarItems={["blockType"]}
              getText={() => config.body}
              setText={(value: string) => {
                if (!bodyTouchedRef.current || !isEditable) return;
                const body = sanitizeFollowUpBody(value);
                if (body !== config.body) onConfigChange({ body });
              }}
              firstRender={firstRender}
              setFirstRender={setFirstRender}
              editable={isEditable}
              placeholder={t("workspace.workflows.email_body_placeholder")}
              isInvalid={blankFields.has("body")}
              localSurvey={survey}
              elementId={`workflow-${node.id}`}
              selectedLanguageCode="default"
            />
          </div>
        ) : null}
        {blankFields.has("body") ? (
          <p className="text-sm text-red-500">{t("workspace.workflows.email_body_required")}</p>
        ) : null}
      </div>

      <AdvancedOptionToggle
        htmlId={`workflow-email-attach-${node.id}`}
        isChecked={config.attachResponseData}
        disabled={!isEditable}
        onToggle={(checked) => onConfigChange({ attachResponseData: checked })}
        title={t("workspace.workflows.email_attach_response_data_label")}
        description={t("workspace.workflows.email_attach_response_data_description")}
        childBorder>
        <div className="flex flex-col gap-3 p-4">
          <AdvancedOptionToggle
            htmlId={`workflow-email-variables-${node.id}`}
            isChecked={config.includeVariables ?? false}
            disabled={!isEditable}
            onToggle={(checked) => onConfigChange({ includeVariables: checked })}
            title={t("workspace.workflows.email_include_variables_label")}
            description=""
          />
          <AdvancedOptionToggle
            htmlId={`workflow-email-hidden-fields-${node.id}`}
            isChecked={config.includeHiddenFields ?? false}
            disabled={!isEditable}
            onToggle={(checked) => onConfigChange({ includeHiddenFields: checked })}
            title={t("workspace.workflows.email_include_hidden_fields_label")}
            description=""
          />
        </div>
      </AdvancedOptionToggle>
    </section>
  );
};
