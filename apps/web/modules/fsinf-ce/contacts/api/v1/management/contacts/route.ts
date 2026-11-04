/**
 * FSINF CE: `GET /api/v1/management/contacts` — contacts of all workspaces the API key can read
 * (`limit`/`skip`, max 1000 per page). Identity data only; attribute values via /contact-attributes.
 */
import { prisma } from "@formbricks/database";
import { handleApiError } from "@/app/lib/api/handle-api-error";
import { responses } from "@/app/lib/api/response";
import { THandlerParams, withV1ApiWrapper } from "@/app/lib/api/with-api-logging";
import { getPermittedWorkspaceIds, isApiKeyAuthentication } from "../lib/auth";
import { getPagination, toV1Contact, v1ContactSelect } from "./lib/contact";

export const GET = withV1ApiWrapper({
  handler: async ({ req, authentication }: THandlerParams) => {
    if (!isApiKeyAuthentication(authentication)) {
      return { response: responses.notAuthenticatedResponse() };
    }
    try {
      const workspaceIds = getPermittedWorkspaceIds(authentication, "GET");
      const contacts = await prisma.contact.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: v1ContactSelect,
        orderBy: { createdAt: "desc" },
        ...getPagination(req.nextUrl.searchParams, 1000),
      });
      return { response: responses.successResponse(contacts.map(toV1Contact)) };
    } catch (error) {
      return handleApiError(error);
    }
  },
});
