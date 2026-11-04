/**
 * FSINF CE: segment service. Every function is scoped to one workspace; ids coming from a client
 * (segment references inside filters, survey ids) are verified to belong to that workspace before
 * they are stored.
 */
import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { ZId } from "@formbricks/types/common";
import {
  DatabaseError,
  InvalidInputError,
  OperationNotAllowedError,
  ResourceNotFoundError,
} from "@formbricks/types/errors";
import {
  TBaseFilters,
  TSegment,
  TSegmentCreateInput,
  TSegmentSurveyReference,
  TSegmentUpdateInput,
  TSegmentWithSurveyRefs,
  ZSegmentFilters,
} from "@formbricks/types/segment";
import { validateInputs } from "@/lib/utils/validate";
import { buildViewerSurveyWhere } from "@/modules/survey/lib/fsinf-survey-visibility";
import { collectReferencedSegmentIds } from "./filter/semantics";

const selectSegment = {
  id: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  description: true,
  isPrivate: true,
  filters: true,
  workspaceId: true,
  surveys: { select: { id: true } },
} satisfies Prisma.SegmentSelect;

type TPrismaSegment = Prisma.SegmentGetPayload<{ select: typeof selectSegment }>;

const toSegment = (segment: TPrismaSegment): TSegment => ({
  ...segment,
  filters: (segment.filters ?? []) as unknown as TBaseFilters,
  surveys: segment.surveys.map((survey) => survey.id),
});

const wrapDatabaseError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new InvalidInputError("A segment with this title already exists");
    throw new DatabaseError(error.message);
  }
  throw error;
};

export const getSegments = reactCache(async (workspaceId: string): Promise<TSegment[]> => {
  validateInputs([workspaceId, ZId]);
  try {
    const segments = await prisma.segment.findMany({
      where: { workspaceId },
      select: selectSegment,
      orderBy: { createdAt: "desc" },
    });
    return segments.map(toSegment);
  } catch (error) {
    return wrapDatabaseError(error);
  }
});

/** Loads one segment and fails closed when it is not part of `workspaceId`. */
export const getSegmentInWorkspace = async (segmentId: string, workspaceId: string): Promise<TSegment> => {
  const segment = await prisma.segment.findFirst({
    where: { id: segmentId, workspaceId },
    select: selectSegment,
  });
  if (!segment) throw new ResourceNotFoundError("segment", segmentId);
  return toSegment(segment);
};

/** Of `surveyIds`, the ones that exist in `workspaceId`. */
export const getExistingWorkspaceSurveyIds = async (
  workspaceId: string,
  surveyIds: string[]
): Promise<Set<string>> => {
  if (surveyIds.length === 0) return new Set();
  const surveys = await prisma.survey.findMany({
    where: { workspaceId, id: { in: [...new Set(surveyIds)] } },
    select: { id: true },
  });
  return new Set(surveys.map((survey) => survey.id));
};

/** surveyId → workspaceId for the given ids (unknown ids are absent). */
export const getSurveyWorkspaceIdMap = async (surveyIds: string[]): Promise<Map<string, string>> => {
  if (surveyIds.length === 0) return new Map();
  const surveys = await prisma.survey.findMany({
    where: { id: { in: [...new Set(surveyIds)] } },
    select: { id: true, workspaceId: true },
  });
  return new Map(surveys.map((survey) => [survey.id, survey.workspaceId]));
};

export interface TWorkspaceSurveyRef extends TSegmentSurveyReference {
  status: "draft" | "inProgress" | "paused" | "completed";
}

/**
 * Surveys of the workspace the CURRENT viewer may see (FSINF per-survey isolation), used for the
 * survey-interaction picker and the segment activity lists.
 */
