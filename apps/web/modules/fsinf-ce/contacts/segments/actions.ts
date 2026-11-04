"use server";

/**
 * FSINF CE: segment server actions (segments page and the targeting card of the survey editor).
 * Workspace ids are always derived from or checked against the stored records.
 */
import { z } from "zod";
import { ZId } from "@formbricks/types/common";
import { InvalidInputError } from "@formbricks/types/errors";
import { ZSegmentCreateInput, ZSegmentFilters, ZSegmentUpdateInput } from "@formbricks/types/segment";
import { loadNewSegmentInSurvey } from "@/lib/survey/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { getWorkspaceIdFromSegmentId, getWorkspaceIdFromSurveyId } from "@/lib/utils/helper";
import { withAuditLogging } from "@/modules/fsinf-ce/audit-logs/lib/handler";
import { authorizeContactsAccess } from "@/modules/fsinf-ce/contacts/lib/authorize";
import { getSegmentContactCount } from "@/modules/fsinf-ce/contacts/lib/contacts";
import {
  cloneSegmentIntoSurvey,
  createSegment,
  deleteSegment,
  getSegmentInWorkspace,
  getSurveyRefsForWorkspace,
  resetSegmentInSurvey,
  updateSegment,
} from "./lib/segments";

export const createSegmentAction = authenticatedActionClient.inputSchema(ZSegmentCreateInput).action(
  withAuditLogging("created", "segment", async ({ ctx, parsedInput }) => {
    const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;

    if (parsedInput.surveyId) {
      // The survey must be visible to this viewer and live in the same workspace.
      const surveyWorkspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);
      if (surveyWorkspaceId !== parsedInput.workspaceId) {
        throw new InvalidInputError("Survey and segment are not in the same workspace");
      }
    }

    const segment = await createSegment(parsedInput);
    ctx.auditLoggingCtx.segmentId = segment.id;
    ctx.auditLoggingCtx.newObject = segment;
    return segment;
  })
);

const ZUpdateSegmentAction = z.object({ segmentId: ZId, data: ZSegmentUpdateInput });

export const updateSegmentAction = authenticatedActionClient.inputSchema(ZUpdateSegmentAction).action(
  withAuditLogging("updated", "segment", async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromSegmentId(parsedInput.segmentId);
    const organizationId = await authorizeContactsAccess(ctx.user.id, workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;
    ctx.auditLoggingCtx.segmentId = parsedInput.segmentId;
    ctx.auditLoggingCtx.oldObject = await getSegmentInWorkspace(parsedInput.segmentId, workspaceId);

    const segment = await updateSegment(parsedInput.segmentId, workspaceId, parsedInput.data);
    ctx.auditLoggingCtx.newObject = segment;
    return segment;
  })
);

const ZSegmentRef = z.object({ segmentId: ZId });

export const deleteSegmentAction = authenticatedActionClient.inputSchema(ZSegmentRef).action(
  withAuditLogging("deleted", "segment", async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromSegmentId(parsedInput.segmentId);
    const organizationId = await authorizeContactsAccess(ctx.user.id, workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;
    ctx.auditLoggingCtx.segmentId = parsedInput.segmentId;
    const segment = await deleteSegment(parsedInput.segmentId, workspaceId);
    ctx.auditLoggingCtx.oldObject = segment;
    return { id: segment.id };
  })
);

const ZSurveySegmentAction = z.object({ surveyId: ZId, segmentId: ZId });

/** Points the survey at an existing (public) segment. */
export const loadNewSegmentAction = authenticatedActionClient.inputSchema(ZSurveySegmentAction).action(
  withAuditLogging("updated", "survey", async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);
    const organizationId = await authorizeContactsAccess(ctx.user.id, workspaceId, "readWrite");
    // Never connect a segment of another workspace (loadNewSegmentInSurvey itself does not check).
    await getSegmentInWorkspace(parsedInput.segmentId, workspaceId);
    ctx.auditLoggingCtx.organizationId = organizationId;
    ctx.auditLoggingCtx.surveyId = parsedInput.surveyId;
    return loadNewSegmentInSurvey(parsedInput.surveyId, parsedInput.segmentId);
  })
);

/** Copies a segment's filters into the survey's private segment so they can be edited there. */
export const cloneSegmentAction = authenticatedActionClient.inputSchema(ZSurveySegmentAction).action(
  withAuditLogging("created", "segment", async ({ ctx, parsedInput }) => {
    const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);
    const organizationId = await authorizeContactsAccess(ctx.user.id, workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;
    const segment = await cloneSegmentIntoSurvey(parsedInput.segmentId, parsedInput.surveyId, workspaceId);
    ctx.auditLoggingCtx.segmentId = segment.id;
    ctx.auditLoggingCtx.newObject = segment;
    return segment;
  })
);

export const resetSegmentFiltersAction = authenticatedActionClient
  .inputSchema(z.object({ surveyId: ZId }))
  .action(
    withAuditLogging("updated", "segment", async ({ ctx, parsedInput }) => {
      const workspaceId = await getWorkspaceIdFromSurveyId(parsedInput.surveyId);
      const organizationId = await authorizeContactsAccess(ctx.user.id, workspaceId, "readWrite");
      ctx.auditLoggingCtx.organizationId = organizationId;
      const segment = await resetSegmentInSurvey(parsedInput.surveyId, workspaceId);
      ctx.auditLoggingCtx.segmentId = segment.id;
      return segment;
    })
  );

const ZSegmentContactCountAction = z.object({
  workspaceId: ZId,
  segmentId: z.string().max(64),
  filters: ZSegmentFilters,
});

/** Live preview: how many contacts match the (unsaved) filters right now. */
export const getSegmentContactCountAction = authenticatedActionClient
  .inputSchema(ZSegmentContactCountAction)
  .action(async ({ ctx, parsedInput }) => {
    await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "read");
    return getSegmentContactCount(parsedInput.segmentId, parsedInput.workspaceId, parsedInput.filters);
  });

/** Surveys of the workspace (viewer-scoped) for the survey-interaction filter picker. */
export const getSurveyRefsAction = authenticatedActionClient
  .inputSchema(z.object({ workspaceId: ZId }))
  .action(async ({ ctx, parsedInput }) => {
    await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "read");
    return getSurveyRefsForWorkspace(parsedInput.workspaceId);
  });
