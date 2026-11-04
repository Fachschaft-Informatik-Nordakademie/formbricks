/**
 * FSINF CE: naming policy for contact attribute keys.
 *
 * The default attribute keys are camelCase today (`userId`, `email`, `firstName`, `lastName`,
 * `language`). A later migration will move them to safe identifiers; the snake_case spellings of the
 * defaults are reserved now so no custom attribute can squat on a name that migration needs.
 */

/** Keys the workspace setup creates as `type: "default"` attribute keys. */
export const DEFAULT_ATTRIBUTE_KEYS = ["userId", "email", "firstName", "lastName", "language"] as const;

/** Snake_case names of the defaults that are not already identical to their camelCase key. */
export const RESERVED_FUTURE_DEFAULT_ATTRIBUTE_KEYS = ["user_id", "first_name", "last_name"] as const;

/** Keys that must stay unique per workspace (identify a contact). */
export const UNIQUE_DEFAULT_ATTRIBUTE_KEYS = ["userId", "email"] as const;

export const isReservedFutureDefaultAttributeKey = (key: string): boolean =>
  (RESERVED_FUTURE_DEFAULT_ATTRIBUTE_KEYS as readonly string[]).includes(key.trim().toLowerCase());

export const getReservedFutureDefaultAttributeKeyIssue = (keys: string[]): string =>
  `Reserved attribute key(s): ${keys.join(", ")}. These keys are reserved for the v5.1 safe-identifier default attribute migration and cannot be created as custom attributes.`;

/** All reserved keys, formatted for the `{reservedKeys}` placeholder of the UI messages. */
export const formatReservedFutureDefaultAttributeKeys = (): string =>
  RESERVED_FUTURE_DEFAULT_ATTRIBUTE_KEYS.join(", ");
