/**
 * FSINF CE: translates segment filters into a Prisma `Contact` where clause.
 *
 * Used wherever many contacts have to be matched at once (personal links, segment contact lists,
 * counts). Semantics are shared with the in-memory evaluator via `semantics.ts`.
 */
import "server-only";
import { prisma } from "@formbricks/database";
import type { Prisma } from "@formbricks/database/prisma";
import { logger } from "@formbricks/logger";
import { Result, err, ok } from "@formbricks/types/error-handlers";
import type { TBaseFilters } from "@formbricks/types/segment";
import { ApiErrorResponseV2 } from "@/modules/api/v2/types/api-error";
import { buildContactWhereFromFilters } from "./prisma-where";

/**
 * Builds `{ whereClause }` matching every contact of `workspaceId` that is a member of the segment.
 * Nested segment references are resolved against the same workspace only.
 */
export const segmentFilterToPrismaQuery = async (
  segmentId: string,
  filters: TBaseFilters,
  workspaceId: string
): Promise<Result<{ whereClause: Prisma.ContactWhereInput }, ApiErrorResponseV2>> => {
  try {
    const workspaceSegments = await prisma.segment.findMany({
      where: { workspaceId },
      select: { id: true, filters: true },
    });
    const filtersBySegmentId = new Map(
      workspaceSegments.map((segment) => [segment.id, segment.filters as unknown as TBaseFilters])
    );

    const filterWhere = buildContactWhereFromFilters(filters, {
      now: new Date(),
      workspaceId,
      resolveSegmentFilters: (id) => filtersBySegmentId.get(id),
      visitedSegmentIds: new Set([segmentId]),
    });

    return ok({ whereClause: { AND: [{ workspaceId }, filterWhere] } });
  } catch (error) {
    logger.error({ error, segmentId, workspaceId }, "Error building prisma query for segment filters");
    return err({
      type: "internal_server_error",
      details: [{ field: "segment", issue: "Failed to build segment query" }],
    });
  }
};
