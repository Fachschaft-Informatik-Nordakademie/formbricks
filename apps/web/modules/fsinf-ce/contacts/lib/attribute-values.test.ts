import { describe, expect, test } from "vitest";
import {
  MAX_ATTRIBUTE_VALUE_LENGTH,
  inferAttributeDataType,
  normalizeAttributeValue,
  parseIsoDate,
} from "./attribute-values";

describe("parseIsoDate", () => {
  test("parses bare dates as UTC midnight", () => {
    expect(parseIsoDate("2024-03-05")?.toISOString()).toBe("2024-03-05T00:00:00.000Z");
  });

  test("parses date-times with zone", () => {
    expect(parseIsoDate("2024-03-05T10:20:30+02:00")?.toISOString()).toBe("2024-03-05T08:20:30.000Z");
  });

  test("rejects loose formats", () => {
    expect(parseIsoDate("05.03.2024")).toBeNull();
    expect(parseIsoDate("tomorrow")).toBeNull();
    expect(parseIsoDate("2024-13-45")).toBeNull();
  });
});

describe("inferAttributeDataType", () => {
  test("infers from the JS type and strict ISO dates", () => {
    expect(inferAttributeDataType(42)).toBe("number");
    expect(inferAttributeDataType("42")).toBe("string");
    expect(inferAttributeDataType("2024-01-01")).toBe("date");
    expect(inferAttributeDataType(true)).toBe("string");
    expect(inferAttributeDataType("group-a")).toBe("string");
  });
});

describe("normalizeAttributeValue", () => {
  test("strings keep their value and leave typed columns empty", () => {
    expect(normalizeAttributeValue("true", "string")).toEqual({
      ok: true,
      data: { value: "true", valueNumber: null, valueDate: null },
    });
    expect(normalizeAttributeValue(false, "string")).toEqual({
      ok: true,
      data: { value: "false", valueNumber: null, valueDate: null },
    });
  });

  test("numbers accept JS numbers and numeric strings", () => {
    expect(normalizeAttributeValue(3.5, "number")).toEqual({
      ok: true,
      data: { value: "3.5", valueNumber: 3.5, valueDate: null },
    });
    expect(normalizeAttributeValue(" 7 ", "number")).toEqual({
      ok: true,
      data: { value: "7", valueNumber: 7, valueDate: null },
    });
    expect(normalizeAttributeValue("abc", "number")).toEqual({ ok: false, error: "invalid_number" });
    expect(normalizeAttributeValue("", "number")).toEqual({ ok: false, error: "invalid_number" });
  });

  test("dates are stored as ISO strings plus native date", () => {
    const result = normalizeAttributeValue("2024-02-29", "date");
    expect(result).toEqual({
      ok: true,
      data: {
        value: "2024-02-29T00:00:00.000Z",
        valueNumber: null,
        valueDate: new Date("2024-02-29T00:00:00.000Z"),
      },
    });
    expect(normalizeAttributeValue("yesterday", "date")).toEqual({ ok: false, error: "invalid_date" });
  });

  test("rejects oversized values", () => {
    expect(normalizeAttributeValue("x".repeat(MAX_ATTRIBUTE_VALUE_LENGTH + 1), "string")).toEqual({
      ok: false,
      error: "too_long",
    });
  });
});
