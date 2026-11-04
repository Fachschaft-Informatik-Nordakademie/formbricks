/**
 * FSINF CE: `PUT /api/v2/management/contacts/bulk` — creates or updates up to 250 contacts, matched by
 * `email`. Unknown attribute keys are created (with the given name), existing contacts are updated with
 * the attributes sent.
 */
import { NextRequest } from "next/server";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { authenticatedApiClient } from "@/modules/api/v2/auth/authenticated-api-client";
import { responses } from "@/modules/api/v2/lib/response";
import { handleApiError } from "@/modules/api/v2/lib/utils";
import { resolveBodyIdsV2 } from "@/modules/api/v2/management/lib/workspace-resolver";
import { createContactAttributeKey } from "@/modules/fsinf-ce/contacts/lib/contact-attribute-keys";
import { importContacts } from "@/modules/fsinf-ce/contacts/lib/contacts-import";
import { ZContactBulkInput } from "../types";

export const PUT = async (request: NextRequest) =>
  authenticatedApiClient({
    request,
    schemas: { body: ZContactBulkInput },
    handler: async ({ authentication, parsedInput, auditLog }) => {
      const { body } = parsedInput;

      const resolved = await resolveBodyIdsV2(body, authentication, "PUT");
      if (!resolved.ok) return handleApiError(request, resolved.error, auditLog);
      const { workspaceId } = resolved.data;

      try {
        // Create the keys that do not exist yet, using the label the caller sent.
        const wanted = new Map<string, string>();
        for (const contact of body.contacts) {
          for (const { attributeKey } of contact.attributes) wanted.set(attributeKey.key, attributeKey.name);
        }
        const existingKeys = new Set(
          (
            await prisma.contactAttributeKey.findMany({
              where: { workspaceId, key: { in: [...wanted.keys()] } },
              select: { key: true },
            })
          ).map((key) => key.key)
        );
        for (const [key, name] of wanted) {
          if (existingKeys.has(key)) continue;
          try {
            await createContactAttributeKey({ workspaceId, key, name });
          } catch (error) {
            return handleApiError(
              request,
              {
                type: "bad_request",
                details: [
                  { field: "attributeKey", issue: error instanceof Error ? error.message : "Invalid key" },
                ],
              },
              auditLog
            );
          }
        }

        const rows = body.contacts.map((contact) =>
          Object.fromEntries(
            contact.attributes.map((attribute) => [attribute.attributeKey.key, attribute.value])
          )
        );
        const result = await importContacts(workspaceId, rows, "update");

        if (auditLog) {
          auditLog.newObject = {
            workspaceId,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped.length,
          };
        }

        const message = `Contacts uploaded: ${result.created} created, ${result.updated} updated`;
        if (result.skipped.length > 0 || result.errors.length > 0) {
          return responses.multiStatusResponse({
            data: {
              status: "success",
              message: `${message}. ${result.skipped.length} skipped, ${result.errors.length} attribute problem(s).`,
              skippedContacts: result.skipped.map((skipped) => ({
                index: skipped.index,
                userId: skipped.identifier,
              })),
            },
          });
        }
        return responses.successResponse({ data: { status: "success", message } });
      } catch (error) {
        logger.error({ error }, "Error uploading contacts via management API v2");
        return handleApiError(request, { type: "internal_server_error" }, auditLog, error);
      }
    },
    action: "createdUpdated",
    targetType: "contact",
  });
