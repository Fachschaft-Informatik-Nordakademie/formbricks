/**
 * FSINF CE: pure helpers of the segment filter editor — tree edits, default filters, operator lists
 * per attribute data type and value validation. No React, unit tested.
 */
import { createId } from "@paralleldrive/cuid2";
import type { TContactAttributeDataType } from "@formbricks/types/contact-attribute-key";
import {
  DATE_OPERATORS,
  NUMBER_TYPE_OPERATORS,
  STRING_TYPE_OPERATORS,
  type TBaseFilter,
  type TBaseFilters,
  type TSegmentConnector,
  type TSegmentFilter,
  type TSegmentFilterValue,
} from "@formbricks/types/segment";

export type TFilterOperator = TSegmentFilter["qualifier"]["operator"];

/** Operators offered for an attribute of the given data type. */
export const getOperatorsForDataType = (dataType: TContactAttributeDataType): readonly string[] => {
  if (dataType === "number") return NUMBER_TYPE_OPERATORS;
  if (dataType === "date") return DATE_OPERATORS;
  return STRING_TYPE_OPERATORS;
};

export const isValuelessOperator = (operator: string): boolean =>
  operator === "isSet" || operator === "isNotSet";

const defaultValueFor = (dataType: TContactAttributeDataType, operator: string): TSegmentFilterValue => {
  if (isValuelessOperator(operator)) return "";
  if (dataType === "number") return 0;
  if (dataType === "date") {
    if (operator === "isOlderThan" || operator === "isNewerThan") return { amount: 30, unit: "days" };
    if (operator === "isBetween") return ["", ""];
    return "";
  }
  return "";
};

/** A new value that fits the operator when the user switches to it. */
export const getDefaultValueForOperator = (
  dataType: TContactAttributeDataType,
  operator: string
): TSegmentFilterValue => defaultValueFor(dataType, operator);

export const createAttributeFilter = (key: string, dataType: TContactAttributeDataType): TSegmentFilter => {
  const operator = dataType === "date" ? "isNewerThan" : "equals";
  return {
    id: createId(),
    root: { type: "attribute", contactAttributeKey: key },
    qualifier: { operator },
    value: defaultValueFor(dataType, operator),
  } as TSegmentFilter;
};

export const createPersonFilter = (): TSegmentFilter =>
  ({
    id: createId(),
    root: { type: "person", personIdentifier: "userId" },
    qualifier: { operator: "equals" },
    value: "",
  }) as TSegmentFilter;

export const createSegmentFilter = (segmentId: string): TSegmentFilter =>
  ({
    id: createId(),
    root: { type: "segment", segmentId },
    qualifier: { operator: "userIsIn" },
    value: segmentId,
  }) as TSegmentFilter;

export const createDeviceFilter = (deviceType: "phone" | "desktop"): TSegmentFilter =>
  ({
    id: createId(),
    root: { type: "device", deviceType },
    qualifier: { operator: "equals" },
    value: deviceType,
  }) as TSegmentFilter;

export const createSurveyInteractionFilter = (): TSegmentFilter =>
  ({
    id: createId(),
    root: { type: "surveyInteraction" },
    qualifier: { operator: "haveSeen" },
    value: { surveyScope: "any", surveyIds: [], within: { amount: 30, unit: "days" } },
  }) as TSegmentFilter;

const isGroup = (resource: TBaseFilter["resource"]): resource is TBaseFilters => Array.isArray(resource);

/** Adds a filter to the end of the root list (or of the group with `groupId`). */
export const addFilterToTree = (
  tree: TBaseFilters,
  filter: TSegmentFilter,
  groupId?: string
): TBaseFilters => {
  const node = (connector: TSegmentConnector): TBaseFilter => ({
    id: createId(),
    connector,
    resource: filter,
  });
  if (!groupId) return [...tree, node(tree.length === 0 ? null : "and")];
  return tree.map((item) => {
    if (!isGroup(item.resource)) return item;
    if (item.id === groupId) {
      return { ...item, resource: [...item.resource, node(item.resource.length === 0 ? null : "and")] };
    }
    return { ...item, resource: addFilterToTree(item.resource, filter, groupId) };
  });
};

