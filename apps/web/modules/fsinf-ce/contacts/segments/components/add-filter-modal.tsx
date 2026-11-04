"use client";

/**
 * FSINF CE: searchable "Add filter" dialog of the segment editor.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import type { TSegment, TSegmentFilter } from "@formbricks/types/segment";
import { Button } from "@/modules/ui/components/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/modules/ui/components/dialog";
import { Input } from "@/modules/ui/components/input";
import {
  createAttributeFilter,
  createDeviceFilter,
  createPersonFilter,
  createSegmentFilter,
  createSurveyInteractionFilter,
} from "./segment-filter-utils";

interface AddFilterModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  contactAttributeKeys: TContactAttributeKey[];
  segments: TSegment[];
  onAdd: (filter: TSegmentFilter) => void;
}

interface TFilterChoice {
  testId: string;
  label: string;
  create: () => TSegmentFilter;
}

const Section = ({
  title,
  choices,
  onPick,
}: Readonly<{ title: string; choices: TFilterChoice[]; onPick: (choice: TFilterChoice) => void }>) => {
  if (choices.length === 0) return null;
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-slate-500 uppercase">{title}</h3>
      <div className="flex flex-col">
        {choices.map((choice) => (
          <button
            key={choice.testId}
            type="button"
            data-testid={choice.testId}
            onClick={() => onPick(choice)}
            className="rounded-md px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100">
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const AddFilterModal = ({
  open,
  setOpen,
  contactAttributeKeys,
  segments,
  onAdd,
}: Readonly<AddFilterModalProps>) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const personChoices: TFilterChoice[] = [
    { testId: "filter-btn-person-userId", label: t("common.user_id"), create: createPersonFilter },
    ...contactAttributeKeys
      .filter((key) => key.key !== "userId")
      .map((key) => ({
        testId: `filter-btn-attribute-${key.key}`,
        label: key.name ?? key.key,
        create: () => createAttributeFilter(key.key, key.dataType),
      })),
  ];
  const segmentChoices: TFilterChoice[] = segments
    .filter((segment) => !segment.isPrivate)
    .map((segment) => ({
      testId: `filter-btn-segment-${segment.id}`,
      label: segment.title,
      create: () => createSegmentFilter(segment.id),
    }));
  const deviceChoices: TFilterChoice[] = [
    {
      testId: "filter-btn-device-phone",
      label: t("workspace.segments.phone"),
      create: () => createDeviceFilter("phone"),
    },
    {
      testId: "filter-btn-device-desktop",
      label: t("workspace.segments.desktop"),
      create: () => createDeviceFilter("desktop"),
    },
  ];
  const interactionChoices: TFilterChoice[] = [
    {
      testId: "filter-btn-survey-interaction",
      label: t("workspace.segments.survey_interaction"),
      create: createSurveyInteractionFilter,
    },
  ];

  const query = search.trim().toLowerCase();
  const matches = (choices: TFilterChoice[]) =>
    query ? choices.filter((choice) => choice.label.toLowerCase().includes(query)) : choices;

  const handlePick = (choice: TFilterChoice) => {
    onAdd(choice.create());
    setSearch("");
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        setOpen(next);
      }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.add_filter")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Input
            autoFocus
            placeholder={t("workspace.segments.browse_filters")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-96 space-y-4 overflow-y-auto">
            <Section
              title={t("workspace.segments.person_and_attributes")}
              choices={matches(personChoices)}
              onPick={handlePick}
            />
            <Section title={t("common.segments")} choices={matches(segmentChoices)} onPick={handlePick} />
            <Section
              title={t("workspace.segments.devices")}
              choices={matches(deviceChoices)}
              onPick={handlePick}
            />
            <Section
              title={t("workspace.segments.survey_interaction")}
              choices={matches(interactionChoices)}
              onPick={handlePick}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
