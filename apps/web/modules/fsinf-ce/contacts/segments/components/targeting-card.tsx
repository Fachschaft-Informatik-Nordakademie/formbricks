"use client";

/**
 * FSINF CE: "Target audience" card of the survey editor. Edits the survey's segment: a private
 * (survey-owned) segment is edited in place and persisted with the survey; a shared segment is shown
 * read-only and can be cloned into a private copy. Unsaved surveys carry a "temp" segment that the
 * menu bar turns into a private segment on save.
 */
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Trans, useTranslation } from "react-i18next";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import type {
  TBaseFilters,
  TSegment,
  TSegmentCreateInput,
  TSegmentUpdateInput,
} from "@formbricks/types/segment";
import type { TSurvey } from "@formbricks/types/surveys/types";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { Button } from "@/modules/ui/components/button";
import { LoadSegmentModal } from "@/modules/ui/components/load-segment-modal";
import { SaveAsNewSegmentModal } from "@/modules/ui/components/save-as-new-segment-modal";
import {
  cloneSegmentAction,
  createSegmentAction,
  getSurveyRefsAction,
  loadNewSegmentAction,
  resetSegmentFiltersAction,
  updateSegmentAction,
} from "../actions";
import { SegmentEditor, type TSurveyOption } from "./segment-editor";

interface TargetingCardProps {
  localSurvey: TSurvey;
  setLocalSurvey: Dispatch<SetStateAction<TSurvey>>;
  contactAttributeKeys: TContactAttributeKey[];
  segments: TSegment[];
  initialSegment?: TSegment;
}

const USER_IDENTIFICATION_DOCS =
  "https://formbricks.com/docs/xm-and-surveys/surveys/website-app-surveys/user-identification";

