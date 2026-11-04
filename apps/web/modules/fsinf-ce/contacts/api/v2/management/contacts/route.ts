/**
 * FSINF CE: `POST /api/v2/management/contacts` — creates one contact. All attribute keys must already
 * exist in the workspace; `email` is required and unique per workspace.
 */
import { NextRequest } from "next/server";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { authenticatedApiClient } from "@/modules/api/v2/auth/authenticated-api-client";
import { responses } from "@/modules/api/v2/lib/response";
import { handleApiError } from "@/modules/api/v2/lib/utils";
import { resolveBodyIdsV2 } from "@/modules/api/v2/management/lib/workspace-resolver";
import { upsertContactAttributes } from "@/modules/fsinf-ce/contacts/lib/contact-attributes";
import { ZContactCreateInput } from "./types";

export const POST = async (request: NextRequest) =>
  authenticatedApiClient({
    request,
    schemas: { body: ZContactCreateInput },
    handler: async ({ authentication, parsedInput, auditLog }) => {
      const { body } = parsedInput;

      const resolved = await resolveBodyIdsV2(body, authentication, "POST");
      if (!resolved.ok) return handleApiError(request, resolved.error, auditLog);
      const { workspaceId } = resolved.data;

      try {
        const existing = await prisma.contactAttribute.findFirst({
          where: {
            attributeKey: { workspaceId, key: { in: ["email", "userId"] }, isUnique: true },
            OR: [
              { attributeKey: { key: "email" }, value: body.attributes.email },
              ...(body.attributes.userId
                ? [{ attributeKey: { key: "userId" }, value: body.attributes.userId }]
                : []),
            ],
          },
          select: { id: true },
        });
        if (existing) {
          return handleApiError(
            request,
            {
              type: "conflict",
              details: [{ field: "attributes", issue: "A contact with this email or userId already exists" }],
            },
            auditLog
          );
        }

        const contact = await prisma.contact.create({
          data: { workspaceId },
          select: { id: true, createdAt: true, workspaceId: true },
        });
        const result = await upsertContactAttributes(contact.id, workspaceId, body.attributes, {
          allowCreateKeys: false,
        });

        if (result.errors.length > 0) {
          // Nothing of a half-written contact may remain.
          await prisma.contact.delete({ where: { id: contact.id } });
          return handleApiError(
            request,
            {
              type: "bad_request",
              details: result.errors.map((issue) => ({ field: "attributes", issue })),
            },
            auditLog
          );
        }

        if (auditLog) {
          auditLog.targetId = contact.id;
          auditLog.newObject = { id: contact.id, workspaceId };
        }
        return responses.createdResponse({ data: { ...contact, attributes: body.attributes } });
      } catch (error) {
        logger.error({ error }, "Error creating contact via management API v2");
        return handleApiError(request, { type: "internal_server_error" }, auditLog, error);
      }
    },
    action: "created",
    targetType: "contact",
  });
