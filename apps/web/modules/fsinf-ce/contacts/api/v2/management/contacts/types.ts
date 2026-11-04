/**
 * FSINF CE: request/response schemas of the v2 management contact endpoints.
 */
import { z } from "zod";

export const MAX_BULK_CONTACTS = 250;

/** `workspaceId` is preferred; `environmentId` is the deprecated alias resolved by the route. */
const idFields = {
  workspaceId: z.string().optional(),
  environmentId: z
    .string()
    .optional()
    .meta({ deprecated: true, description: "Deprecated alias for workspaceId." }),
};

export const ZContactCreateInput = z
  .object({
    ...idFields,
    attributes: z.record(z.string().min(1).max(64), z.string().max(1000)),
  })
  .superRefine((data, ctx) => {
    const email = data.attributes.email;
    if (!email || !z.email().safeParse(email).success) {
      ctx.addIssue({
        code: "custom",
        path: ["attributes", "email"],
        message: "A valid email attribute is required",
      });
    }
  })
  .meta({ id: "contactCreateInput", description: "A single contact with a top-level attributes object." });

export type TContactCreateInput = z.infer<typeof ZContactCreateInput>;

export const ZContactResponse = z.object({
  id: z.string(),
  createdAt: z.string().or(z.date()),
  workspaceId: z.string(),
  attributes: z.record(z.string(), z.string()),
});

const ZBulkAttribute = z.object({
  attributeKey: z.object({ key: z.string().min(1).max(64), name: z.string().min(1).max(100) }),
  value: z.string().max(1000),
});

export const ZContactBulkInput = z
  .object({
    ...idFields,
    contacts: z
      .array(z.object({ attributes: z.array(ZBulkAttribute).min(1).max(100) }))
      .min(1)
      .max(MAX_BULK_CONTACTS),
  })
  .superRefine((data, ctx) => {
    for (const [index, contact] of data.contacts.entries()) {
      const email = contact.attributes.find((attribute) => attribute.attributeKey.key === "email")?.value;
      if (!email || !z.email().safeParse(email).success) {
        ctx.addIssue({
          code: "custom",
          path: ["contacts", index, "attributes"],
          message: "Each contact needs a valid email attribute",
        });
      }
    }
  })
  .meta({ id: "contactBulkInput", description: "Contacts to create or update in bulk (max 250)." });

export type TContactBulkInput = z.infer<typeof ZContactBulkInput>;
