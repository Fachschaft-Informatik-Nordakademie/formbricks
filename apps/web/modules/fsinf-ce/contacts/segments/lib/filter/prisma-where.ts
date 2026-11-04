/**
 * FSINF CE: pure translation of segment filters into a Prisma `Contact` where input (no I/O, unit
 * tested). The async wrapper that loads referenced segments lives in `prisma-query.ts`.
 */
import type { Prisma } from "@formbricks/database/prisma";
import type {
  TBaseFilters,
  TSegmentAttributeFilter,
  TSegmentFilter,
  TSegmentPersonFilter,
  TSegmentSegmentFilter,
  TSegmentSurveyInteractionFilter,
} from "@formbricks/types/segment";
import { getDateRange, groupByPrecedence, subtractTime } from "./semantics";

export interface TPrismaWhereOptions {
  now: Date;
  workspaceId: string;
  resolveSegmentFilters: (segmentId: string) => TBaseFilters | undefined;
  visitedSegmentIds?: ReadonlySet<string>;
}

type TWhere = Prisma.ContactWhereInput;

const matchNone = (): TWhere => ({ id: { in: [] } });

const isMatchAll = (where: TWhere) => Object.keys(where).length === 0;

const isMatchNone = (where: TWhere) => {
  const keys = Object.keys(where);
  if (keys.length !== 1 || keys[0] !== "id") return false;
  const id = where.id as { in?: unknown };
  return Array.isArray(id?.in) && id.in.length === 0;
};

const negate = (where: TWhere): TWhere => {
  if (isMatchAll(where)) return matchNone();
  if (isMatchNone(where)) return {};
  return { NOT: where };
};

const and = (items: TWhere[]): TWhere => {
  if (items.some(isMatchNone)) return matchNone();
  const relevant = items.filter((item) => !isMatchAll(item));
  if (relevant.length === 0) return {};
  return relevant.length === 1 ? relevant[0] : { AND: relevant };
};

const or = (items: TWhere[]): TWhere => {
  if (items.some(isMatchAll)) return {};
  const relevant = items.filter((item) => !isMatchNone(item));
  if (relevant.length === 0) return matchNone();
  return relevant.length === 1 ? relevant[0] : { OR: relevant };
};

const hasAttribute = (
  workspaceId: string,
  key: string,
  condition: Omit<Prisma.ContactAttributeWhereInput, "attributeKey">
): TWhere => ({
  attributes: { some: { attributeKey: { key, workspaceId }, ...condition } },
});

const buildValueFilter = (
  key: string,
  filter: TSegmentAttributeFilter | TSegmentPersonFilter,
  options: TPrismaWhereOptions
): TWhere => {
  const { operator } = filter.qualifier;
  const { value } = filter;
  const { workspaceId } = options;
  const insensitive = "insensitive" as const;

  switch (operator) {
    case "isSet":
      return hasAttribute(workspaceId, key, { value: { not: "" } });
    case "isNotSet":
      return negate(hasAttribute(workspaceId, key, { value: { not: "" } }));
    case "equals":
    case "notEquals": {
      let equal: TWhere;
      if (typeof value === "number") {
        equal = hasAttribute(workspaceId, key, { valueNumber: value });
      } else if (typeof value === "string") {
        equal = hasAttribute(workspaceId, key, { value: { equals: value, mode: insensitive } });
      } else {
        equal = matchNone();
      }
      return operator === "equals" ? equal : negate(equal);
    }
    case "contains":
    case "doesNotContain": {
      const contains =
        typeof value === "string"
          ? hasAttribute(workspaceId, key, { value: { contains: value, mode: insensitive } })
          : matchNone();
      return operator === "contains" ? contains : negate(contains);
    }
    case "startsWith":
      return typeof value === "string"
        ? hasAttribute(workspaceId, key, { value: { startsWith: value, mode: insensitive } })
        : matchNone();
    case "endsWith":
      return typeof value === "string"
        ? hasAttribute(workspaceId, key, { value: { endsWith: value, mode: insensitive } })
        : matchNone();
    case "lessThan":
      return typeof value === "number"
        ? hasAttribute(workspaceId, key, { valueNumber: { lt: value } })
        : matchNone();
    case "lessEqual":
      return typeof value === "number"
        ? hasAttribute(workspaceId, key, { valueNumber: { lte: value } })
        : matchNone();
    case "greaterThan":
      return typeof value === "number"
        ? hasAttribute(workspaceId, key, { valueNumber: { gt: value } })
        : matchNone();
    case "greaterEqual":
      return typeof value === "number"
        ? hasAttribute(workspaceId, key, { valueNumber: { gte: value } })
        : matchNone();
    default: {
      const range = getDateRange(filter as TSegmentFilter, options.now);
      if (!range) return matchNone();
      return hasAttribute(workspaceId, key, {
        valueDate: {
          not: null,
          ...(range.gte ? { gte: range.gte } : {}),
          ...(range.lt ? { lt: range.lt } : {}),
        },
      });
    }
  }
};

const buildSurveyInteractionFilter = (filter: TSegmentSurveyInteractionFilter, now: Date): TWhere => {
  const { surveyScope, surveyIds, within } = filter.value;
  const since = subtractTime(now, within.amount, within.unit);
  const scope = {
    createdAt: { gte: since },
    ...(surveyScope === "specific" ? { surveyId: { in: surveyIds } } : {}),
  };

  const seen: TWhere = { displays: { some: scope } };
  const started: TWhere = { responses: { some: scope } };
  const completed: TWhere = { responses: { some: { ...scope, finished: true } } };

  switch (filter.qualifier.operator) {
    case "haveSeen":
      return seen;
    case "haveNotSeen":
      return negate(seen);
    case "haveStartedRespondingTo":
      return started;
    case "haveCompleted":
      return completed;
    case "haveNotCompleted":
      return negate(completed);
  }
};

export const buildContactWhereFromFilters = (filters: TBaseFilters, options: TPrismaWhereOptions): TWhere => {
  if (filters.length === 0) return {};
  const visited = options.visitedSegmentIds ?? new Set<string>();

  const buildResource = (resource: TBaseFilters[number]["resource"]): TWhere => {
    if (Array.isArray(resource)) return buildContactWhereFromFilters(resource, options);

    switch (resource.root.type) {
      case "attribute": {
        const filter = resource as TSegmentAttributeFilter;
        return buildValueFilter(filter.root.contactAttributeKey, filter, options);
      }
      case "person": {
        const filter = resource as TSegmentPersonFilter;
        return buildValueFilter(filter.root.personIdentifier, filter, options);
      }
      case "device":
        // The device is a property of a request, not of a stored contact: ignored in bulk queries.
        return {};
      case "surveyInteraction":
        return buildSurveyInteractionFilter(resource as TSegmentSurveyInteractionFilter, options.now);
      case "segment": {
        const filter = resource as TSegmentSegmentFilter;
        const { segmentId } = filter.root;
        if (visited.has(segmentId)) return matchNone();
        const nested = options.resolveSegmentFilters(segmentId);
        if (!nested) return matchNone();
        const nestedWhere = buildContactWhereFromFilters(nested, {
          ...options,
          visitedSegmentIds: new Set([...visited, segmentId]),
        });
        return filter.qualifier.operator === "userIsIn" ? nestedWhere : negate(nestedWhere);
      }
      default:
        return matchNone();
    }
  };

  const groups = groupByPrecedence(filters.map((group) => ({ connector: group.connector, value: group })));
  return or(groups.map((andChain) => and(andChain.map((group) => buildResource(group.resource)))));
};