export const getSurveyRefsForWorkspace = reactCache(
  async (workspaceId: string): Promise<TWorkspaceSurveyRef[]> => {
    validateInputs([workspaceId, ZId]);
    const viewerWhere = await buildViewerSurveyWhere(workspaceId);
    return prisma.survey.findMany({
      where: { workspaceId, archivedAt: null, ...viewerWhere },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
  }
);

/** Segments with the (viewer-visible) surveys using them, split into active and inactive. */
export const getSegmentsWithSurveyRefs = async (workspaceId: string): Promise<TSegmentWithSurveyRefs[]> => {
  const [segments, surveyRefs] = await Promise.all([
    getSegments(workspaceId),
    getSurveyRefsForWorkspace(workspaceId),
  ]);
  const refsById = new Map(surveyRefs.map((ref) => [ref.id, ref]));

  return segments.map((segment) => {
    const refs = segment.surveys.flatMap((id) => {
      const ref = refsById.get(id);
      return ref ? [ref] : [];
    });
    return {
      ...segment,
      activeSurveys: refs.filter((ref) => ref.status === "inProgress").map(({ id, name }) => ({ id, name })),
      inactiveSurveys: refs
        .filter((ref) => ref.status !== "inProgress")
        .map(({ id, name }) => ({ id, name })),
    };
  });
};

const collectSurveyInteractionIds = (filters: TBaseFilters): string[] => {
  const ids: string[] = [];
  const walk = (list: TBaseFilters) => {
    for (const group of list) {
      if (Array.isArray(group.resource)) walk(group.resource);
      else if (group.resource.root.type === "surveyInteraction") {
        const value = group.resource.value as { surveyScope?: string; surveyIds?: string[] };
        if (value.surveyScope === "specific") ids.push(...(value.surveyIds ?? []));
      }
    }
  };
  walk(filters);
  return ids;
};

/**
 * Validates filters before they are stored: shape, referenced segments (same workspace, no self
 * reference, no cycle) and referenced surveys (same workspace).
 */
export const assertValidSegmentFilters = async (
  workspaceId: string,
  filters: TBaseFilters,
  selfSegmentId?: string
): Promise<TBaseFilters> => {
  const parsed = ZSegmentFilters.safeParse(filters);
  if (!parsed.success) throw new InvalidInputError("Invalid segment filters");

  const referencedSegmentIds = collectReferencedSegmentIds(parsed.data);
  if (referencedSegmentIds.length > 0) {
    const workspaceSegments = await prisma.segment.findMany({
      where: { workspaceId },
      select: { id: true, filters: true },
    });
    const filtersById = new Map(
      workspaceSegments.map((segment) => [segment.id, segment.filters as unknown as TBaseFilters])
    );
    for (const id of referencedSegmentIds) {
      if (!filtersById.has(id)) throw new InvalidInputError(`Segment ${id} was not found in this workspace`);
    }
    if (selfSegmentId) {
      // Depth-first walk over references: reaching the segment being saved again is a cycle.
      const visited = new Set<string>();
      const stack = [...referencedSegmentIds];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (id === selfSegmentId) throw new InvalidInputError("A segment cannot reference itself");
        if (visited.has(id)) continue;
        visited.add(id);
        stack.push(...collectReferencedSegmentIds(filtersById.get(id) ?? []));
      }
    }
  }

  const surveyIds = collectSurveyInteractionIds(parsed.data);
  if (surveyIds.length > 0) {
    const known = await getExistingWorkspaceSurveyIds(workspaceId, surveyIds);
    if (surveyIds.some((id) => !known.has(id))) {
      throw new InvalidInputError("A survey interaction filter references a survey outside this workspace");
    }
  }

  return parsed.data;
};

export const createSegment = async (input: TSegmentCreateInput): Promise<TSegment> => {
  // The editor's "temporary" segment of a survey is its private segment (title = survey id), which
  // may already exist for that survey: reuse it instead of failing on the unique title.
  if (input.isPrivate && input.surveyId && input.title === input.surveyId) {
    const privateFilters = await assertValidSegmentFilters(input.workspaceId, input.filters);
    return setPrivateSegmentFilters(input.surveyId, input.workspaceId, privateFilters);
  }

  const filters = await assertValidSegmentFilters(input.workspaceId, input.filters);

  if (input.surveyId) {
    const known = await getExistingWorkspaceSurveyIds(input.workspaceId, [input.surveyId]);
    if (!known.has(input.surveyId)) throw new InvalidInputError("Survey is not part of this workspace");
  }

  try {
    const segment = await prisma.segment.create({
      data: {
        workspaceId: input.workspaceId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        isPrivate: input.isPrivate,
        filters: filters as unknown as Prisma.InputJsonValue,
        ...(input.surveyId ? { surveys: { connect: { id: input.surveyId } } } : {}),
      },
      select: selectSegment,
    });
    return toSegment(segment);
  } catch (error) {
    return wrapDatabaseError(error);
  }
};

export const updateSegment = async (
  segmentId: string,
  workspaceId: string,
  data: TSegmentUpdateInput
): Promise<TSegment> => {
  await getSegmentInWorkspace(segmentId, workspaceId);

  const filters =
    data.filters === undefined
      ? undefined
      : await assertValidSegmentFilters(workspaceId, data.filters, segmentId);

  if (data.surveys && data.surveys.length > 0) {
    const known = await getExistingWorkspaceSurveyIds(workspaceId, data.surveys);
    if (data.surveys.some((id) => !known.has(id))) {
      throw new InvalidInputError("Survey and segment are not in the same workspace");
    }
  }

  try {
    const segment = await prisma.segment.update({
      where: { id: segmentId },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.isPrivate !== undefined ? { isPrivate: data.isPrivate } : {}),
        ...(filters !== undefined ? { filters: filters as unknown as Prisma.InputJsonValue } : {}),
        ...(data.surveys ? { surveys: { set: data.surveys.map((id) => ({ id })) } } : {}),
      },
      select: selectSegment,
    });
    return toSegment(segment);
  } catch (error) {
    return wrapDatabaseError(error);
  }
};

