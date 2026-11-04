/**
 * FSINF CE: `GET|POST /api/v1/management/contact-attribute-keys`.
 */
import { z } from "zod";
import { prisma } from "@formbricks/database";
import { ZContactAttributeDataType } from "@formbricks/types/contact-attribute-key";
import { resolveBodyIds } from "@/app/api/v1/management/lib/workspace-resolver";
import { handleApiError } from "@/app/lib/api/handle-api-error";
import { RequestBodyTooLargeError, parseJsonBodyWithLimit } from "@/app/lib/api/request-body";
import { responses } from "@/app/lib/api/response";
import { transformErrorToDetails } from "@/app/lib/api/validator";
import { THandlerParams, withV1ApiWrapper } from "@/app/lib/api/with-api-logging";
import { createContactAttributeKey, selectContactAttributeKey } from "../../../../lib/contact-attribute-keys";
import { getPermittedWorkspaceIds, isApiKeyAuthentication } from "../lib/auth";

const ZCreateInput = z.object({
  workspaceId: z.string(),
  key: z.string().min(1).max(64),
  name: z.string().max(100).nullish(),
  description: z.string().max(500).nullish(),
  dataType: ZContactAttributeDataType.optional(),
});

export const GET = withV1ApiWrapper({
  handler: async ({ authentication }: THandlerParams) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    try {
      const keys = await prisma.contactAttributeKey.findMany({
        where: { workspaceId: { in: getPermittedWorkspaceIds(authentication, "GET") } },
        select: selectContactAttributeKey,
        orderBy: { createdAt: "asc" },
      });
      return { response: responses.successResponse(keys) };
    } catch (error) {
      return handleApiError(error);
    }
  },
});

export const POST = withV1ApiWrapper({
  handler: async ({ req, authentication, auditLog }: THandlerParams) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    try {
      let body: Record<string, unknown>;
      try {
        body = await parseJsonBodyWithLimit<Record<string, unknown>>(req);
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
          return {
            response: responses.payloadTooLargeResponse("Payload Too Large", { error: error.message }),
          };
        }
        return {
          response: responses.badRequestResponse("Malformed JSON input, please check your request body"),
        };
      }

      const resolved = await resolveBodyIds(body, authentication.workspacePermissions, "POST");
      if (!resolved.ok) return { response: resolved.response };

      const input = ZCreateInput.safeParse(resolved.body);
      if (!input.success) {
        return {
          response: responses.badRequestResponse(
            "Fields are missing or incorrectly formatted",
            transformErrorToDetails(input.error)
          ),
        };
      }

      const created = await createContactAttributeKey(input.data);
      if (auditLog) {
        auditLog.targetId = created.id;
        auditLog.newObject = created;
      }
      return { response: responses.successResponse(created) };
    } catch (error) {
      return handleApiError(error);
    }
  },
  action: "created",
  targetType: "contactAttributeKey",
});
