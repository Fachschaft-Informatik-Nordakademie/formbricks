"use client";

/**
 * FSINF CE: the saved segments of a workspace with create / edit dialogs (segments page).
 */
import { PlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import type { TSegmentWithSurveyRefs } from "@formbricks/types/segment";
import type { TUserLocale } from "@formbricks/types/user";
import { formatDate, timeSinceDate } from "@/lib/time";
import { Button } from "@/modules/ui/components/button";
import type { TSurveyOption } from "./segment-editor";
import { SegmentModal } from "./segment-modal";

interface SegmentsListProps {
  workspaceId: string;
  segments: TSegmentWithSurveyRefs[];
  contactAttributeKeys: TContactAttributeKey[];
  surveys: TSurveyOption[];
  isReadOnly: boolean;
}

export const SegmentsList = ({
  workspaceId,
  segments,
  contactAttributeKeys,
  surveys,
  isReadOnly,
}: Readonly<SegmentsListProps>) => {
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language ?? "en-US") as TUserLocale;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TSegmentWithSurveyRefs | undefined>();

  const createButton = isReadOnly ? null : (
    <Button type="button" onClick={() => setIsCreateOpen(true)}>
      <PlusIcon />
      {t("common.create_segment")}
    </Button>
  );

  return (
    <div className="space-y-4">
      {segments.length > 0 ? <div className="flex justify-end">{createButton}</div> : null}

      {segments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <UsersIcon className="size-8 text-slate-400" />
          <p className="font-medium text-slate-800">{t("workspace.segments.create_your_first_segment")}</p>
          <p className="max-w-md text-sm text-slate-500">
            {t("workspace.segments.segments_help_you_target_users_with_same_characteristics_easily")}
          </p>
          {createButton}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-6 bg-slate-100 px-6 py-3 text-left text-sm font-semibold text-slate-900">
            <div className="col-span-3">{t("common.segment")}</div>
            <div className="col-span-1 hidden sm:block">{t("common.surveys")}</div>
            <div className="col-span-1 hidden sm:block">{t("common.updated_at")}</div>
            <div className="col-span-1 hidden sm:block">{t("common.created_at")}</div>
          </div>
          {segments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => setEditing(segment)}
              className="grid w-full grid-cols-6 items-center border-t border-slate-100 px-6 py-3 text-left text-sm hover:bg-slate-50">
              <div className="col-span-3">
                <div className="ph-no-capture font-medium text-slate-900">{segment.title}</div>
                <div className="ph-no-capture text-xs text-slate-500">{segment.description}</div>
              </div>
              <div className="col-span-1 hidden text-slate-700 sm:block">
                {segment.activeSurveys.length + segment.inactiveSurveys.length}
              </div>
              <div className="col-span-1 hidden text-slate-700 sm:block">
                {timeSinceDate(new Date(segment.updatedAt), locale)}
              </div>
              <div className="col-span-1 hidden text-slate-700 sm:block">
                {formatDate(new Date(segment.createdAt), locale)}
              </div>
            </button>
          ))}
        </div>
      )}

      <SegmentModal
        open={isCreateOpen}
        setOpen={setIsCreateOpen}
        workspaceId={workspaceId}
        allSegments={segments}
        contactAttributeKeys={contactAttributeKeys}
        surveys={surveys}
        isReadOnly={isReadOnly}
      />
      <SegmentModal
        open={!!editing}
        setOpen={(open) => {
          if (!open) setEditing(undefined);
        }}
        workspaceId={workspaceId}
        segment={editing}
        allSegments={segments}
        contactAttributeKeys={contactAttributeKeys}
        surveys={surveys}
        isReadOnly={isReadOnly}
      />
    </div>
  );
};