/** Makes sure the first item of every list has no connector and all others have one. */
const normalizeConnectors = (tree: TBaseFilters): TBaseFilters =>
  tree.map((item, index) => ({
    ...item,
    connector: index === 0 ? null : (item.connector ?? "and"),
    resource: isGroup(item.resource) ? normalizeConnectors(item.resource) : item.resource,
  }));

/** Removes a node; groups that become empty disappear with it. */
export const removeNodeFromTree = (tree: TBaseFilters, nodeId: string): TBaseFilters =>
  normalizeConnectors(
    tree
      .filter((item) => item.id !== nodeId)
      .map((item) =>
        isGroup(item.resource) ? { ...item, resource: removeNodeFromTree(item.resource, nodeId) } : item
      )
      .filter((item) => !isGroup(item.resource) || item.resource.length > 0)
  );

export const toggleConnectorInTree = (tree: TBaseFilters, nodeId: string): TBaseFilters =>
  tree.map((item) => {
    if (item.id === nodeId && item.connector) {
      return { ...item, connector: item.connector === "and" ? "or" : "and" };
    }
    return isGroup(item.resource)
      ? { ...item, resource: toggleConnectorInTree(item.resource, nodeId) }
      : item;
  });

/** Replaces the filter resource of a leaf node. */
export const updateFilterInTree = (
  tree: TBaseFilters,
  nodeId: string,
  update: (filter: TSegmentFilter) => TSegmentFilter
): TBaseFilters =>
  tree.map((item) => {
    if (isGroup(item.resource))
      return { ...item, resource: updateFilterInTree(item.resource, nodeId, update) };
    return item.id === nodeId ? { ...item, resource: update(item.resource) } : item;
  });

/** Wraps a leaf node into a new group of its own (keeps its position and connector). */
export const wrapNodeInGroup = (tree: TBaseFilters, nodeId: string): TBaseFilters =>
  tree.map((item) => {
    if (item.id === nodeId && !isGroup(item.resource)) {
      return {
        id: createId(),
        connector: item.connector,
        resource: [{ ...item, connector: null }],
      };
    }
    return isGroup(item.resource) ? { ...item, resource: wrapNodeInGroup(item.resource, nodeId) } : item;
  });

export const countFilters = (tree: TBaseFilters): number =>
  tree.reduce((sum, item) => sum + (isGroup(item.resource) ? countFilters(item.resource) : 1), 0);

export type TFilterValidationError = "empty" | "not_a_number" | "not_positive" | "survey_required" | null;

/** Client-side check mirroring ZSegmentFilter, to show an inline message per row. */
export const validateFilterValue = (filter: TSegmentFilter): TFilterValidationError => {
  const { operator } = filter.qualifier;
  const { value } = filter;

  if (filter.root.type === "surveyInteraction") {
    const interaction = value as { surveyScope: string; surveyIds: string[]; within: { amount: number } };
    if (interaction.surveyScope === "specific" && interaction.surveyIds.length === 0)
      return "survey_required";
    if (!(interaction.within.amount >= 1)) return "not_positive";
    return null;
  }
  if (isValuelessOperator(operator)) return null;
  if (filter.root.type === "device" || filter.root.type === "segment") return null;

  if (operator === "isOlderThan" || operator === "isNewerThan") {
    const relative = value as { amount: number };
    return relative.amount > 0 ? null : "not_positive";
  }
  if (operator === "isBetween") {
    const range = value as [string, string];
    return range[0] && range[1] ? null : "empty";
  }
  if (["lessThan", "lessEqual", "greaterThan", "greaterEqual"].includes(operator)) {
    return typeof value === "number" && Number.isFinite(value) ? null : "not_a_number";
  }
  if (typeof value === "number") return Number.isFinite(value) ? null : "not_a_number";
  return typeof value === "string" && value.length > 0 ? null : "empty";
};

export const findFirstInvalidFilter = (tree: TBaseFilters): TSegmentFilter | null => {
  for (const item of tree) {
    if (isGroup(item.resource)) {
      const nested = findFirstInvalidFilter(item.resource);
      if (nested) return nested;
    } else if (validateFilterValue(item.resource)) {
      return item.resource;
    }
  }
  return null;
};
