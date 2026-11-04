"use client";

import { ZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TWorkflowDefinition } from "@formbricks/workflows";
import { setResponseCompletedTrigger } from "@/modules/fsinf-ce/workflows/lib/editor/definition";
import type { TWorkflowSurveyOption } from "@/modules/fsinf-ce/workflows/types/email-authoring-context";
import { Checkbox } from "@/modules/ui/components/checkbox";
import { Label } from "@/modules/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@/modules/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";

/**
 * FSINF CE: trigger step of the builder. `response.completed` is the only trigger type the schema
 * defines: pick the survey and optionally restrict to specific ending cards.
 */
export const TriggerForm = ({
  definition,
  surveys,
  isEditable,
  hasProblem,
  onChange,
}: Readonly<{
  definition: TWorkflowDefinition;
  surveys: TWorkflowSurveyOption[];
  isEditable: boolean;
  hasProblem: boolean;
  onChange: (update: (definition: TWorkflowDefinition) => TWorkflowDefinition) => void;
}>) => {
  const { t } = useTranslation();
  const trigger = definition.trigger;
  const surveyId = trigger?.config.surveyId;
  const endingCardIds = trigger?.config.endingCardIds ?? [];
  const selectedSurvey = surveys.find((survey) => survey.id === surveyId);
  const scope = endingCardIds.length > 0 ? "specific" : "all";

  const setConfig = (config: { surveyId: string; endingCardIds: string[] }) =>
    onChange((current) => setResponseCompletedTrigger(current, config));

  const summary = !trigger
    ? t("workspace.workflows.node_needs_survey")
    : endingCardIds.length > 0
      ? t("workspace.workflows.trigger_summary_ending_cards", { count: endingCardIds.length })
      : t("workspace.workflows.trigger_summary_all_endings");

  return (
    <section
      id="workflow-node-trigger"
      className={`space-y-4 rounded-xl border bg-white p-4 shadow-2xs ${hasProblem ? "border-amber-300" : "border-slate-200"}`}>
      <header className="flex items-start gap-3">
        <div className="rounded-md bg-slate-100 p-2">
          <ZapIcon className="size-4 text-slate-700" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{t("common.trigger")}</p>
          <h2 className="text-base font-semibold text-slate-900">
            {t("workspace.workflows.response_completed")}
          </h2>
          <p className="text-sm text-slate-500">
            {trigger ? summary : t("workspace.workflows.response_completed_description")}
          </p>
        </div>
      </header>

      <div className="space-y-2">
        <Label htmlFor="workflow-trigger-survey">{t("workspace.workflows.trigger_survey_label")}</Label>
        <p className="text-sm text-slate-500">{t("workspace.workflows.trigger_survey_description")}</p>
        {surveys.length === 0 ? (
          <p className="text-sm text-slate-500">{t("workspace.workflows.trigger_survey_empty")}</p>
        ) : (
          <Select
            value={surveyId}
            disabled={!isEditable}
            onValueChange={(value) => {
              // Endings belong to one survey; switching surveys resets the scope to "all endings".
              setConfig({ surveyId: value, endingCardIds: value === surveyId ? endingCardIds : [] });
            }}>
            <SelectTrigger id="workflow-trigger-survey" className="max-w-md bg-white">
              <SelectValue placeholder={t("workspace.workflows.trigger_survey_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {surveys.map((survey) => (
                <SelectItem key={survey.id} value={survey.id}>
                  {survey.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {trigger ? (
        <div className="space-y-2">
          <Label>{t("workspace.workflows.trigger_ending_cards_label")}</Label>
          {!selectedSurvey ? (
            <p className="text-sm text-slate-500">
              {t("workspace.workflows.trigger_ending_cards_pick_survey")}
            </p>
          ) : selectedSurvey.endings.length === 0 ? (
            <p className="text-sm text-slate-500">{t("workspace.workflows.trigger_ending_cards_none")}</p>
          ) : (
            <>
              <RadioGroup
                value={scope}
                disabled={!isEditable}
                className="flex gap-6"
                onValueChange={(value) => {
                  setConfig({
                    surveyId: selectedSurvey.id,
                    endingCardIds: value === "all" ? [] : selectedSurvey.endings.slice(0, 1).map((e) => e.id),
                  });
                }}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="workflow-trigger-scope-all" />
                  <Label htmlFor="workflow-trigger-scope-all">
                    {t("workspace.workflows.trigger_ending_cards_scope_all")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="specific" id="workflow-trigger-scope-specific" />
                  <Label htmlFor="workflow-trigger-scope-specific">
                    {t("workspace.workflows.trigger_ending_cards_scope_specific")}
                  </Label>
                </div>
              </RadioGroup>

              {scope === "specific" ? (
                <div className="space-y-2 rounded-lg border border-slate-100 p-3">
                  {selectedSurvey.endings.map((ending) => {
                    const checked = endingCardIds.includes(ending.id);
                    return (
                      <div key={ending.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`workflow-ending-${ending.id}`}
                          checked={checked}
                          disabled={!isEditable || (checked && endingCardIds.length === 1)}
                          onCheckedChange={(value) =>
                            setConfig({
                              surveyId: selectedSurvey.id,
                              endingCardIds: value
                                ? [...endingCardIds, ending.id]
                                : endingCardIds.filter((id) => id !== ending.id),
                            })
                          }
                        />
                        <Label htmlFor={`workflow-ending-${ending.id}`}>{ending.label}</Label>
                      </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">
                    {t("workspace.workflows.trigger_ending_cards_select_at_least_one")}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
};
