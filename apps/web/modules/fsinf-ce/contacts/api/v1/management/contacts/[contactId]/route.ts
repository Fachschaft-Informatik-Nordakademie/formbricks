/**
 * FSINF CE: `GET|DELETE /api/v1/management/contacts/{contactId}`.
 * A contact of a workspace the API key cannot read is reported as not found.
 */
import { prisma } from "@formbricks/database";
import { handleApiError } from "@/app/lib/api/handle-api-error";
import { responses } from "@/app/lib/api/response";
import { THandlerParams, withV1ApiWrapper } from "@/app/lib/api/with-api-logging";
import { canAccessWorkspace, isApiKeyAuthentication } from "../../lib/auth";
import { toV1Contact, v1ContactSelect } from "../lib/contact";

type TProps = { params: Promise<{ contactId: string }> };

const findContact = (contactId: string) =>
  prisma.contact.findUnique({ where: { id: contactId }, select: v1ContactSelect });

export const GET = withV1ApiWrapper({
  handler: async ({ props, authentication }: THandlerParams<TProps>) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    const { contactId } = await props.params;
    try {
      const contact = await findContact(contactId);
      if (!contact || !canAccessWorkspace(authentication, contact.workspaceId, "GET")) {
        return { response: responses.notFoundResponse("Contact", contactId) };
      }
      return { response: responses.successResponse(toV1Contact(contact)) };
    } catch (error) {
      return handleApiError(error);
    }
  },
});

export const DELETE = withV1ApiWrapper({
  handler: async ({ props, authentication, auditLog }: THandlerParams<TProps>) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    const { contactId } = await props.params;
    try {
      const contact = await findContact(contactId);
      if (!contact || !canAccessWorkspace(authentication, contact.workspaceId, "GET")) {
        return { response: responses.notFoundResponse("Contact", contactId) };
      }
      if (!canAccessWorkspace(authentication, contact.workspaceId, "DELETE")) {
        return { response: responses.unauthorizedResponse() };
      }
      await prisma.contact.delete({ where: { id: contactId } });
      if (auditLog) {
        auditLog.targetId = contactId;
        auditLog.oldObject = { id: contact.id, workspaceId: contact.workspaceId };
      }
      return { response: responses.successResponse(toV1Contact(contact)) };
    } catch (error) {
      return handleApiError(error);
    }
  },
  action: "deleted",
  targetType: "contact",
});
