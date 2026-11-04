/**
 * FSINF CE: `GET /api/v1/management/contact-attributes` — attribute values of all workspaces the
 * API key can read (`limit`/`skip`, max 5000 per page).
 */
import { prisma } from "@formbricks/database";
import { handleApiError } from "@/app/lib/api/handle-api-error";
import { responses } from "@/app/lib/api/response";
import { THandlerParams, withV1ApiWrapper } from "@/app/lib/api/with-api-logging";
import { getPagination } from "../contacts/lib/contact";
import { getPermittedWorkspaceIds, isApiKeyAuthentication } from "../lib/auth";

export const GET = withV1ApiWrapper({
  handler: async ({ req, authentication }: THandlerParams) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    try {
      const workspaceIds = getPermittedWorkspaceIds(authentication, "GET");
      const attributes = await prisma.contactAttribute.findMany({
        where: { contact: { workspaceId: { in: workspaceIds } } },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          attributeKeyId: true,
          contactId: true,
          value: true,
          valueNumber: true,
          valueDate: true,
        },
        orderBy: { createdAt: "desc" },
        ...getPagination(req.nextUrl.searchParams, 5000),
      });
      return { response: responses.successResponse(attributes) };
    } catch (error) {
      return handleApiError(error);
    }
  },
});
