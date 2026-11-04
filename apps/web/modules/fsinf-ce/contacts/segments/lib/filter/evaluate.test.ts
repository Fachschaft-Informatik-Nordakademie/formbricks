import { describe, expect, test } from "vitest";
import type { TBaseFilters, TSegmentFilter } from "@formbricks/types/segment";
import { TSegmentEvaluationContact, evaluateSegmentFilters } from "./evaluate";

const NOW = new Date("2026-06-15T12:00:00.000Z");

const leaf = (resource: unknown, connector: "and" | "or" | null = null) => ({
  id: `f_${Math.random().toString(36).slice(2, 10)}`,
  connector,
  resource: resource as TSegmentFilter,
});

const attr = (key: string, operator: string, value: unknown, connector: "and" | "or" | null = null) =>
  leaf(
    {
      id: "a",
      root: { type: "attribute", contactAttributeKey: key },
      qualifier: { operator },
      value,
    },
    connector
  );

const contact = (overrides: Partial<TSegmentEvaluationContact> = {}): TSegmentEvaluationContact => ({
  attributes: {
    userId: { value: "u-1", valueNumber: null, valueDate: null },
    email: { value: "Max@Example.org", valueNumber: null, valueDate: null },
    group_vorstand: { value: "true", valueNumber: null, valueDate: null },
    semester: { value: "3", valueNumber: 3, valueDate: null },
    enrolled_at: {
      value: "2026-06-01T00:00:00.000Z",
      valueNumber: null,
      valueDate: new Date("2026-06-01T00:00:00.000Z"),
    },
  },
  deviceType: "desktop",
  displays: [],
  responses: [],
  ...overrides,
});

const evaluate = (
  filters: unknown[],
  c: TSegmentEvaluationContact = contact(),
  segments: Record<string, TBaseFilters> = {}
) =>
  evaluateSegmentFilters(filters as TBaseFilters, c, {
    now: NOW,
    resolveSegmentFilters: (id) => segments[id],
  });

describe("evaluateSegmentFilters — structure", () => {
  test("empty filters match everyone", () => {
    expect(evaluate([])).toBe(true);
  });

  test("and binds tighter than or", () => {
    // false or (true and true) => true
    expect(
      evaluate([
        attr("group_vorstand", "equals", "false"),
        attr("group_vorstand", "equals", "true", "or"),
        attr("semester", "equals", 3, "and"),
      ])
    ).toBe(true);
    // (true and false) or false => false
    expect(
      evaluate([
        attr("group_vorstand", "equals", "true"),
        attr("semester", "equals", 4, "and"),
        attr("email", "equals", "nobody", "or"),
      ])
    ).toBe(false);
  });

  test("nested groups are evaluated as one operand", () => {
    expect(
      evaluate([
        attr("semester", "equals", 3),
        leaf([attr("group_vorstand", "equals", "false"), attr("email", "contains", "example", "or")], "and"),
      ])
    ).toBe(true);
  });
});

describe("evaluateSegmentFilters — string attributes", () => {
  test("equals is case-insensitive and notEquals matches missing attributes", () => {
    expect(evaluate([attr("email", "equals", "max@example.org")])).toBe(true);
    expect(evaluate([attr("group_fsr", "notEquals", "true")])).toBe(true);
    expect(evaluate([attr("group_vorstand", "notEquals", "TRUE")])).toBe(false);
  });

  test("text operators", () => {
    expect(evaluate([attr("email", "contains", "EXAMPLE")])).toBe(true);
    expect(evaluate([attr("email", "doesNotContain", "example")])).toBe(false);
    expect(evaluate([attr("email", "startsWith", "max@")])).toBe(true);
    expect(evaluate([attr("email", "endsWith", ".de")])).toBe(false);
    expect(evaluate([attr("missing", "doesNotContain", "x")])).toBe(true);
  });

  test("isSet / isNotSet", () => {
    expect(evaluate([attr("group_vorstand", "isSet", "")])).toBe(true);
    expect(evaluate([attr("group_fsr", "isSet", "")])).toBe(false);
    expect(evaluate([attr("group_fsr", "isNotSet", "")])).toBe(true);
    const empty = contact({ attributes: { x: { value: "", valueNumber: null, valueDate: null } } });
    expect(evaluate([attr("x", "isSet", "")], empty)).toBe(false);
  });
});

describe("evaluateSegmentFilters — number attributes", () => {
  test("arithmetic compares the numeric column", () => {
    expect(evaluate([attr("semester", "greaterThan", 2)])).toBe(true);
    expect(evaluate([attr("semester", "greaterEqual", 3)])).toBe(true);
    expect(evaluate([attr("semester", "lessThan", 3)])).toBe(false);
    expect(evaluate([attr("semester", "lessEqual", 3)])).toBe(true);
    expect(evaluate([attr("semester", "equals", 3)])).toBe(true);
    expect(evaluate([attr("semester", "notEquals", 3)])).toBe(false);
  });

  test("arithmetic never matches missing or non-numeric values", () => {
    expect(evaluate([attr("email", "greaterThan", 0)])).toBe(false);
    expect(evaluate([attr("missing", "lessThan", 100)])).toBe(false);
  });
});

