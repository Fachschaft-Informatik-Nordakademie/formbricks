"use server";

import { z } from "zod";
import { ZId } from "@formbricks/types/common";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { checkAuthorizationUpdated } from "@/lib/utils/action-client/action-client-middleware";
import {
  type TAuthentikDirectoryMember,
  isAuthentikDirectoryConfigured,
  searchAuthentikMembers,
} from "@/modules/auth/lib/fsinf-authentik-directory";

/**
 * FSINF: the invite dialog's Authentik member picker.
 *
 * Authorization mirrors the invite actions in ./actions.ts exactly — owner or manager of the
 * organization — because that is who may act on the result. Anything looser would turn the
 * Fachschaft's Authentik directory into a list any logged-in user could page through.
 */
const ZSearchAuthentikMembersAction = z.object({
  organizationId: ZId,
  // Empty is meaningful: it asks for the unfiltered first page, which is what the picker shows before
  // anything is typed. Capped because Authentik's `search` is free text, not an identifier.
  query: z.string().max(100).default(""),
});

export interface TAuthentikDirectoryResult {
  /** False when the instance has no Authentik API credentials — the picker then hides itself. */
  configured: boolean;
  members: TAuthentikDirectoryMember[];
}

export const searchAuthentikMembersAction = authenticatedActionClient
  .inputSchema(ZSearchAuthentikMembersAction)
  .action(async ({ ctx, parsedInput }): Promise<TAuthentikDirectoryResult> => {
    await checkAuthorizationUpdated({
      userId: ctx.user.id,
      organizationId: parsedInput.organizationId,
      access: [
        {
          type: "organization",
          roles: ["owner", "manager"],
        },
      ],
    });

    return {
      configured: isAuthentikDirectoryConfigured(),
      members: await searchAuthentikMembers(parsedInput.query),
    };
  });
