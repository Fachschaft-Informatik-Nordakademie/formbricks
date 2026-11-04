/**
 * FSINF CE: OpenAPI path object for `PUT /management/contacts/bulk`.
 */
import { z } from "zod";
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from "zod-openapi";
import { ZContactBulkInput } from "../../types";

const ZBulkResult = z.object({ status: z.string(), message: z.string() });

export const uploadBulkContactsEndpoint: ZodOpenApiOperationObject = {
  operationId: "uploadBulkContacts",
  summary: "Upload Bulk Contacts",
  description:
    "Creates or updates up to 250 contacts, matched by email. Each contact needs an `attributes` array of `{ attributeKey: { key, name }, value }` objects including a valid `email`. Unlike `POST /management/contacts`, there is no top-level `attributes` object.",
  tags: ["Management API - Contacts"],
  requestBody: {
    required: true,
    description: "The contacts to upload.",
    content: { "application/json": { schema: ZContactBulkInput } },
  },
  responses: {
    "200": {
      description: "Contacts uploaded successfully.",
      content: { "application/json": { schema: z.object({ data: ZBulkResult }) } },
    },
    "207": {
      description: "Contacts uploaded partially successfully.",
      content: {
        "application/json": {
          schema: z.object({
            data: ZBulkResult.extend({
              skippedContacts: z.array(z.object({ index: z.number(), userId: z.string() })),
            }),
          }),
        },
      },
    },
  },
};

export const bulkContactPaths: ZodOpenApiPathsObject = {
  "/management/contacts/bulk": {
    put: uploadBulkContactsEndpoint,
  },
};
