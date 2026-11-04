"use client";

/**
 * FSINF CE: recursive editor for segment filter trees (attributes, person, other segments, device,
 * survey interaction), used by the segments page and the targeting card of the survey editor.
 */
import { MoreVertical, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import type {
  TBaseFilters,
  TSegment,
  TSegmentAttributeFilter,
  TSegmentDeviceFilter,
  TSegmentFilter,
  TSegmentPersonFilter,
  TSegmentSegmentFilter,
  TSegmentSurveyInteractionFilter,
  TTimeUnit,
} from "@formbricks/types/segment";
import { SURVEY_INTERACTION_OPERATORS } from "@formbricks/types/segment";
import { cn } from "@/lib/cn";
import { Button } from "@/modules/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/modules/ui/components/dropdown-menu";
import { Input } from "@/modules/ui/components/input";
import { MultiSelect } from "@/modules/ui/components/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";
import { AddFilterModal } from "./add-filter-modal";
import {
  type TFilterValidationError,
  addFilterToTree,
  getDefaultValueForOperator,
  getOperatorsForDataType,
  removeNodeFromTree,
  toggleConnectorInTree,
  updateFilterInTree,
  validateFilterValue,
  wrapNodeInGroup,
} from "./segment-filter-utils";

export interface TSurveyOption {
  id: string;
  name: string;
}

interface SegmentEditorProps {
  filters: TBaseFilters;
  onChange: (filters: TBaseFilters) => void;
  contactAttributeKeys: TContactAttributeKey[];
  /** Other public segments that can be referenced by "user is in / is not in". */
  segments: TSegment[];
  surveys: TSurveyOption[];
  viewOnly?: boolean;
}

type TContext = Omit<SegmentEditorProps, "filters" | "onChange"> & {
  update: (updater: (tree: TBaseFilters) => TBaseFilters) => void;
};

const OPERATOR_LABEL_KEYS: Record<string, string> = {
  equals: "workspace.segments.operator_title_equals",
  notEquals: "workspace.segments.operator_title_not_equals",
  lessThan: "workspace.segments.operator_title_less_than",
  lessEqual: "workspace.segments.operator_title_less_equal",
  greaterThan: "workspace.segments.operator_title_greater_than",
  greaterEqual: "workspace.segments.operator_title_greater_equal",
  contains: "workspace.segments.operator_title_contains",
  doesNotContain: "workspace.segments.operator_title_does_not_contain",
  startsWith: "workspace.segments.operator_title_starts_with",
  endsWith: "workspace.segments.operator_title_ends_with",
  isSet: "workspace.segments.operator_title_is_set",
  isNotSet: "workspace.segments.operator_title_is_not_set",
  isOlderThan: "workspace.segments.operator_title_is_older_than",
  isNewerThan: "workspace.segments.operator_title_is_newer_than",
  isBefore: "workspace.segments.operator_title_is_before",
  isAfter: "workspace.segments.operator_title_is_after",
  isBetween: "workspace.segments.operator_title_is_between",
  isSameDay: "workspace.segments.operator_title_is_same_day",
  userIsIn: "workspace.segments.operator_title_user_is_in",
  userIsNotIn: "workspace.segments.operator_title_user_is_not_in",
  haveSeen: "workspace.segments.operator_have_seen",
  haveNotSeen: "workspace.segments.operator_have_not_seen",
  haveStartedRespondingTo: "workspace.segments.operator_have_started_responding_to",
  haveCompleted: "workspace.segments.operator_have_completed",
  haveNotCompleted: "workspace.segments.operator_have_not_completed",
};

const TIME_UNIT_KEYS: Record<string, string> = {
  days: "workspace.segments.time_unit_days",
  weeks: "workspace.segments.time_unit_weeks",
  months: "workspace.segments.time_unit_months",
  years: "workspace.segments.time_unit_years",
};

const ERROR_KEYS: Record<Exclude<TFilterValidationError, null>, string> = {
  empty: "workspace.segments.value_cannot_be_empty",
  not_a_number: "workspace.segments.value_must_be_a_number",
  not_positive: "workspace.segments.value_must_be_positive",
  survey_required: "workspace.segments.select_at_least_one_survey",
};

const OperatorSelect = ({
  operators,
  value,
  onChange,
  disabled,
  ariaLabel,
}: Readonly<{
  operators: readonly string[];
  value: string;
  onChange: (operator: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}>) => {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-auto min-w-36 bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {operators.map((operator) => (
          <SelectItem key={operator} value={operator}>
            {t(OPERATOR_LABEL_KEYS[operator] ?? operator)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const TimeUnitSelect = ({
  value,
  onChange,
  disabled,
  units,
  ariaLabel,
}: Readonly<{
  value: string;
  onChange: (unit: TTimeUnit) => void;
  disabled?: boolean;
  units: TTimeUnit[];
  ariaLabel: string;
}>) => {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(unit) => onChange(unit as TTimeUnit)} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-auto min-w-24 bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit} value={unit}>
            {t(TIME_UNIT_KEYS[unit])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const ValueInputs = ({
  filter,
  dataType,
  disabled,
  onChange,
}: Readonly<{
  filter: TSegmentAttributeFilter | TSegmentPersonFilter;
  dataType: "string" | "number" | "date";
  disabled?: boolean;
  onChange: (value: TSegmentFilter["value"]) => void;
}>) => {
  const { t } = useTranslation();
  const { operator } = filter.qualifier;
  const { value } = filter;
  if (operator === "isSet" || operator === "isNotSet") return null;

  if (operator === "isOlderThan" || operator === "isNewerThan") {
    const relative =
      typeof value === "object" && !Array.isArray(value) && "amount" in value && "unit" in value
        ? (value as { amount: number; unit: TTimeUnit })
        : { amount: 30, unit: "days" as TTimeUnit };
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          className="h-8 w-20 bg-white"
          aria-label={t("workspace.segments.period")}
          disabled={disabled}
          value={relative.amount}
          onChange={(event) => onChange({ ...relative, amount: Number(event.target.value) })}
        />
        <TimeUnitSelect
          value={relative.unit}
          units={["days", "weeks", "months", "years"]}
          ariaLabel={t("workspace.segments.period")}
          disabled={disabled}
          onChange={(unit) => onChange({ ...relative, unit })}
        />
      </div>
    );
  }

  if (operator === "isBetween") {
    const range = Array.isArray(value) ? value : ["", ""];
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className="h-8 bg-white"
          disabled={disabled}
          value={range[0]}
          onChange={(event) => onChange([event.target.value, range[1]])}
        />
        <Input
          type="date"
          className="h-8 bg-white"
          disabled={disabled}
          value={range[1]}
          onChange={(event) => onChange([range[0], event.target.value])}
        />
      </div>
    );
  }

  const isNumeric = dataType === "number";
  let inputType = "text";
  if (isNumeric) inputType = "number";
  else if (dataType === "date") inputType = "date";

  let inputValue = "";
  if (typeof value === "number" || typeof value === "string") inputValue = String(value);

  return (
    <Input
      type={inputType}
      className="h-8 min-w-40 bg-white"
      aria-label={t("workspace.contacts.attribute_value")}
      disabled={disabled}
      value={inputValue}
      onChange={(event) => onChange(isNumeric ? Number(event.target.value) : event.target.value)}
    />
  );
};

const AttributeLikeRow = ({
  filter,
  label,
  dataType,
  context,
  nodeId,
}: Readonly<{
  filter: TSegmentAttributeFilter | TSegmentPersonFilter;
  label: string;
  dataType: "string" | "number" | "date";
  context: TContext;
  nodeId: string;
}>) => {
  const { t } = useTranslation();
  const change = (patch: (current: typeof filter) => typeof filter) =>
    context.update((tree) => updateFilterInTree(tree, nodeId, (current) => patch(current as typeof filter)));

  return (
    <>
      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800">
        {label}
      </span>
      <OperatorSelect
        operators={getOperatorsForDataType(dataType)}
        value={filter.qualifier.operator}
        ariaLabel={t("workspace.segments.operator_title_equals")}
        disabled={context.viewOnly}
        onChange={(operator) =>
          change(
            (current) =>
              ({
                ...current,
                qualifier: { operator },
                value: getDefaultValueForOperator(dataType, operator),
              }) as typeof filter
          )
        }
      />
      <ValueInputs
        filter={filter}
        dataType={dataType}
        disabled={context.viewOnly}
        onChange={(value) => change((current) => ({ ...current, value }) as typeof filter)}
      />
    </>
  );
};

const SegmentRow = ({
  filter,
  context,
  nodeId,
}: Readonly<{ filter: TSegmentSegmentFilter; context: TContext; nodeId: string }>) => {
  const { t } = useTranslation();
  const title = context.segments.find((segment) => segment.id === filter.root.segmentId)?.title;
  return (
    <>
      <OperatorSelect
        operators={["userIsIn", "userIsNotIn"]}
        value={filter.qualifier.operator}
        ariaLabel={t("common.segment")}
        disabled={context.viewOnly}
        onChange={(operator) =>
          context.update((tree) =>
            updateFilterInTree(
              tree,
              nodeId,
              (current) => ({ ...current, qualifier: { operator } }) as TSegmentFilter
            )
          )
        }
      />
      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800">
        {title ?? t("workspace.segments.invalid_segment")}
      </span>
    </>
  );
};

const DeviceRow = ({
  filter,
  context,
  nodeId,
}: Readonly<{ filter: TSegmentDeviceFilter; context: TContext; nodeId: string }>) => {
  const { t } = useTranslation();
  return (
    <>
      <span className="text-sm text-slate-700">{t("workspace.segments.devices")}</span>
      <OperatorSelect
        operators={["equals", "notEquals"]}
        value={filter.qualifier.operator}
        ariaLabel={t("workspace.segments.devices")}
        disabled={context.viewOnly}
        onChange={(operator) =>
          context.update((tree) =>
            updateFilterInTree(
              tree,
              nodeId,
              (current) => ({ ...current, qualifier: { operator } }) as TSegmentFilter
            )
          )
        }
      />
      <Select
        value={String(filter.value)}
        disabled={context.viewOnly}
        onValueChange={(device) =>
          context.update((tree) =>
            updateFilterInTree(
              tree,
              nodeId,
              (current) =>
                ({
                  ...current,
                  root: { type: "device", deviceType: device },
                  value: device,
                }) as TSegmentFilter
            )
          )
        }>
        <SelectTrigger aria-label={t("workspace.segments.devices")} className="h-8 w-auto min-w-28 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="phone">{t("workspace.segments.phone")}</SelectItem>
          <SelectItem value="desktop">{t("workspace.segments.desktop")}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
};

const SurveyInteractionRow = ({
  filter,
  context,
  nodeId,
}: Readonly<{ filter: TSegmentSurveyInteractionFilter; context: TContext; nodeId: string }>) => {
  const { t } = useTranslation();
  const { surveyScope, surveyIds, within } = filter.value;
  const setValue = (patch: Partial<TSegmentSurveyInteractionFilter["value"]>) =>
    context.update((tree) =>
      updateFilterInTree(
        tree,
        nodeId,
        (current) =>
          ({
            ...current,
            value: { ...(current as TSegmentSurveyInteractionFilter).value, ...patch },
          }) as TSegmentFilter
      )
    );

  return (
    <>
      <OperatorSelect
        operators={SURVEY_INTERACTION_OPERATORS}
        value={filter.qualifier.operator}
        ariaLabel={t("workspace.segments.survey_interaction")}
        disabled={context.viewOnly}
        onChange={(operator) =>
          context.update((tree) =>
            updateFilterInTree(
              tree,
              nodeId,
              (current) => ({ ...current, qualifier: { operator } }) as TSegmentFilter
            )
          )
        }
      />
      <Select
        value={surveyScope}
        disabled={context.viewOnly}
        onValueChange={(scope) => setValue({ surveyScope: scope as "any" | "specific" })}>
        <SelectTrigger aria-label={t("common.surveys")} className="h-8 w-auto min-w-36 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{t("workspace.segments.any_survey")}</SelectItem>
          <SelectItem value="specific">{t("workspace.segments.specific_surveys")}</SelectItem>
        </SelectContent>
      </Select>
      {surveyScope === "specific" ? (
        <div className="min-w-56">
          <MultiSelect
            options={context.surveys.map((survey) => ({ value: survey.id, label: survey.name }))}
            value={surveyIds}
            placeholder={t("common.select")}
            disabled={context.viewOnly}
            onChange={(selected) => setValue({ surveyIds: selected })}
          />
        </div>
      ) : null}
      <span className="text-sm text-slate-600">{t("workspace.segments.within_last")}</span>
      <Input
        type="number"
        min={1}
        max={999}
        className="h-8 w-20 bg-white"
        aria-label={t("workspace.segments.period")}
        disabled={context.viewOnly}
        value={within.amount}
        onChange={(event) => setValue({ within: { ...within, amount: Number(event.target.value) } })}
      />
      <TimeUnitSelect
        value={within.unit}
        units={["days", "weeks", "months"]}
        ariaLabel={t("workspace.segments.period")}
        disabled={context.viewOnly}
        onChange={(unit) => setValue({ within: { ...within, unit: unit as "days" | "weeks" | "months" } })}
      />
    </>
  );
};

const FilterContent = ({
  filter,
  context,
  nodeId,
}: Readonly<{ filter: TSegmentFilter; context: TContext; nodeId: string }>) => {
  const { t } = useTranslation();
  switch (filter.root.type) {
    case "attribute": {
      const key = (filter as TSegmentAttributeFilter).root.contactAttributeKey;
      const attributeKey = context.contactAttributeKeys.find((candidate) => candidate.key === key);
      return (
        <AttributeLikeRow
          filter={filter as TSegmentAttributeFilter}
          label={attributeKey?.name ?? key}
          dataType={attributeKey?.dataType ?? "string"}
          context={context}
          nodeId={nodeId}
        />
      );
    }
    case "person":
      return (
        <AttributeLikeRow
          filter={filter as TSegmentPersonFilter}
          label={t("common.user_id")}
          dataType="string"
          context={context}
          nodeId={nodeId}
        />
      );
    case "segment":
      return <SegmentRow filter={filter as TSegmentSegmentFilter} context={context} nodeId={nodeId} />;
    case "device":
      return <DeviceRow filter={filter as TSegmentDeviceFilter} context={context} nodeId={nodeId} />;
    case "surveyInteraction":
      return (
        <SurveyInteractionRow
          filter={filter as TSegmentSurveyInteractionFilter}
          context={context}
          nodeId={nodeId}
        />
      );
    default:
      return <span className="text-sm text-red-600">{t("workspace.segments.unknown_filter_type")}</span>;
  }
};

const FilterList = ({
  nodes,
  context,
  nested,
}: Readonly<{ nodes: TBaseFilters; context: TContext; nested?: boolean }>) => {
  const { t } = useTranslation();
  const [groupAddTarget, setGroupAddTarget] = useState<string | null>(null);

  return (
    <div className={cn("space-y-2", nested && "rounded-lg border border-slate-200 bg-slate-50 p-2")}>
      {nodes.map((node, index) => {
        const isGroup = Array.isArray(node.resource);
        const error = isGroup ? null : validateFilterValue(node.resource as TSegmentFilter);
        return (
          <div key={node.id}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-14 shrink-0 text-sm text-slate-600">
                {index === 0 || !node.connector ? (
                  t("workspace.segments.where")
                ) : (
                  <button
                    type="button"
                    disabled={context.viewOnly}
                    onClick={() => context.update((tree) => toggleConnectorInTree(tree, node.id))}
                    className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-default">
                    {node.connector === "and" ? t("common.and") : t("common.or")}
                  </button>
                )}
              </div>
              {isGroup ? (
                <div className="min-w-0 flex-1">
                  <FilterList nodes={node.resource as TBaseFilters} context={context} nested />
                  {!context.viewOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={() => setGroupAddTarget(node.id)}>
                      <PlusIcon />
                      {t("common.add_filter")}
                    </Button>
                  )}
                  <AddFilterModal
                    open={groupAddTarget === node.id}
                    setOpen={(open) => setGroupAddTarget(open ? node.id : null)}
                    contactAttributeKeys={context.contactAttributeKeys}
                    segments={context.segments}
                    onAdd={(filter) => context.update((tree) => addFilterToTree(tree, filter, node.id))}
                  />
                </div>
              ) : (
                <FilterContent filter={node.resource as TSegmentFilter} context={context} nodeId={node.id} />
              )}
              {!context.viewOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={t("common.actions")}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isGroup && (
                      <DropdownMenuItem
                        onClick={() => context.update((tree) => wrapNodeInGroup(tree, node.id))}>
                        {t("workspace.segments.create_group")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => context.update((tree) => removeNodeFromTree(tree, node.id))}>
                      <TrashIcon className="mr-2 size-4" />
                      {t("common.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {error ? <p className="mt-1 pl-16 text-xs text-red-500">{t(ERROR_KEYS[error])}</p> : null}
          </div>
        );
      })}
    </div>
  );
};

export const SegmentEditor = ({
  filters,
  onChange,
  contactAttributeKeys,
  segments,
  surveys,
  viewOnly = false,
}: Readonly<SegmentEditorProps>) => {
  const { t } = useTranslation();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const context: TContext = {
    contactAttributeKeys,
    segments,
    surveys,
    viewOnly,
    update: (updater) => onChange(updater(filters)),
  };

  return (
    <div className="space-y-3">
      {filters.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t("workspace.segments.add_your_first_filter_to_get_started")}
        </p>
      ) : (
        <FilterList nodes={filters} context={context} />
      )}
      {!viewOnly && (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setIsAddOpen(true)}>
            <PlusIcon />
            {t("common.add_filter")}
          </Button>
          <AddFilterModal
            open={isAddOpen}
            setOpen={setIsAddOpen}
            contactAttributeKeys={contactAttributeKeys}
            segments={segments}
            onAdd={(filter) => onChange(addFilterToTree(filters, filter))}
          />
        </>
      )}
    </div>
  );
};
