import { describe, expect, test } from "vitest";
import type { TBaseFilters } from "@formbricks/types/segment";
import { ZSegmentFilters } from "@formbricks/types/segment";
import {
  addFilterToTree,
  countFilters,
  createAttributeFilter,
  createDeviceFilter,
  createSurveyInteractionFilter,
  findFirstInvalidFilter,
  getOperatorsForDataType,
  removeNodeFromTree,
  toggleConnectorInTree,
  updateFilterInTree,
  validateFilterValue,
  wrapNodeInGroup,
} from "./segment-filter-utils";

const build = (): TBaseFilters => {
  let tree: TBaseFilters = [];
  tree = addFilterToTree(tree, createAttributeFilter("group_vorstand", "string"));
  tree = addFilterToTree(tree, createDeviceFilter("phone"));
  tree = addFilterToTree(tree, createAttributeFilter("semester", "number"));
  return tree;
};

describe("filter tree edits", () => {
  test("first filter has no connector, later ones default to and", () => {
    const tree = build();
    expect(tree.map((node) => node.connector)).toEqual([null, "and", "and"]);
    expect(countFilters(tree)).toBe(3);
  });

  test("toggle flips and/or but never the first node", () => {
    const tree = build();
    const toggled = toggleConnectorInTree(toggleConnectorInTree(tree, tree[1].id), tree[0].id);
    expect(toggled.map((node) => node.connector)).toEqual([null, "or", "and"]);
  });

  test("removing the first node promotes the next one", () => {
    const tree = build();
    const result = removeNodeFromTree(tree, tree[0].id);
    expect(result.map((node) => node.connector)).toEqual([null, "and"]);
  });

  test("wrapping into a group keeps position and removing the last child drops the group", () => {
    const tree = build();
    const wrapped = wrapNodeInGroup(tree, tree[1].id);
    expect(Array.isArray(wrapped[1].resource)).toBe(true);
    expect(wrapped[1].connector).toBe("and");
    const group = wrapped[1].resource as TBaseFilters;
    expect(group[0].connector).toBeNull();
    expect(removeNodeFromTree(wrapped, group[0].id)).toHaveLength(2);
  });

  test("adding into a group appends there", () => {
    const base = build();
    const grouped = wrapNodeInGroup(base, base[0].id);
    const result = addFilterToTree(grouped, createDeviceFilter("desktop"), grouped[0].id);
    expect((result[0].resource as TBaseFilters).length).toBe(2);
  });

  test("update replaces a leaf", () => {
    const tree = build();
    const updated = updateFilterInTree(tree, tree[2].id, (filter) => ({
      ...filter,
      value: 5,
    }));
    expect((updated[2].resource as { value: unknown }).value).toBe(5);
  });

  test("generated trees satisfy the shared schema once values are filled", () => {
    const tree = build();
    expect(ZSegmentFilters.safeParse(tree).success).toBe(false); // empty string value of group_vorstand
    const filled = updateFilterInTree(tree, tree[0].id, (filter) => ({ ...filter, value: "true" }));
    expect(ZSegmentFilters.safeParse(filled).success).toBe(true);
  });
});

describe("operators and validation", () => {
  test("operators depend on data type", () => {
    expect(getOperatorsForDataType("string")).toContain("contains");
    expect(getOperatorsForDataType("number")).toContain("greaterThan");
    expect(getOperatorsForDataType("number")).not.toContain("contains");
    expect(getOperatorsForDataType("date")).toContain("isBetween");
  });

  test("validates values per operator", () => {
    expect(validateFilterValue(createAttributeFilter("a", "string"))).toBe("empty");
    expect(validateFilterValue(createAttributeFilter("n", "number"))).toBeNull();
    expect(validateFilterValue(createAttributeFilter("d", "date"))).toBeNull(); // {30 days}
    const interaction = createSurveyInteractionFilter();
    expect(validateFilterValue(interaction)).toBeNull();
    const specific = {
      ...interaction,
      value: { surveyScope: "specific", surveyIds: [], within: { amount: 1, unit: "days" } },
    } as typeof interaction;
    expect(validateFilterValue(specific)).toBe("survey_required");
  });

  test("finds the first invalid filter in nested groups", () => {
    const tree = build();
    const grouped = wrapNodeInGroup(tree, tree[0].id);
    expect(findFirstInvalidFilter([])).toBeNull();
    expect(findFirstInvalidFilter(grouped)?.root).toEqual({
      type: "attribute",
      contactAttributeKey: "group_vorstand",
    });
  });
});
