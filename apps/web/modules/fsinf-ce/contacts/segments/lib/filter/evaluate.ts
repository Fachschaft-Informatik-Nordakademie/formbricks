/**
 * FSINF CE: in-memory segment evaluation for ONE contact.
 *
 * Used on the SDK `/user` hot path, where the contact's attributes, displays and responses are
 * already loaded and evaluating every workspace segment in memory is far cheaper than one SQL query
 * per segment. The rules are shared with the Prisma translation in `prisma-query.ts` through
 * `semantics.ts` — keep both in sync when changing either.
 */
import type {
  TBaseFilters,
  TSegmentAttributeFilter,
  TSegmentDeviceFilter,
  TSegmentFilter,
  TSegmentPersonFilter,
  TSegmentSegmentFilter,
  TSegmentSurveyInteractionFilter,
} from "@formbricks/types/segment";
import { getDateRange, groupByPrecedence, isInDateRange, subtractTime } from "./semantics";

export interface TContactAttributeSnapshot {
  value: string;
  valueNumber: number | null;
  valueDate: Date | null;
}

export interface TSegmentEvaluationContact {
  /** Attribute values by attribute key. */
  attributes: Record<string, TContactAttributeSnapshot>;
  /** Device of the current request; null when unknown (filters on it are then ignored). */
  deviceType: "phone" | "desktop" | null;
  displays: { surveyId: string; createdAt: Date }[];
  responses: { surveyId: string; createdAt: Date; finished: boolean }[];
}

export interface TSegmentEvaluationOptions {
  now: Date;
  /** Filters of another segment of the SAME workspace; undefined for unknown/foreign ids. */
  resolveSegmentFilters: (segmentId: string) => TBaseFilters | undefined;
}

const lower = (value: string) => value.toLowerCase();

const evaluateValueFilter = (
  attribute: TContactAttributeSnapshot | undefined,
  filter: TSegmentAttributeFilter | TSegmentPersonFilter,
  now: Date
): boolean => {
  const { operator } = filter.qualifier;
  const { value } = filter;

  switch (operator) {
    case "isSet":
      return !!attribute && attribute.value !== "";
    case "isNotSet":
      return !attribute || attribute.value === "";
    case "equals":
    case "notEquals": {
      let equal = false;
      if (attribute) {
        equal =
          typeof value === "number"
            ? attribute.valueNumber === value
            : typeof value === "string" && lower(attribute.value) === lower(value);
      }
      return operator === "equals" ? equal : !equal;
    }
    case "contains":
    case "doesNotContain": {
      const contains =
        !!attribute && typeof value === "string" && lower(attribute.value).includes(lower(value));
      return operator === "contains" ? contains : !contains;
    }
    case "startsWith":
      return !!attribute && typeof value === "string" && lower(attribute.value).startsWith(lower(value));
    case "endsWith":
      return !!attribute && typeof value === "string" && lower(attribute.value).endsWith(lower(value));
    case "lessThan":
    case "lessEqual":
    case "greaterThan":
    case "greaterEqual": {
      if (!attribute || attribute.valueNumber === null || typeof value !== "number") return false;
      const actual = attribute.valueNumber;
      if (operator === "lessThan") return actual < value;
      if (operator === "lessEqual") return actual <= value;
      if (operator === "greaterThan") return actual > value;
      return actual >= value;
    }
    default: {
      // date operators
      if (!attribute?.valueDate) return false;
      const range = getDateRange(filter as TSegmentFilter, now);
      return range !== null && isInDateRange(attribute.valueDate, range);
    }
  }
};

const evaluateDeviceFilter = (
  deviceType: TSegmentEvaluationContact["deviceType"],
  filter: TSegmentDeviceFilter
): boolean => {
  if (deviceType === null) return true;
  const matches = deviceType === filter.value;
  return filter.qualifier.operator === "equals" ? matches : !matches;
};

const evaluateSurveyInteractionFilter = (
  contact: TSegmentEvaluationContact,
  filter: TSegmentSurveyInteractionFilter,
  now: Date
): boolean => {
  const { surveyScope, surveyIds, within } = filter.value;
  const since = subtractTime(now, within.amount, within.unit).getTime();
  const surveyIdSet = new Set(surveyIds);
  const inScope = (surveyId: string, createdAt: Date) =>
    (surveyScope === "any" || surveyIdSet.has(surveyId)) && createdAt.getTime() >= since;

  const hasSeen = () => contact.displays.some((display) => inScope(display.surveyId, display.createdAt));
  const hasStarted = () =>
    contact.responses.some((response) => inScope(response.surveyId, response.createdAt));
  const hasCompleted = () =>
    contact.responses.some((response) => response.finished && inScope(response.surveyId, response.createdAt));

  switch (filter.qualifier.operator) {
    case "haveSeen":
      return hasSeen();
    case "haveNotSeen":
      return !hasSeen();
    case "haveStartedRespondingTo":
      return hasStarted();
    case "haveCompleted":
      return hasCompleted();
    case "haveNotCompleted":
      return !hasCompleted();
  }
};

const evaluateFilters = (
  filters: TBaseFilters,
  contact: TSegmentEvaluationContact,
  options: TSegmentEvaluationOptions,
  visitedSegmentIds: ReadonlySet<string>
): boolean => {
  if (filters.length === 0) return true;

  const evaluateResource = (resource: TBaseFilters[number]["resource"]): boolean => {
    if (Array.isArray(resource)) {
      return evaluateFilters(resource, contact, options, visitedSegmentIds);
    }

    switch (resource.root.type) {
      case "attribute": {
        const filter = resource as TSegmentAttributeFilter;
        return evaluateValueFilter(contact.attributes[filter.root.contactAttributeKey], filter, options.now);
      }
      case "person": {
        const filter = resource as TSegmentPersonFilter;
        return evaluateValueFilter(contact.attributes[filter.root.personIdentifier], filter, options.now);
      }
      case "device":
        return evaluateDeviceFilter(contact.deviceType, resource as TSegmentDeviceFilter);
      case "surveyInteraction":
        return evaluateSurveyInteractionFilter(
          contact,
          resource as TSegmentSurveyInteractionFilter,
          options.now
        );
      case "segment": {
        const filter = resource as TSegmentSegmentFilter;
        const { segmentId } = filter.root;
        if (visitedSegmentIds.has(segmentId)) return false;
        const nested = options.resolveSegmentFilters(segmentId);
        if (!nested) return false;
        const isMember = evaluateFilters(
          nested,
          contact,
          options,
          new Set([...visitedSegmentIds, segmentId])
        );
        return filter.qualifier.operator === "userIsIn" ? isMember : !isMember;
      }
      default:
        return false;
    }
  };

  const groups = groupByPrecedence(filters.map((group) => ({ connector: group.connector, value: group })));
  return groups.some((andChain) => andChain.every((group) => evaluateResource(group.resource)));
};

/**
 * Is the contact a member of a segment with these filters? `segmentId` (when given) is treated as
 * already visited so a segment that references itself cannot recurse.
 */
export const evaluateSegmentFilters = (
  filters: TBaseFilters,
  contact: TSegmentEvaluationContact,
  options: TSegmentEvaluationOptions,
  segmentId?: string
): boolean => evaluateFilters(filters, contact, options, new Set(segmentId ? [segmentId] : []));