/** Deletes a segment that no survey uses and no other segment references. */
export const deleteSegment = async (segmentId: string, workspaceId: string): Promise<TSegment> => {
  const segment = await getSegmentInWorkspace(segmentId, workspaceId);
  if (segment.surveys.length > 0) {
    throw new OperationNotAllowedError("Segment is still used by surveys");
  }
  const others = await prisma.segment.findMany({
    where: { workspaceId, id: { not: segmentId } },
    select: { id: true, filters: true },
  });
  if (
    others.some((other) =>
      collectReferencedSegmentIds(other.filters as unknown as TBaseFilters).includes(segmentId)
    )
  ) {
    throw new OperationNotAllowedError("Segment is referenced by another segment");
  }
  await prisma.segment.delete({ where: { id: segmentId } });
  return segment;
};

/** Gives the survey its own private segment (title = survey id) with `filters`, creating it if needed. */
const setPrivateSegmentFilters = async (
  surveyId: string,
  workspaceId: string,
  filters: TBaseFilters
): Promise<TSegment> => {
  const survey = await prisma.survey.findFirst({
    where: { id: surveyId, workspaceId },
    select: { id: true, segment: { select: { id: true, isPrivate: true, title: true } } },
  });
  if (!survey) throw new ResourceNotFoundError("survey", surveyId);

  const jsonFilters = filters as unknown as Prisma.InputJsonValue;
  const segment = await prisma.segment.upsert({
    where: { workspaceId_title: { workspaceId, title: surveyId } },
    create: {
      workspaceId,
      title: surveyId,
      isPrivate: true,
      filters: jsonFilters,
      surveys: { connect: { id: surveyId } },
    },
    update: { filters: jsonFilters, isPrivate: true, surveys: { connect: { id: surveyId } } },
    select: selectSegment,
  });
  return toSegment(segment);
};

/** "Clone & edit": copies a (public) segment's filters into the survey's private segment. */
export const cloneSegmentIntoSurvey = async (
  segmentId: string,
  surveyId: string,
  workspaceId: string
): Promise<TSegment> => {
  const source = await getSegmentInWorkspace(segmentId, workspaceId);
  return setPrivateSegmentFilters(surveyId, workspaceId, source.filters);
};

/** Resets the survey's targeting to a private segment without filters. */
export const resetSegmentInSurvey = async (surveyId: string, workspaceId: string): Promise<TSegment> =>
  setPrivateSegmentFilters(surveyId, workspaceId, []);
