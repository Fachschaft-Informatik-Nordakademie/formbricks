import "server-only";
import { z } from "zod";
import { logger } from "@formbricks/logger";
import { FSINF_GROUP_WORKSPACE_MAP } from "@/lib/constants";

/**
 * FSINF: which Authentik group gets access to which workspace, and with what permission.
 *
 * Team membership can follow group NAMES (a team named like the group), but workspace access cannot —
 * workspaces are named after what they are for, not after the group that works in them ("NAK Studis"
 * is worked in by "Studierende"). So the pairing is configured explicitly instead of guessed.
 *
 * Configured through `FSINF_GROUP_WORKSPACE_MAP` in docker/.env as JSON, either
 *   {"Studierende": "NAK Studis"}                                  → permission readWrite
 * or, when the permission matters,
 *   {"Studierende": {"workspace": "NAK Studis", "permission": "read"}}
 *
 * The mapping is DECLARATIVE for the pairs it names: the sync writes exactly the configured
 * permission on every run, so the file is the truth and a hand-edit in the UI is corrected back. Pairs
 * that are not named here are never touched, so everything else stays under manual control.
 */

const ZPermission = z.enum(["read", "readWrite", "manage"]);

const ZEntry = z.union([
  z.string().min(1),
  z.object({ workspace: z.string().min(1), permission: ZPermission.optional() }),
]);

const ZGroupWorkspaceMap = z.record(z.string().min(1), ZEntry);

export interface TGroupWorkspaceLink {
  /** Authentik group name, verbatim — also the name of the mirrored Formbricks team. */
  groupName: string;
  workspaceName: string;
  permission: z.infer<typeof ZPermission>;
}

/**
 * Parse the configured mapping. Returns an empty list when unset or malformed — a broken mapping must
 * not break sign-in, and granting nothing is the safe failure direction.
 */
export const getGroupWorkspaceLinks = (): TGroupWorkspaceLink[] => {
  if (!FSINF_GROUP_WORKSPACE_MAP) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(FSINF_GROUP_WORKSPACE_MAP);
  } catch {
    logger.error("FSINF_GROUP_WORKSPACE_MAP is not valid JSON — no group is mapped to a workspace");
    return [];
  }

  const result = ZGroupWorkspaceMap.safeParse(parsed);
  if (!result.success) {
    logger.error(
      { issues: result.error.issues },
      "FSINF_GROUP_WORKSPACE_MAP has an unexpected shape — no group is mapped to a workspace"
    );
    return [];
  }

  return Object.entries(result.data).map(([groupName, entry]) => ({
    groupName: groupName.trim(),
    workspaceName: typeof entry === "string" ? entry.trim() : entry.workspace.trim(),
    // readWrite by default: a group mapped to a workspace is meant to work in it, and `read` would
    // leave them unable to create the surveys the mapping exists for.
    permission: typeof entry === "string" ? "readWrite" : (entry.permission ?? "readWrite"),
  }));
};
