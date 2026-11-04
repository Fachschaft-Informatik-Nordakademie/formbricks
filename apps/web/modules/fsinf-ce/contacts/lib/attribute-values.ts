/**
 * FSINF CE: pure helpers that turn raw attribute input (SDK, CSV, API, UI) into the three storage
 * columns of `ContactAttribute` (`value` string + typed `valueNumber` / `valueDate`).
 *
 * The string column is always written (backwards compatibility and string filters); the typed column
 * matching the key's `dataType` is written as well so segment filters can compare natively in SQL.
 */
import type { TContactAttributeDataType } from "@formbricks/types/contact-attribute-key";

/** Upper bound for a single attribute value — attributes are targeting data, not documents. */
export const MAX_ATTRIBUTE_VALUE_LENGTH = 1000;

export type TAttributeInputValue = string | number | boolean;

export interface TNormalizedAttributeValue {
  value: string;
  valueNumber: number | null;
  valueDate: Date | null;
}

export type TNormalizeResult =
  | { ok: true; data: TNormalizedAttributeValue }
  | { ok: false; error: "too_long" | "invalid_number" | "invalid_date" };

// Strict ISO 8601 date (YYYY-MM-DD) or date-time with optional fraction and zone.
const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Parses a strict ISO date / date-time string. Returns null for anything else. */
export const parseIsoDate = (raw: string): Date | null => {
  const trimmed = raw.trim();
  if (!ISO_DATE_REGEX.test(trimmed)) return null;
  // A bare date is interpreted as UTC midnight so it never shifts with the server time zone.
  const date = new Date(trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Infers the data type of a brand-new attribute key from the first value it receives. Numbers sent as
 * JS numbers are numeric, strict ISO dates are dates, everything else (incl. booleans) is a string.
 */
export const inferAttributeDataType = (raw: TAttributeInputValue): TContactAttributeDataType => {
  if (typeof raw === "number" && Number.isFinite(raw)) return "number";
  if (typeof raw === "string" && parseIsoDate(raw)) return "date";
  return "string";
};

export const normalizeAttributeValue = (
  raw: TAttributeInputValue,
  dataType: TContactAttributeDataType
): TNormalizeResult => {
  const asString = typeof raw === "string" ? raw : String(raw);
  if (asString.length > MAX_ATTRIBUTE_VALUE_LENGTH) return { ok: false, error: "too_long" };

  if (dataType === "number") {
    const parsed = typeof raw === "number" ? (Number.isFinite(raw) ? raw : null) : parseNumber(asString);
    if (parsed === null) return { ok: false, error: "invalid_number" };
    return { ok: true, data: { value: String(parsed), valueNumber: parsed, valueDate: null } };
  }

  if (dataType === "date") {
    const parsed = typeof raw === "number" ? new Date(raw) : parseIsoDate(asString);
    if (!parsed || Number.isNaN(parsed.getTime())) return { ok: false, error: "invalid_date" };
    return { ok: true, data: { value: parsed.toISOString(), valueNumber: null, valueDate: parsed } };
  }

  return { ok: true, data: { value: asString, valueNumber: null, valueDate: null } };
};
