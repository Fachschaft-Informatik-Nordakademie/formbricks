/**
 * FSINF CE: the one place that writes contact attribute values.
 *
 * Every writer (JS SDK `/user`, CSV import, management API, contact detail UI) goes through
 * `upsertContactAttributes`, so typing, uniqueness of `isUnique` keys (email, userId) and the
 * per-workspace key limit are enforced identically everywhere.
 */
import "server-only";
import { prisma } from "@formbricks/database";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import {
  getReservedFutureDefaultAttributeKeyIssue,
  isReservedFutureDefaultAttributeKey,
} from "./attribute-key-policy";
import {
  TAttributeInputValue,
  TNormalizedAttributeValue,
  inferAttributeDataType,
  normalizeAttributeValue,
} from "./attribute-values";
import { MAX_ATTRIBUTE_KEYS_PER_WORKSPACE, selectContactAttributeKey } from "./contact-attribute-keys";

/**
 * Keys an integration (SDK, API, CSV) may create on the fly. Deliberately a little wider than the
 * safe-identifier rule for keys typed in the UI, so camelCase keys and group names such as
 * `group_FSR-Vorstand` keep working.
 */
const AUTO_CREATED_KEY_REGEX = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

export const isValidAutoCreatedAttributeKey = (key: string): boolean =>
  AUTO_CREATED_KEY_REGEX.test(key) && !isReservedFutureDefaultAttributeKey(key);

export interface TUpsertAttributesResult {
  /** Informational (debug) messages, e.g. "created new attribute". */
  messages: string[];
  /** Problems the caller should surface: invalid values, unknown keys, conflicts. */
  errors: string[];
  /** Keys whose values were written. */
  updatedKeys: string[];
}

export interface TUpsertAttributesOptions {
  /** Create keys that do not exist yet (type inferred from the value). */
  allowCreateKeys: boolean;
  /** Remove the contact's values for keys present with an empty string instead of storing "". */
  deleteEmpty?: boolean;
}

const VALUE_ERROR_TEXT = {
  too_long: "Value is too long",
  invalid_number: "Value is not a valid number",
  invalid_date: "Value is not a valid date (use ISO 8601, e.g. 2026-01-31)",
} as const;

/**
 * Writes `attributes` for one contact of `workspaceId`. The caller has already verified that the
 * contact belongs to the workspace.
 */
export const upsertContactAttributes = async (
  contactId: string,
  workspaceId: string,
  attributes: Record<string, TAttributeInputValue>,
  options: TUpsertAttributesOptions
): Promise<TUpsertAttributesResult> => {
  const result: TUpsertAttributesResult = { messages: [], errors: [], updatedKeys: [] };
  const entries = Object.entries(attributes);
  if (entries.length === 0) return result;

  const existingKeys = await prisma.contactAttributeKey.findMany({
    where: { workspaceId },
    select: selectContactAttributeKey,
  });
  const keysByName = new Map<string, TContactAttributeKey>(existingKeys.map((key) => [key.key, key]));
  let keyCount = existingKeys.length;

  const writes: { key: TContactAttributeKey; value: TNormalizedAttributeValue }[] = [];
  const deletions: TContactAttributeKey[] = [];

  for (const [rawKey, rawValue] of entries) {
    const keyName = rawKey.trim();
    let key = keysByName.get(keyName);

    if (!key) {
      if (!options.allowCreateKeys) {
        result.errors.push(`Attribute key "${keyName}" does not exist in this workspace`);
        continue;
      }
      if (isReservedFutureDefaultAttributeKey(keyName)) {
        result.errors.push(getReservedFutureDefaultAttributeKeyIssue([keyName]));
        continue;
      }
      if (!isValidAutoCreatedAttributeKey(keyName)) {
        result.errors.push(
          `Invalid attribute key "${keyName}": must start with a letter and contain only letters, numbers, "_", "-", "." or ":" (max. 64 characters)`
        );
        continue;
      }
      if (keyCount >= MAX_ATTRIBUTE_KEYS_PER_WORKSPACE) {
        result.errors.push(
          `Could not create attribute "${keyName}": the workspace reached the maximum of ${MAX_ATTRIBUTE_KEYS_PER_WORKSPACE} attribute keys`
        );
        continue;
      }
      const dataType = inferAttributeDataType(rawValue);
      key = await prisma.contactAttributeKey.upsert({
        where: { key_workspaceId: { key: keyName, workspaceId } },
        create: { key: keyName, name: keyName, workspaceId, type: "custom", dataType },
        update: {},
        select: selectContactAttributeKey,
      });
      keysByName.set(keyName, key);
      keyCount += 1;
      result.messages.push(`Created new attribute "${keyName}" with type "${key.dataType}"`);
    }

    if (options.deleteEmpty && rawValue === "") {
      deletions.push(key);
      continue;
    }

    const normalized = normalizeAttributeValue(rawValue, key.dataType);
    if (!normalized.ok) {
      result.errors.push(
        `${VALUE_ERROR_TEXT[normalized.error]} (attribute "${keyName}" has dataType: ${key.dataType})`
      );
      continue;
    }

    if (key.isUnique) {
      const conflict = await prisma.contactAttribute.findFirst({
        where: {
          attributeKeyId: key.id,
          value: normalized.data.value,
          contactId: { not: contactId },
        },
        select: { id: true },
      });
      if (conflict) {
        result.messages.push(
          `The ${keyName} already exists for this workspace and was not updated for this contact.`
        );
        continue;
      }
    }

    writes.push({ key, value: normalized.data });
  }

  if (writes.length > 0 || deletions.length > 0) {
    await prisma.$transaction([
      ...writes.map(({ key, value }) =>
        prisma.contactAttribute.upsert({
          where: { contactId_attributeKeyId: { contactId, attributeKeyId: key.id } },
          create: { contactId, attributeKeyId: key.id, ...value },
          update: value,
        })
      ),
      ...(deletions.length > 0
        ? [
            prisma.contactAttribute.deleteMany({
              where: { contactId, attributeKeyId: { in: deletions.map((key) => key.id) } },
            }),
          ]
        : []),
    ]);
    result.updatedKeys = [...writes.map(({ key }) => key.key), ...deletions.map((key) => key.key)];
  }

  return result;
};

/** Ensures a default key exists (older workspaces may lack one) and returns its id. */
export const ensureDefaultAttributeKey = async (
  workspaceId: string,
  key: "userId" | "email" | "firstName" | "lastName" | "language"
): Promise<string> => {
  const isUnique = key === "userId" || key === "email";
  const created = await prisma.contactAttributeKey.upsert({
    where: { key_workspaceId: { key, workspaceId } },
    create: { key, name: key, workspaceId, type: "default", isUnique },
    update: {},
    select: { id: true },
  });
  return created.id;
};
