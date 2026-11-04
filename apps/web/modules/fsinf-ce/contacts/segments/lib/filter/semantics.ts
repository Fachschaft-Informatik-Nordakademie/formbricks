/**
 * FSINF CE: the shared meaning of segment filters.
 *
 * Segment membership is computed in two places — in memory for one contact (SDK `/user` hot path)
 * and as a Prisma `where` for many contacts (personal links, counts). Both import the rules from
 * here so they cannot drift apart:
 *
 *  - Connectors follow normal boolean precedence: `and` binds tighter than `or`
 *    (`a or b and c` = `a or (b and c)`).
 *  - String comparisons are case-insensitive.
 *  - Negative operators (`notEquals`, `doesNotContain`, `isNotSet`, `userIsNotIn`, `haveNotSeen`,
 *    `haveNotCompleted`) are the exact negation of their positive counterpart, so a contact that does
 *    not have the attribute at all matches them.
 *  - Arithmetic operators compare the native number column, date operators the native date column;
 *    an attribute without a typed value never matches them.
 *  - Calendar dates (`isBefore`, `isAfter`, `isSameDay`, `isBetween`) are whole UTC days.
 *  - A device filter cannot be evaluated without a request (bulk queries): it is ignored there.
 *  - A segment reference to an unknown/foreign segment or a reference cycle matches nobody.
 */
import type { TBaseFilters, TSegmentConnector, TSegmentFilter, TTimeUnit } from "@formbricks/types/segment";
import { parseIsoDate } from "@/modules/fsinf-ce/contacts/lib/attribute-values";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Splits a filter list into OR-groups of AND-chains (and binds tighter than or). */
export const groupByPrecedence = <T>(items: { connector: TSegmentConnector; value: T }[]): T[][] => {
  const groups: T[][] = [];
  for (const [index, item] of items.entries()) {
    if (index === 0 || item.connector !== "and") {
      groups.push([item.value]);
    } else {
      groups[groups.length - 1].push(item.value);
    }
  }
  return groups;
};

/** `now` minus `amount` units, calendar-aware for months/years. */
export const subtractTime = (now: Date, amount: number, unit: TTimeUnit): Date => {
  const result = new Date(now.getTime());
  switch (unit) {
    case "days":
      return new Date(now.getTime() - amount * DAY_MS);
    case "weeks":
      return new Date(now.getTime() - amount * 7 * DAY_MS);
    case "months":
      result.setUTCMonth(result.getUTCMonth() - amount);
      return result;
    case "years":
      result.setUTCFullYear(result.getUTCFullYear() - amount);
      return result;
  }
};

/** Start of the UTC day of an ISO date string, or null when unparseable. */
export const startOfUtcDay = (raw: string): Date | null => {
  const parsed = parseIsoDate(raw);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/**
 * Date operator → half-open range `[gte, lt)` on the attribute date. `null` means the filter value
 * is unusable and the filter matches nobody. `isSet` / `isNotSet` are handled by the callers.
 */
export const getDateRange = (filter: TSegmentFilter, now: Date): { gte?: Date; lt?: Date } | null => {
  const { operator } = filter.qualifier;
  const { value } = filter;

  if (operator === "isOlderThan" || operator === "isNewerThan") {
    if (typeof value !== "object" || Array.isArray(value) || !("amount" in value) || !("unit" in value)) {
      return null;
    }
    const boundary = subtractTime(now, value.amount, value.unit);
    return operator === "isOlderThan" ? { lt: boundary } : { gte: boundary };
  }

  if (operator === "isBetween") {
    if (!Array.isArray(value)) return null;
    const start = startOfUtcDay(value[0]);
    const end = startOfUtcDay(value[1]);
    if (!start || !end) return null;
    return { gte: start, lt: addDays(end, 1) };
  }

  if (typeof value !== "string") return null;
  const day = startOfUtcDay(value);
  if (!day) return null;

  switch (operator) {
    case "isBefore":
      return { lt: day };
    case "isAfter":
      return { gte: addDays(day, 1) };
    case "isSameDay":
      return { gte: day, lt: addDays(day, 1) };
    default:
      return null;
  }
};

export const isInDateRange = (date: Date, range: { gte?: Date; lt?: Date }): boolean =>
  (range.gte === undefined || date.getTime() >= range.gte.getTime()) &&
  (range.lt === undefined || date.getTime() < range.lt.getTime());

/** Collects every segment id referenced (directly) by a filter tree. */
export const collectReferencedSegmentIds = (filters: TBaseFilters): string[] => {
  const ids: string[] = [];
  const walk = (list: TBaseFilters) => {
    for (const group of list) {
      if (Array.isArray(group.resource)) {
        walk(group.resource);
      } else if (group.resource.root.type === "segment") {
        ids.push(group.resource.root.segmentId);
      }
    }
  };
  walk(filters);
  return ids;
};

/** True when the tree contains at least one filter of the given root type (nested trees included). */
export const hasFilterOfType = (filters: TBaseFilters, type: TSegmentFilter["root"]["type"]): boolean =>
  filters.some((group) =>
    Array.isArray(group.resource) ? hasFilterOfType(group.resource, type) : group.resource.root.type === type
  );