describe("evaluateSegmentFilters — date attributes", () => {
  test("relative operators", () => {
    expect(evaluate([attr("enrolled_at", "isNewerThan", { amount: 30, unit: "days" })])).toBe(true);
    expect(evaluate([attr("enrolled_at", "isOlderThan", { amount: 1, unit: "weeks" })])).toBe(true);
    expect(evaluate([attr("enrolled_at", "isOlderThan", { amount: 1, unit: "months" })])).toBe(false);
  });

  test("calendar operators use whole UTC days", () => {
    expect(evaluate([attr("enrolled_at", "isSameDay", "2026-06-01")])).toBe(true);
    expect(evaluate([attr("enrolled_at", "isBefore", "2026-06-01")])).toBe(false);
    expect(evaluate([attr("enrolled_at", "isBefore", "2026-06-02")])).toBe(true);
    expect(evaluate([attr("enrolled_at", "isAfter", "2026-05-31")])).toBe(true);
    expect(evaluate([attr("enrolled_at", "isAfter", "2026-06-01")])).toBe(false);
    expect(evaluate([attr("enrolled_at", "isBetween", ["2026-05-01", "2026-06-01"])])).toBe(true);
    expect(evaluate([attr("enrolled_at", "isBetween", ["2026-06-02", "2026-06-30"])])).toBe(false);
  });

  test("date operators never match attributes without a date", () => {
    expect(evaluate([attr("email", "isNewerThan", { amount: 1, unit: "years" })])).toBe(false);
  });
});

describe("evaluateSegmentFilters — person, device, segment", () => {
  test("person filter reads the userId attribute", () => {
    const person = leaf({
      id: "p",
      root: { type: "person", personIdentifier: "userId" },
      qualifier: { operator: "equals" },
      value: "U-1",
    });
    expect(evaluate([person])).toBe(true);
  });

  test("device filter compares the request device and is ignored when unknown", () => {
    const phone = leaf({
      id: "d",
      root: { type: "device", deviceType: "phone" },
      qualifier: { operator: "equals" },
      value: "phone",
    });
    expect(evaluate([phone])).toBe(false);
    expect(evaluate([phone], contact({ deviceType: "phone" }))).toBe(true);
    expect(evaluate([phone], contact({ deviceType: null }))).toBe(true);
  });

  test("segment references resolve, negate and stop at cycles or unknown ids", () => {
    const segRef = (segmentId: string, operator: "userIsIn" | "userIsNotIn") =>
      leaf({ id: "s", root: { type: "segment", segmentId }, qualifier: { operator }, value: segmentId });

    const segments: Record<string, TBaseFilters> = {
      vorstand: [attr("group_vorstand", "equals", "true")] as TBaseFilters,
      loopA: [segRef("loopB", "userIsIn")] as TBaseFilters,
      loopB: [segRef("loopA", "userIsIn")] as TBaseFilters,
    };

    expect(evaluate([segRef("vorstand", "userIsIn")], contact(), segments)).toBe(true);
    expect(evaluate([segRef("vorstand", "userIsNotIn")], contact(), segments)).toBe(false);
    expect(evaluate([segRef("loopA", "userIsIn")], contact(), segments)).toBe(false);
    expect(evaluate([segRef("unknown", "userIsIn")], contact(), segments)).toBe(false);
    expect(evaluate([segRef("unknown", "userIsNotIn")], contact(), segments)).toBe(false);
  });
});

describe("evaluateSegmentFilters — survey interaction", () => {
  const interaction = (operator: string, surveyScope: "any" | "specific", surveyIds: string[] = []) =>
    leaf({
      id: "i",
      root: { type: "surveyInteraction" },
      qualifier: { operator },
      value: { surveyScope, surveyIds, within: { amount: 7, unit: "days" } },
    });

  const withActivity = contact({
    displays: [
      { surveyId: "s1", createdAt: new Date("2026-06-14T00:00:00.000Z") },
      { surveyId: "s2", createdAt: new Date("2026-05-01T00:00:00.000Z") },
    ],
    responses: [
      { surveyId: "s1", createdAt: new Date("2026-06-14T00:01:00.000Z"), finished: false },
      { surveyId: "s3", createdAt: new Date("2026-06-13T00:00:00.000Z"), finished: true },
    ],
  });

  test("seen within the window", () => {
    expect(evaluate([interaction("haveSeen", "specific", ["s1"])], withActivity)).toBe(true);
    expect(evaluate([interaction("haveSeen", "specific", ["s2"])], withActivity)).toBe(false);
    expect(evaluate([interaction("haveNotSeen", "specific", ["s2"])], withActivity)).toBe(true);
    expect(evaluate([interaction("haveSeen", "any")], withActivity)).toBe(true);
    expect(evaluate([interaction("haveSeen", "any")])).toBe(false);
  });

  test("started vs completed", () => {
    expect(evaluate([interaction("haveStartedRespondingTo", "specific", ["s1"])], withActivity)).toBe(true);
    expect(evaluate([interaction("haveCompleted", "specific", ["s1"])], withActivity)).toBe(false);
    expect(evaluate([interaction("haveNotCompleted", "specific", ["s1"])], withActivity)).toBe(true);
    expect(evaluate([interaction("haveCompleted", "any")], withActivity)).toBe(true);
  });
});
