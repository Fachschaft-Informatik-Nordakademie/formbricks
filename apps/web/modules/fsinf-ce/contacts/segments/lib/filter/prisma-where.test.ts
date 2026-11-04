import { describe, expect, test } from "vitest";
import type { TBaseFilters } from "@formbricks/types/segment";
import { buildContactWhereFromFilters } from "./prisma-where";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const WS = "ws1";

const attr = (key: string, operator: string, value: unknown, connector: "and" | "or" | null = null) => ({
  id: `f_${key}_${operator}`,
  connector,
  resource: {
    id: "a",
    root: { type: "attribute", contactAttributeKey: key },
    qualifier: { operator },
    value,
  },
});

const build = (filters: unknown[], segments: Record<string, TBaseFilters> = {}) =>
  buildContactWhereFromFilters(filters as TBaseFilters, {
    now: NOW,
    workspaceId: WS,
    resolveSegmentFilters: (id) => segments[id],
  });

const some = (key: string, condition: Record<string, unknown>) => ({
  attributes: { some: { attributeKey: { key, workspaceId: WS }, ...condition } },
});

describe("buildContactWhereFromFilters", () => {
  test("empty filters match all contacts", () => {
    expect(build([])).toEqual({});
  });

  test("string equality is case-insensitive and negation wraps in NOT", () => {
    expect(build([attr("group_vorstand", "equals", "true")])).toEqual(
      some("group_vorstand", { value: { equals: "true", mode: "insensitive" } })
    );
    expect(build([attr("group_vorstand", "notEquals", "true")])).toEqual({
      NOT: some("group_vorstand", { value: { equals: "true", mode: "insensitive" } }),
    });
  });

  test("numbers use the typed column", () => {
    expect(build([attr("semester", "greaterEqual", 3)])).toEqual(
      some("semester", { valueNumber: { gte: 3 } })
    );
    expect(build([attr("semester", "equals", 3)])).toEqual(some("semester", { valueNumber: 3 }));
  });

  test("dates translate to UTC day ranges", () => {
    expect(build([attr("d", "isSameDay", "2026-06-01")])).toEqual(
      some("d", {
        valueDate: {
          not: null,
          gte: new Date("2026-06-01T00:00:00.000Z"),
          lt: new Date("2026-06-02T00:00:00.000Z"),
        },
      })
    );
    expect(build([attr("d", "isNewerThan", { amount: 2, unit: "days" })])).toEqual(
      some("d", { valueDate: { not: null, gte: new Date("2026-06-13T12:00:00.000Z") } })
    );
  });

  test("and binds tighter than or", () => {
    const where = build([
      attr("a", "isSet", ""),
      attr("b", "isSet", "", "or"),
      attr("c", "isSet", "", "and"),
    ]);
    expect(where).toEqual({
      OR: [
        some("a", { value: { not: "" } }),
        { AND: [some("b", { value: { not: "" } }), some("c", { value: { not: "" } })] },
      ],
    });
  });

  test("device filters are ignored in bulk queries", () => {
    expect(
      build([
        {
          id: "d",
          connector: null,
          resource: {
            id: "d",
            root: { type: "device", deviceType: "phone" },
            qualifier: { operator: "equals" },
            value: "phone",
          },
        },
      ])
    ).toEqual({});
  });

  test("survey interaction filters query displays and responses", () => {
    const since = new Date("2026-06-08T12:00:00.000Z");
    const interaction = (operator: string) => ({
      id: "i",
      connector: null,
      resource: {
        id: "i",
        root: { type: "surveyInteraction" },
        qualifier: { operator },
        value: { surveyScope: "specific", surveyIds: ["s1"], within: { amount: 1, unit: "weeks" } },
      },
    });
    expect(build([interaction("haveSeen")])).toEqual({
      displays: { some: { createdAt: { gte: since }, surveyId: { in: ["s1"] } } },
    });
    expect(build([interaction("haveNotCompleted")])).toEqual({
      NOT: { responses: { some: { createdAt: { gte: since }, surveyId: { in: ["s1"] }, finished: true } } },
    });
  });

  test("segment references resolve and cycles match nobody", () => {
    const ref = (segmentId: string, operator: string) => ({
      id: "s",
      connector: null,
      resource: { id: "s", root: { type: "segment", segmentId }, qualifier: { operator }, value: segmentId },
    });
    const segments = {
      vorstand: [attr("group_vorstand", "equals", "true")] as unknown as TBaseFilters,
      everyone: [] as TBaseFilters,
      loop: [ref("loop", "userIsIn")] as unknown as TBaseFilters,
    };
    expect(build([ref("vorstand", "userIsIn")], segments)).toEqual(
      some("group_vorstand", { value: { equals: "true", mode: "insensitive" } })
    );
    expect(build([ref("everyone", "userIsNotIn")], segments)).toEqual({ id: { in: [] } });
    expect(build([ref("loop", "userIsIn")], segments)).toEqual({ id: { in: [] } });
    expect(build([ref("missing", "userIsIn")], segments)).toEqual({ id: { in: [] } });
  });
});
