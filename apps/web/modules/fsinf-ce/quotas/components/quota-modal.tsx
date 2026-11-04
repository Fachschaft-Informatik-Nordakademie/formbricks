"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createId } from "@paralleldrive/cuid2";
import { TFunction } from "i18next";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { TSurveyQuota, TSurveyQuotaInput, ZSurveyQuotaInput } from "@formbricks/types/quota";
import { TSurvey } from "@formbricks/types/surveys/types";
import { getTextContent } from "@formbricks/types/surveys/validation";
import { recallToHeadline } from "@/lib/utils/recall";
import {
  createSharedConditionsFactory,
  genericConditionsToQuota,
  quotaConditionsToGeneric,
} from "@/modules/survey/editor/lib/shared-conditions-factory";
import { getDefaultOperatorForElement } from "@/modules/survey/editor/lib/utils";
import { getElementsFromBlocks } from "@/modules/survey/lib/client-utils";
import { Button } from "@/modules/ui/components/button";
import { ConditionsEditor } from "@/modules/ui/components/conditions-editor";
import type {
  TConditionsEditorCallbacks,
  TConditionsEditorConfig,
} from "@/modules/ui/components/conditions-editor/types";
import { ConfirmationModal } from "@/modules/ui/components/confirmation-modal";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { FormControl, FormError, FormField, FormItem, FormProvider } from "@/modules/ui/components/form";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";
import { Switch } from "@/modules/ui/components/switch";

/**
 * FSINF CE: create/edit dialog for one survey quota (name, limit, inclusion criteria, what happens when
 * the quota is full, partial-submission counting). Conditions use the shared survey-logic conditions
 * editor, so quotas support exactly the operators the survey logic supports.
 */

export type TQuotaModalSubmit = {
  input: TSurveyQuotaInput;
  /** Save as a new quota instead of changing the edited one (offered when criteria of a live quota change). */
  asNewQuota: boolean;
};

interface QuotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localSurvey: TSurvey;
  /** The quota being edited, or null to create a new one. */
  quota: TSurveyQuota | null;
  /** Responses currently counted for the edited quota; the limit may not go below this. */
  screenedInCount?: number;
  hasResponses: boolean;
  isSaving: boolean;
  onSubmit: (submit: TQuotaModalSubmit) => Promise<boolean>;
}

const buildDefaultValues = (
  localSurvey: TSurvey,
  quota: TSurveyQuota | null,
  t: TFunction
): TSurveyQuotaInput => {
  if (quota) {
    return {
      surveyId: quota.surveyId,
      name: quota.name,
      limit: quota.limit,
      logic: structuredClone(quota.logic),
      action: quota.action,
      endingCardId: quota.endingCardId,
      countPartialSubmissions: quota.countPartialSubmissions,
    };
  }

  const firstElement = getElementsFromBlocks(localSurvey.blocks)[0];
  const values: TSurveyQuotaInput = {
    surveyId: localSurvey.id,
    name: "",
    limit: 100,
    logic: {
      connector: "and",
      conditions: firstElement
        ? [
            {
              id: createId(),
              leftOperand: { type: "element", value: firstElement.id },
              operator: getDefaultOperatorForElement(firstElement, t),
            },
          ]
        : [],
    },
    action: "endSurvey",
    endingCardId: localSurvey.endings[0]?.id ?? null,
    countPartialSubmissions: false,
  };
  return values;
};

