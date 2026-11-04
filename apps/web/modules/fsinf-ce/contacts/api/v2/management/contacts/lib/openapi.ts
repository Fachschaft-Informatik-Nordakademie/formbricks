/**
 * FSINF CE: OpenAPI path object for `POST /management/contacts`.
 */
import { z } from "zod";
import { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from "zod-openapi";
import { ZContactCreateInput, ZContactResponse } from "../types";

export const createContactEndpoint: ZodOpenApiOperationObject = {
  operationId: "createContact",
  summary: "Create a contact",
  description:
    "Creates a single contact. This endpoint expects a top-level `attributes` object; for bulk uploads use `PUT /management/contacts/bulk`. The contact needs a valid `email` attribute, and all attribute keys must already exist in the workspace. The email is the unique identifier together with the workspace.",
  tags: ["Management API - Contacts"],
  requestBody: {
    required: true,
    description: "The contact to create.",
    content: { "application/json": { schema: ZContactCreateInput } },
  },
  responses: {
    "201": {
      description: "Contact created successfully.",
      content: { "application/json": { schema: z.object({ data: ZContactResponse }) } },
    },
  },
};

export const contactPaths: ZodOpenApiPathsObject = {
  "/management/contacts": {
    post: createContactEndpoint,
  },
};
