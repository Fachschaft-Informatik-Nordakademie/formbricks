/**
 * FSINF CE: pure logic of the contact CSV import dialog — column to attribute mapping, validation and
 * conversion of parsed CSV rows into import rows. Client-safe (no server imports).
 */
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import { isSafeIdentifier, toSafeIdentifier } from "@/lib/utils/safe-identifier";
import { isReservedFutureDefaultAttributeKey } from "./attribute-key-policy";
import { normalizeAttributeValue } from "./attribute-values";

/** CSV column → attribute key (existing or new). */
export type TColumnMapping = Record<string, string>;

export const MAX_CSV_FILE_BYTES = 800 * 1024;

/** Picks the attribute key a CSV column most likely belongs to. */
export const suggestAttributeKey = (column: string, existingKeys: TContactAttributeKey[]): string => {
  const trimmed = column.trim();
  const exact = existingKeys.find((key) => key.key === trimmed);
  if (exact) return exact.key;
  const insensitive = existingKeys.find(
    (key) =>
      key.key.toLowerCase() === trimmed.toLowerCase() || key.name?.toLowerCase() === trimmed.toLowerCase()
  );
  return insensitive?.key ?? toSafeIdentifier(trimmed);
};

export const buildInitialMapping = (
  columns: string[],
  existingKeys: TContactAttributeKey[]
): TColumnMapping =>
  Object.fromEntries(columns.map((column) => [column, suggestAttributeKey(column, existingKeys)]));

export type TMappingIssue =
  | { type: "duplicate"; keys: string[] }
  | { type: "invalid_name"; keys: string[] }
  | { type: "reserved"; keys: string[] }
  | { type: "no_identity" };

/** Problems that block the upload. Keys that already exist are always fine. */
export const validateMapping = (
  mapping: TColumnMapping,
  existingKeys: TContactAttributeKey[]
): TMappingIssue[] => {
  const known = new Set(existingKeys.map((key) => key.key));
  const targets = Object.values(mapping).filter((key) => key !== "");
  const issues: TMappingIssue[] = [];

  const duplicates = [...new Set(targets.filter((key, index) => targets.indexOf(key) !== index))];
  if (duplicates.length > 0) issues.push({ type: "duplicate", keys: duplicates });

  const newKeys = targets.filter((key) => !known.has(key));
  const reserved = newKeys.filter(isReservedFutureDefaultAttributeKey);
  if (reserved.length > 0) issues.push({ type: "reserved", keys: reserved });
  const invalid = newKeys.filter(
    (key) => !isReservedFutureDefaultAttributeKey(key) && !isSafeIdentifier(key)
  );
  if (invalid.length > 0) issues.push({ type: "invalid_name", keys: invalid });

  if (!targets.includes("email") && !targets.includes("userId")) issues.push({ type: "no_identity" });
  return issues;
};

/** Converts parsed CSV rows (column → cell) into rows keyed by attribute key; unmapped columns are dropped. */
export const buildImportRows = (
  csvRows: Record<string, string>[],
  mapping: TColumnMapping
): Record<string, string>[] =>
  csvRows.map((row) =>
    Object.fromEntries(
      Object.entries(mapping)
        .filter(([, key]) => key !== "")
        .map(([column, key]) => [key, (row[column] ?? "").trim()] as const)
        .filter(([, value]) => value !== "")
    )
  );

export interface TTypeMismatch {
  key: string;
  dataType: string;
  values: string[];
}

/** Values that do not fit the data type of an existing number/date attribute (max 3 examples per key). */
export const findTypeMismatches = (
  rows: Record<string, string>[],
  existingKeys: TContactAttributeKey[]
): TTypeMismatch[] => {
  const mismatches: TTypeMismatch[] = [];
  for (const attributeKey of existingKeys) {
    if (attributeKey.dataType === "string") continue;
    const bad = new Set<string>();
    for (const row of rows) {
      const value = row[attributeKey.key];
      if (value === undefined) continue;
      if (!normalizeAttributeValue(value, attributeKey.dataType).ok) bad.add(value);
    }
    if (bad.size > 0) {
      mismatches.push({
        key: attributeKey.key,
        dataType: attributeKey.dataType,
        values: [...bad].slice(0, 3),
      });
    }
  }
  return mismatches;
};

/** Rows that carry neither an email nor a userId can not be imported. */
export const countRowsWithoutIdentity = (rows: Record<string, string>[]): number =>
  rows.filter((row) => !row.email && !row.userId).length;