export const QuotaModal = ({
  open,
  onOpenChange,
  localSurvey,
  quota,
  screenedInCount = 0,
  hasResponses,
  isSaving,
  onSubmit,
}: Readonly<QuotaModalProps>) => {
  const { t } = useTranslation();
  const [pendingSubmit, setPendingSubmit] = useState<TSurveyQuotaInput | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);

  const form = useForm<TSurveyQuotaInput>({
    defaultValues: buildDefaultValues(localSurvey, quota, t),
    resolver: zodResolver(ZSurveyQuotaInput),
    mode: "onSubmit",
  });
  const { errors, isSubmitted, isDirty } = form.formState;

  const logic = form.watch("logic");
  const action = form.watch("action");

  const elements = getElementsFromBlocks(localSurvey.blocks);
  const { config, callbacks } = createSharedConditionsFactory(
    {
      survey: localSurvey,
      t,
      getDefaultOperator: () => (elements[0] ? getDefaultOperatorForElement(elements[0], t) : "equals"),
    },
    {
      onConditionsChange: (updater) => {
        const current = quotaConditionsToGeneric(form.getValues("logic"));
        form.setValue("logic", genericConditionsToQuota(updater(current)), {
          shouldDirty: true,
          shouldValidate: isSubmitted,
        });
      },
    }
  );

  const endingOptions = localSurvey.endings.map((ending) => {
    if (ending.type === "endScreen") {
      const headline = recallToHeadline(ending.headline ?? { default: "" }, localSurvey, false, "default");
      return {
        id: ending.id,
        label: getTextContent(headline.default ?? "") || t("workspace.surveys.edit.end_screen_card"),
      };
    }
    return { id: ending.id, label: ending.label || t("workspace.surveys.edit.redirect_thank_you_card") };
  });

  const finish = async (input: TSurveyQuotaInput, asNewQuota: boolean) => {
    const saved = await onSubmit({ input, asNewQuota });
    if (saved) {
      setPendingSubmit(null);
      onOpenChange(false);
    }
  };

  const criteriaChanged = (input: TSurveyQuotaInput) =>
    quota !== null && JSON.stringify(input.logic) !== JSON.stringify(quota.logic);

  const hasConditions = logic.conditions.length > 0;

  const handleValidSubmit: SubmitHandler<TSurveyQuotaInput> = async (input) => {
    if (input.logic.conditions.length === 0) return;
    if (quota && input.limit < screenedInCount) {
      form.setError("limit", {
        message: t(
          "workspace.surveys.edit.quotas.limit_must_be_greater_than_or_equal_to_the_number_of_responses",
          { value: screenedInCount }
        ),
      });
      return;
    }

    // Live survey: existing responses are never re-screened, so make that explicit before saving.
    if (hasResponses && (quota === null || criteriaChanged(input))) {
      setPendingSubmit(input);
      return;
    }
    await finish(input, false);
  };

  const requestClose = (nextOpen: boolean) => {
    if (!nextOpen && isDirty && !isSaving) {
      setIsLeaveConfirmOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const submitForm = () => void form.handleSubmit(handleValidSubmit)();

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent width="wide" disableCloseOnOutsideClick closeOnEscape>
          <DialogHeader>
            <DialogTitle>
              {quota
                ? t("workspace.surveys.edit.quotas.edit_quota")
                : t("workspace.surveys.edit.quotas.new_quota")}
            </DialogTitle>
            <DialogDescription>{t("common.quotas_description")}</DialogDescription>
          </DialogHeader>

          <FormProvider {...form}>
            <form
              id="fsinf-quota-form"
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                submitForm();
              }}>
              <DialogBody className="space-y-6 px-1">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <Label htmlFor="quota-name">{t("common.name")}</Label>
                        <FormControl>
                          <Input
                            id="quota-name"
                            {...field}
                            placeholder={t("workspace.surveys.edit.quotas.quota_name_placeholder")}
                            isInvalid={Boolean(errors.name)}
                          />
                        </FormControl>
                        <FormError />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="limit"
                    render={({ field }) => (
                      <FormItem>
                        <Label htmlFor="quota-limit">
                          {t("workspace.surveys.edit.quotas.response_limit")}
                        </Label>
                        <FormControl>
                          <Input
                            id="quota-limit"
                            type="number"
                            min={Math.max(1, screenedInCount)}
                            step={1}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={Number.isNaN(field.value) ? "" : field.value}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value === "" ? Number.NaN : Number(event.target.value)
                              )
                            }
                            isInvalid={Boolean(errors.limit)}
                          />
                        </FormControl>
                        <FormError />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("workspace.surveys.edit.quotas.inclusion_criteria")}</Label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <ConditionsEditor
                      conditions={quotaConditionsToGeneric(logic)}
                      config={config as TConditionsEditorConfig}
                      callbacks={callbacks as TConditionsEditorCallbacks}
                      quotaErrors={errors}
                      isSubmitted={isSubmitted}
                    />
                  </div>
                  {!hasConditions && (
                    <p className="text-sm text-error">
                      {t("workspace.surveys.edit.quotas.no_conditions_possible")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t("workspace.surveys.edit.quotas.when_quota_has_been_reached")}</Label>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Select
                      value={action}
                      onValueChange={(value) => {
                        const nextAction = value as TSurveyQuotaInput["action"];
                        form.setValue("action", nextAction, {
                          shouldDirty: true,
                          shouldValidate: isSubmitted,
                        });
                        if (nextAction === "continueSurvey") {
                          form.setValue("endingCardId", null, { shouldDirty: true });
                        } else if (!form.getValues("endingCardId")) {
                          form.setValue("endingCardId", endingOptions[0]?.id ?? null, { shouldDirty: true });
                        }
                      }}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="endSurvey">
                          {t("workspace.surveys.edit.quotas.end_survey_for_matching_participants")}
                        </SelectItem>
                        <SelectItem value="continueSurvey">
                          {t("workspace.surveys.edit.quotas.continue_survey_normally")}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {action === "endSurvey" && (
                      <Select
                        value={form.watch("endingCardId") ?? undefined}
                        onValueChange={(value) =>
                          form.setValue("endingCardId", value, {
                            shouldDirty: true,
                            shouldValidate: isSubmitted,
                          })
                        }>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder={t("workspace.surveys.edit.quotas.select_ending_card")} />
                        </SelectTrigger>
                        <SelectContent>
                          {endingOptions.map((ending) => (
                            <SelectItem key={ending.id} value={ending.id}>
                              {ending.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {errors.action?.message && <p className="text-sm text-error">{errors.action.message}</p>}
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <Switch
                    id="quota-count-partial"
                    checked={form.watch("countPartialSubmissions")}
                    onCheckedChange={(checked) =>
                      form.setValue("countPartialSubmissions", checked, { shouldDirty: true })
                    }
                  />
                  <div>
                    <Label htmlFor="quota-count-partial">
                      {t("workspace.surveys.edit.quotas.count_partial_submissions")}
                    </Label>
                    <p className="text-sm text-slate-500">
                      {t("workspace.surveys.edit.quotas.count_partial_submissions_description")}
                    </p>
                  </div>
                </div>
              </DialogBody>
            </form>
          </FormProvider>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => requestClose(false)} disabled={isSaving}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="fsinf-quota-form"
              loading={isSaving}
              disabled={isSaving || !hasConditions}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        open={pendingSubmit !== null}
        setOpen={(value) => {
          const nextOpen = typeof value === "function" ? value(pendingSubmit !== null) : value;
          if (!nextOpen) setPendingSubmit(null);
        }}
        title={
          quota
            ? t("workspace.surveys.edit.quotas.change_quota_for_public_survey")
            : t("workspace.surveys.edit.quotas.create_quota_for_public_survey")
        }
        description={
          quota
            ? t("workspace.surveys.edit.quotas.save_changes_confirmation_text")
            : t("workspace.surveys.edit.quotas.create_quota_for_public_survey_description")
        }
        body={
          <p className="whitespace-pre-line text-slate-700">
            {quota
              ? t("workspace.surveys.edit.quotas.save_changes_confirmation_body")
              : t("workspace.surveys.edit.quotas.create_quota_for_public_survey_text")}
          </p>
        }
        buttonText={t("common.save")}
        buttonLoading={isSaving}
        onConfirm={() => {
          if (pendingSubmit) void finish(pendingSubmit, false);
        }}
        secondaryButton={
          quota
            ? {
                text: t("workspace.surveys.edit.quotas.duplicate_quota"),
                variant: "secondary",
                disabled: isSaving,
                onAction: () => {
                  if (pendingSubmit) void finish(pendingSubmit, true);
                },
              }
            : undefined
        }
      />

      <ConfirmationModal
        open={isLeaveConfirmOpen}
        setOpen={setIsLeaveConfirmOpen}
        title={t("workspace.surveys.edit.quotas.confirm_quota_changes")}
        body={
          <p className="text-slate-700">{t("workspace.surveys.edit.quotas.confirm_quota_changes_body")}</p>
        }
        buttonText={t("common.save")}
        onConfirm={() => {
          setIsLeaveConfirmOpen(false);
          submitForm();
        }}
        secondaryButton={{
          text: t("common.discard"),
          variant: "secondary",
          onAction: () => {
            setIsLeaveConfirmOpen(false);
            form.reset(buildDefaultValues(localSurvey, quota, t));
            onOpenChange(false);
          },
        }}
      />
    </>
  );
};
