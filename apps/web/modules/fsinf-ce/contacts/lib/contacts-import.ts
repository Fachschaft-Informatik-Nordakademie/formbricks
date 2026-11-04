/**
 * FSINF CE: bulk create/update of contacts (CSV upload in the UI, `PUT /api/v2/management/contacts/bulk`).
 *
 * A row identifies its contact by `email` or `userId` (both unique per workspace). Existing contacts
 * are skipped, updated (given attributes only) or overwritten (attributes not in the row are removed)
 * according to `duplicateAction`.
 */
import "server-only";
import { prisma } from "@formbricks/database";
import { upsertContactAttributes } from "./contact-attributes";

export const MAX_IMPORT_ROWS = 5000;

export type TDuplicateAction = "skip" | "update" | "overwrite";

export interface TImportResult {
  created: number;
  updated: number;
  skipped: { index: number; reason: string; identifier: string }[];
  errors: string[];
}

const IDENTITY_KEYS = ["email", "userId"] as const;

const getIdentifier = (row: Record<string, string>) => row.email?.trim() || row.userId?.trim() || "";

export const importContacts = async (
  workspaceId: string,
  rows: Record<string, string>[],
  duplicateAction: TDuplicateAction
): Promise<TImportResult> => {
  const result: TImportResult = { created: 0, updated: 0, skipped: [], errors: [] };
  if (rows.length > MAX_IMPORT_ROWS) {
    result.errors.push(`At most ${MAX_IMPORT_ROWS} contacts can be imported at once`);
    return result;
  }

  // Existing contacts by identity value, resolved with one query.
  const identityValues = rows.flatMap((row) =>
    IDENTITY_KEYS.map((key) => row[key]?.trim()).filter((value): value is string => !!value)
  );
  const existing = identityValues.length
    ? await prisma.contactAttribute.findMany({
        where: {
          attributeKey: { workspaceId, key: { in: [...IDENTITY_KEYS] } },
          value: { in: [...new Set(identityValues)] },
        },
        select: { contactId: true, value: true, attributeKey: { select: { key: true } } },
      })
    : [];
  const contactByIdentity = new Map(
    existing.map((attribute) => [`${attribute.attributeKey.key}:${attribute.value}`, attribute.contactId])
  );

  for (const [index, rawRow] of rows.entries()) {
    const row = Object.fromEntries(
      Object.entries(rawRow)
        .map(([key, value]) => [key.trim(), (value ?? "").trim()] as const)
        .filter(([key, value]) => key !== "" && value !== "")
    );
    const identifier = getIdentifier(row);
    if (!identifier) {
      result.skipped.push({ index, reason: "Either email or userId is required", identifier: "" });
      continue;
    }

    const existingContactId =
      (row.email && contactByIdentity.get(`email:${row.email}`)) ||
      (row.userId && contactByIdentity.get(`userId:${row.userId}`)) ||
      null;

    if (existingContactId && duplicateAction === "skip") {
      result.skipped.push({ index, reason: "Contact already exists", identifier });
      continue;
    }

    let contactId = existingContactId;
    if (!contactId) {
      const created = await prisma.contact.create({ data: { workspaceId }, select: { id: true } });
      contactId = created.id;
    } else if (duplicateAction === "overwrite") {
      await prisma.contactAttribute.deleteMany({
        where: { contactId, attributeKey: { key: { notIn: Object.keys(row) } } },
      });
    }

    const upsert = await upsertContactAttributes(contactId, workspaceId, row, { allowCreateKeys: true });
    if (upsert.errors.length > 0) {
      result.errors.push(...upsert.errors.map((error) => `Row ${index + 1}: ${error}`));
    }

    if (existingContactId) {
      result.updated += 1;
    } else {
      result.created += 1;
      for (const key of IDENTITY_KEYS) {
        if (row[key]) contactByIdentity.set(`${key}:${row[key]}`, contactId);
      }
    }
  }

  return result;
};
