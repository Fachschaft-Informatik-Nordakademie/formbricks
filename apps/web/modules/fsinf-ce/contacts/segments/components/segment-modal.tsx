"use client";

/**
 * FSINF CE: create / edit dialog for a saved (public) segment on the segments page.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import { type TBaseFilters, type TSegmentWithSurveyRefs, ZSegmentFilters } from "@formbricks/types/segment";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { Button } from "@/modules/ui/components/button";
import { ConfirmDeleteSegmentModal } from "@/modules/ui/components/confirm-delete-segment-modal";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { Input } from "@/modules/ui/components/input";
import { createSegmentAction, deleteSegmentAction, updateSegmentAction } from "../actions";
import { getSegmentActivitySummary } from "./segment-activity-utils";
import { SegmentEditor, type TSurveyOption } from "./segment-editor";
import { findFirstInvalidFilter } from "./segment-filter-utils";

interface SegmentModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  workspaceId: string;
  /** The segment to edit; undefined = create a new one. */
  segment?: TSegmentWithSurveyRefs;
  allSegments: TSegmentWithSurveyRefs[];
  contactAttributeKeys: TContactAttributeKey[];
  surveys: TSurveyOption[];
  isReadOnly: boolean;
}

export const SegmentModal = ({
  open,
  setOpen,
  workspaceId,
  segment,
  allSegments,
  contactAttributeKeys,
  surveys,
  isReadOnly,
}: Readonly<SegmentModalProps>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<TBaseFilters>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(segment?.title ?? "");
    setDescription(segment?.description ?? "");
    setFilters(segment?.filters ?? []);
  }, [open, segment]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t("workspace.segments.title_is_required"));
      return;
    }
    if (
      filters.length === 0 ||
      findFirstInvalidFilter(filters) ||
      !ZSegmentFilters.safeParse(filters).success
    ) {
      toast.error(t("workspace.segments.invalid_segment_filters"));
      return;
    }
    setIsSaving(true);
    const result = segment
      ? await updateSegmentAction({
          segmentId: segment.id,
          data: { title: title.trim(), description: description.trim() || null, filters },
        })
      : await createSegmentAction({
          workspaceId,
          title: title.trim(),
          description: description.trim() || undefined,
          isPrivate: false,
          filters,
          surveyId: "",
        });
    setIsSaving(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result) || t("workspace.segments.error_saving_segment"));
      return;
    }
    toast.success(
      segment
        ? t("workspace.segments.segment_updated_successfully")
        : t("workspace.segments.segment_created_successfully")
    );
    setOpen(false);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!segment) return;
    const result = await deleteSegmentAction({ segmentId: segment.id });
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    toast.success(t("workspace.segments.segment_deleted_successfully"));
    setIsDeleteOpen(false);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent width="wide">
          <DialogHeader>
            <DialogTitle>
              {segment ? t("workspace.segments.edit_segment") : t("common.create_segment")}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="segment-title" className="text-sm font-medium text-slate-700">
                  {t("common.name")}
                </label>
                <Input
                  id="segment-title"
                  value={title}
                  disabled={isReadOnly}
                  placeholder={t("workspace.segments.ex_power_users")}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="segment-description" className="text-sm font-medium text-slate-700">
                  {t("common.description")}
                </label>
                <Input
                  id="segment-description"
                  value={description}
                  disabled={isReadOnly}
                  placeholder={t("workspace.segments.most_active_users_in_the_last_30_days")}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
            <SegmentEditor
              filters={filters}
              onChange={setFilters}
              contactAttributeKeys={contactAttributeKeys}
              segments={allSegments.filter((candidate) => candidate.id !== segment?.id)}
              surveys={surveys}
              viewOnly={isReadOnly}
            />
          </DialogBody>
          <DialogFooter>
            {segment && !isReadOnly ? (
              <Button type="button" variant="destructive" onClick={() => setIsDeleteOpen(true)}>
                {t("common.delete")}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            {!isReadOnly && (
              <Button type="button" loading={isSaving} onClick={handleSave}>
                {segment ? t("common.save") : t("common.create_segment")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {segment ? (
        <ConfirmDeleteSegmentModal
          activitySummary={getSegmentActivitySummary(segment)}
          open={isDeleteOpen}
          setOpen={setIsDeleteOpen}
          onDelete={handleDelete}
        />
      ) : null}
    </>
  );
};
