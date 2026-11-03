import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";

/**
 * FSINF CE: read access to feedback directories (Formbricks Hub datasets).
 *
 * Feedback directories are not offered in this build (FSINF_FEATURES.feedbackDirectories is false), so the
 * Hub gateway refuses every request before using more than this lookup. These queries are still real —
 * they read the AGPL-schema tables — so the AGPL Hub code keeps working unchanged should the feature be
 * enabled later.
 */

export type TFeedbackDirectorySummary = {
  id: string;
  name: string;
  isArchived: boolean;
  organizationId: string;
};

export type TFeedbackDirectoryAuthContext = TFeedbackDirectorySummary & {
  /** Workspaces the directory is shared with, oldest link first. */
  workspaceIds: string[];
};

/** Active (non-archived) directories linked to a workspace. */
export const getFeedbackDirectoriesByWorkspaceId = reactCache(
  async (workspaceId: string): Promise<TFeedbackDirectorySummary[]> =>
    prisma.feedbackDirectory.findMany({
      where: { isArchived: false, workspaces: { some: { workspaceId } } },
      select: { id: true, name: true, isArchived: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    })
);

export const getFeedbackDirectoryAuthContext = reactCache(
  async (feedbackDirectoryId: string): Promise<TFeedbackDirectoryAuthContext | null> => {
    const directory = await prisma.feedbackDirectory.findUnique({
      where: { id: feedbackDirectoryId },
      select: {
        id: true,
        name: true,
        isArchived: true,
        organizationId: true,
        workspaces: { select: { workspaceId: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!directory) return null;
    const { workspaces, ...rest } = directory;
    return { ...rest, workspaceIds: workspaces.map((w) => w.workspaceId) };
  }
);
