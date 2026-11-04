/**
 * FSINF CE: client API `POST /api/v{1,2}/client/{workspaceId}/user` used by the JS SDK to identify a
 * user, update attributes and fetch the user state (segments, displays, responses).
 * Rate limiting (per IP) is applied by `withV1ApiWrapper` for every client route.
 */
import { logger } from "@formbricks/logger";
import { RequestBodyTooLargeError, parseJsonBodyWithLimit } from "@/app/lib/api/request-body";
import { responses } from "@/app/lib/api/response";
import { transformErrorToDetails } from "@/app/lib/api/validator";
import { THandlerParams, withV1ApiWrapper } from "@/app/lib/api/with-api-logging";
import { getOrganizationIdFromWorkspaceId } from "@/lib/utils/helper";
import { resolveClientApiIds } from "@/lib/utils/resolve-client-id";
import { getIsContactsEnabled } from "@/modules/fsinf-ce/features";
import { ZClientUserInput, getDeviceTypeFromUserAgent, identifyClientUser } from "./lib/user";

export const OPTIONS = async (): Promise<Response> => {
  return responses.successResponse({}, true, "public, s-maxage=3600, max-age=3600");
};

export const POST = withV1ApiWrapper({
  handler: async ({ req, props }: THandlerParams<{ params: Promise<{ workspaceId: string }> }>) => {
    const params = await props.params;

    // Accepts a workspaceId (current SDK) or a legacy environmentId (old SDK).
    const resolved = await resolveClientApiIds(params.workspaceId);
    if (!resolved) {
      return { response: responses.notFoundResponse("Workspace", params.workspaceId, true) };
    }
    const { workspaceId } = resolved;

    let jsonInput: unknown;
    try {
      jsonInput = await parseJsonBodyWithLimit<Record<string, unknown>>(req);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return {
          response: responses.payloadTooLargeResponse("Payload Too Large", { error: error.message }, true),
        };
      }
      return {
        response: responses.badRequestResponse(
          "Malformed JSON input, please check your request body",
          undefined,
          true
        ),
      };
    }

    const inputValidation = ZClientUserInput.safeParse(jsonInput);
    if (!inputValidation.success) {
      return {
        response: responses.badRequestResponse(
          "Fields are missing or incorrectly formatted",
          transformErrorToDetails(inputValidation.error),
          true
        ),
      };
    }

    try {
      const organizationId = await getOrganizationIdFromWorkspaceId(workspaceId);
      if (!(await getIsContactsEnabled(organizationId))) {
        return {
          response: responses.forbiddenResponse(
            "User identification is not enabled for this workspace.",
            true
          ),
        };
      }

      const result = await identifyClientUser(
        workspaceId,
        inputValidation.data,
        getDeviceTypeFromUserAgent(req.headers.get("user-agent"))
      );

      return { response: responses.successResponse(result, true) };
    } catch (error) {
      logger.error({ error, workspaceId }, "Error identifying SDK user");
      return {
        response: responses.internalServerErrorResponse("Something went wrong. Please try again.", true),
      };
    }
  },
});
