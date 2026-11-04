/**
 * FSINF CE: `GET|PUT|DELETE /api/v1/management/contact-attribute-keys/{contactAttributeKeyId}`.
 * A key of a workspace the API key cannot access is reported as not found.
 */
import { z } from "zod";
import { prisma } from "@formbricks/database";
import { handleApiError } from "@/app/lib/api/handle-api-error";
import { RequestBodyTooLargeError, parseJsonBodyWithLimit } from "@/app/lib/api/request-body";
import { responses } from "@/app/lib/api/response";
import { transformErrorToDetails } from "@/app/lib/api/validator";
import { THandlerParams, withV1ApiWrapper } from "@/app/lib/api/with-api-logging";
import {
  deleteContactAttributeKey,
  selectContactAttributeKey,
  updateContactAttributeKey,
} from "../../../../../lib/contact-attribute-keys";
import { canAccessWorkspace, isApiKeyAuthentication } from "../../lib/auth";

type TProps = { params: Promise<{ contactAttributeKeyId: string }> };

const ZUpdateInput = z.object({
  name: z.string().max(100).nullish(),
  description: z.string().max(500).nullish(),
});

const findKey = (id: string) =>
  prisma.contactAttributeKey.findUnique({ where: { id }, select: selectContactAttributeKey });

export const GET = withV1ApiWrapper({
  handler: async ({ props, authentication }: THandlerParams<TProps>) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    const { contactAttributeKeyId } = await props.params;
    try {
      const key = await findKey(contactAttributeKeyId);
      if (!key || !canAccessWorkspace(authentication, key.workspaceId, "GET")) {
        return { response: responses.notFoundResponse("ContactAttributeKey", contactAttributeKeyId) };
      }
      return { response: responses.successResponse(key) };
    } catch (error) {
      return handleApiError(error);
    }
  },
});

export const PUT = withV1ApiWrapper({
  handler: async ({ req, props, authentication, auditLog }: THandlerParams<TProps>) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    const { contactAttributeKeyId } = await props.params;
    try {
      const key = await findKey(contactAttributeKeyId);
      if (!key || !canAccessWorkspace(authentication, key.workspaceId, "GET")) {
        return { response: responses.notFoundResponse("ContactAttributeKey", contactAttributeKeyId) };
      }
      if (!canAccessWorkspace(authentication, key.workspaceId, "PUT")) {
        return { response: responses.unauthorizedResponse() };
      }

      let body: unknown;
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
      const input = ZUpdateInput.safeParse(body);
      if (!input.success) {
        return {
          response: responses.badRequestResponse(
            "Fields are missing or incorrectly formatted",
            transformErrorToDetails(input.error)
          ),
        };
      }

      const updated = await updateContactAttributeKey(key.id, key.workspaceId, {
        name: input.data.name,
        description: input.data.description,
      });
      if (auditLog) {
        auditLog.targetId = key.id;
        auditLog.oldObject = key;
        auditLog.newObject = updated;
      }
      return { response: responses.successResponse(updated) };
    } catch (error) {
      return handleApiError(error);
    }
  },
  action: "updated",
  targetType: "contactAttributeKey",
});

export const DELETE = withV1ApiWrapper({
  handler: async ({ props, authentication, auditLog }: THandlerParams<TProps>) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    const { contactAttributeKeyId } = await props.params;
    try {
      const key = await findKey(contactAttributeKeyId);
      if (!key || !canAccessWorkspace(authentication, key.workspaceId, "GET")) {
        return { response: responses.notFoundResponse("ContactAttributeKey", contactAttributeKeyId) };
      }
      if (!canAccessWorkspace(authentication, key.workspaceId, "DELETE")) {
        return { response: responses.unauthorizedResponse() };
      }
      const deleted = await deleteContactAttributeKey(key.id, key.workspaceId);
      if (auditLog) {
        auditLog.targetId = key.id;
        auditLog.oldObject = deleted;
      }
      return { response: responses.successResponse(deleted) };
    } catch (error) {
      return handleApiError(error);
    }
  },
  action: "deleted",
  targetType: "contactAttributeKey",
});