const createTempSegment = (survey: TSurvey): TSegment => ({
  id: "temp",
  title: survey.id,
  description: "",
  isPrivate: true,
  filters: [],
  workspaceId: survey.workspaceId,
  surveys: [survey.id],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const TargetingCard = ({
  localSurvey,
  setLocalSurvey,
  contactAttributeKeys,
  segments,
  initialSegment,
}: Readonly<TargetingCardProps>) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadOpen, setIsLoadOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [surveys, setSurveys] = useState<TSurveyOption[]>([]);

  const segment = localSurvey.segment ?? initialSegment ?? createTempSegment(localSurvey);
  const isPrivate = segment.isPrivate;
  const isTemp = segment.id === "temp";
  const hasFilters = segment.filters.length > 0;

  useEffect(() => {
    let cancelled = false;
    void getSurveyRefsAction({ workspaceId: localSurvey.workspaceId }).then((result) => {
      if (!cancelled && result?.data) setSurveys(result.data.map(({ id, name }) => ({ id, name })));
    });
    return () => {
      cancelled = true;
    };
  }, [localSurvey.workspaceId]);

  const setSegment = (next: TSegment) => setLocalSurvey((survey) => ({ ...survey, segment: next }));

  const handleFiltersChange = (filters: TBaseFilters) => setSegment({ ...segment, filters });

  const run = async (task: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await task();
    } finally {
      setIsBusy(false);
    }
  };

  const handleClone = () =>
    run(async () => {
      const result = await cloneSegmentAction({ surveyId: localSurvey.id, segmentId: segment.id });
      if (!result?.data) {
        toast.error(getFormattedErrorMessage(result));
        return;
      }
      setSegment(result.data);
    });

  const handleReset = () =>
    run(async () => {
      if (isPrivate) {
        setSegment({ ...segment, filters: [] });
        toast.success(t("workspace.segments.filters_reset_successfully"));
        return;
      }
      const result = await resetSegmentFiltersAction({ surveyId: localSurvey.id });
      if (!result?.data) {
        toast.error(t("workspace.segments.error_resetting_filters"));
        return;
      }
      setSegment(result.data);
      toast.success(t("workspace.segments.filters_reset_successfully"));
    });

  const handleLoad = async (surveyId: string, segmentId: string): Promise<TSurvey> => {
    const result = await loadNewSegmentAction({ surveyId, segmentId });
    if (!result?.data) throw new Error(getFormattedErrorMessage(result));
    return result.data;
  };

  const handleCreate = async (data: TSegmentCreateInput): Promise<TSegment> => {
    const result = await createSegmentAction(data);
    if (!result?.data) throw new Error(getFormattedErrorMessage(result));
    return result.data;
  };

  const handleUpdate = async (segmentId: string, data: TSegmentUpdateInput): Promise<TSegment> => {
    const result = await updateSegmentAction({ segmentId, data });
    if (!result?.data) throw new Error(getFormattedErrorMessage(result));
    return result.data;
  };

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full overflow-hidden rounded-lg border border-slate-300 bg-white">
      <Collapsible.CollapsibleTrigger
        asChild
        className="h-full w-full cursor-pointer rounded-lg hover:bg-slate-50">
        <div className="inline-flex px-4 py-4">
          <div className="flex items-center pr-5 pl-2">
            <div className="rounded-full border border-slate-300 bg-slate-100 p-1">
              <UsersIcon className="size-4 text-slate-500" strokeWidth={3} />
            </div>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-800">{t("workspace.segments.target_audience")}</p>
            <p className="mt-1 text-sm text-slate-500">
              {hasFilters
                ? t("workspace.surveys.edit.only_people_who_match_your_targeting_can_be_surveyed")
                : t("workspace.surveys.edit.without_a_filter_all_of_your_users_can_be_surveyed")}
            </p>
          </div>
          <ChevronDownIcon className="mt-1 ml-3 size-4 text-slate-500" />
        </div>
      </Collapsible.CollapsibleTrigger>

      <Collapsible.CollapsibleContent className="min-w-full space-y-4 overflow-auto border-t border-slate-200 p-4">
        <p className="text-xs text-slate-500">
          <Trans
            i18nKey="workspace.segments.user_targeting_only_available_when_identifying_users"
            components={{
              docsLink: (
                <a
                  href={USER_IDENTIFICATION_DOCS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                />
              ),
            }}
          />
        </p>

        {!isPrivate && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{segment.title}</p>
            <p className="mt-1">
              <Trans
                i18nKey="workspace.segments.segment_used_in_other_surveys_make_changes_here"
                components={{
                  segmentsLink: (
                    <Link
                      href={`/workspaces/${localSurvey.workspaceId}/segments`}
                      className="underline"
                      target="_blank"
                    />
                  ),
                }}
              />
            </p>
          </div>
        )}

        <SegmentEditor
          filters={segment.filters}
          onChange={handleFiltersChange}
          contactAttributeKeys={contactAttributeKeys}
          segments={segments.filter((candidate) => !candidate.isPrivate && candidate.id !== segment.id)}
          surveys={surveys}
          viewOnly={!isPrivate}
        />

        <div className="flex flex-wrap gap-2">
          {!isPrivate && (
            <Button type="button" variant="secondary" size="sm" loading={isBusy} onClick={handleClone}>
              {t("workspace.segments.clone_and_edit_segment")}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isBusy || isTemp}
            onClick={() => setIsLoadOpen(true)}>
            {t("workspace.segments.load_segment")}
          </Button>
          {isPrivate && hasFilters && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isBusy}
              onClick={() => setIsSaveOpen(true)}>
              {t("workspace.segments.save_as_new_segment")}
            </Button>
          )}
          {(hasFilters || !isPrivate) && (
            <Button type="button" variant="ghost" size="sm" loading={isBusy} onClick={handleReset}>
              {t("workspace.segments.reset_all_filters")}
            </Button>
          )}
        </div>
      </Collapsible.CollapsibleContent>

      <LoadSegmentModal
        open={isLoadOpen}
        setOpen={setIsLoadOpen}
        surveyId={localSurvey.id}
        currentSegment={segment}
        segments={segments}
        setSegment={setSegment}
        setIsSegmentEditorOpen={() => undefined}
        onSegmentLoad={handleLoad}
      />
      <SaveAsNewSegmentModal
        open={isSaveOpen}
        setOpen={setIsSaveOpen}
        localSurvey={localSurvey}
        segment={segment}
        setSegment={setSegment}
        setIsSegmentEditorOpen={() => undefined}
        onCreateSegment={handleCreate}
        onUpdateSegment={handleUpdate}
      />
    </Collapsible.Root>
  );
};
