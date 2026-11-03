import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { PrismaErrorType } from "@formbricks/database/types/error";
import { ZId } from "@formbricks/types/common";
import {
  DatabaseError,
  InvalidInputError,
  ResourceNotFoundError,
  UniqueConstraintError,
} from "@formbricks/types/errors";
import { TSurveyQuota, TSurveyQuotaInput } from "@formbricks/types/quota";
import { validateInputs } from "@/lib/utils/validate";

/**
 * FSINF CE: data access for survey quotas (`SurveyQuota`).
 *
 * Every write is scoped by `surveyId` in the WHERE clause, so a quota id from another survey (and thus
 * another workspace/organization) can never be read or changed through a survey the caller is authorized
 * for. Authorization itself happens in the API layer (`api/operations.ts`).
 */

export const quotaSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  surveyId: true,
  name: true,
  limit: true,
  logic: true,
  action: true,
  endingCardId: true,
  countPartialSubmissions: true,
} satisfies Prisma.SurveyQuotaSelect;

export type TSurveyQuotaWithCount = TSurveyQuota & { screenedInCount: number };

const rethrowAsDatabaseError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new DatabaseError(error.message);
  }
  throw error;
};

export const getQuota = reactCache(async (quotaId: string): Promise<TSurveyQuota> => {
  validateInputs([quotaId, ZId]);

  let quota: TSurveyQuota | null;
  try {
    quota = await prisma.surveyQuota.findUnique({ where: { id: quotaId }, select: quotaSelect });
  } catch (error) {
    return rethrowAsDatabaseError(error);
  }

  if (!quota) {
    throw new ResourceNotFoundError("Quota", quotaId);
  }
  return quota;
});

export const getQuotas = reactCache(async (surveyId: string): Promise<TSurveyQuota[]> => {
  validateInputs([surveyId, ZId]);

  try {
    return await prisma.surveyQuota.findMany({
      where: { surveyId },
      select: quotaSelect,
      orderBy: { createdAt: "asc" },
    });
  } catch (error) {
    return rethrowAsDatabaseError(error);
  }
});

/** Quotas of a survey together with how many responses are currently screened in (counted). */
export const getQuotasWithCounts = async (surveyId: string): Promise<TSurveyQuotaWithCount[]> => {
  validateInputs([surveyId, ZId]);

  try {
    const quotas = await prisma.surveyQuota.findMany({
      where: { surveyId },
      select: {
        ...quotaSelect,
        _count: { select: { quotaLinks: { where: { status: "screenedIn" } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    return quotas.map(({ _count, ...quota }) => ({ ...quota, screenedInCount: _count.quotaLinks }));
  } catch (error) {
    return rethrowAsDatabaseError(error);
  }
};

const mapWriteError = (error: unknown, name: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === PrismaErrorType.UniqueConstraintViolation) {
      throw new UniqueConstraintError(`A quota named "${name}" already exists in this survey`);
    }
    if (error.code === PrismaErrorType.RecordNotFound) {
      throw new ResourceNotFoundError("Quota", null);
    }
    throw new DatabaseError(error.message);
  }
  throw error;
};

const toPrismaData = (input: TSurveyQuotaInput) => ({
  name: input.name.trim(),
  limit: input.limit,
  logic: input.logic,
  action: input.action,
  // An ending card only makes sense when the quota ends the survey.
  endingCardId: input.action === "endSurvey" ? input.endingCardId : null,
  countPartialSubmissions: input.countPartialSubmissions,
});

export const createQuota = async (input: TSurveyQuotaInput): Promise<TSurveyQuota> => {
  try {
    return await prisma.surveyQuota.create({
      data: { ...toPrismaData(input), survey: { connect: { id: input.surveyId } } },
      select: quotaSelect,
    });
  } catch (error) {
    return mapWriteError(error, input.name);
  }
};

/**
 * Updates a quota of `input.surveyId`. Runs in a transaction that row-locks the quota (the same lock
 * the response-time evaluation takes), so the "limit >= already screened-in responses" check cannot
 * race with a response being screened in at the same moment.
 */
export const updateQuota = async (quotaId: string, input: TSurveyQuotaInput): Promise<TSurveyQuota> => {
  validateInputs([quotaId, ZId]);

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "SurveyQuota" WHERE "id" = ${quotaId} AND "surveyId" = ${input.surveyId} FOR UPDATE`;
      if (locked.length === 0) {
        throw new ResourceNotFoundError("Quota", quotaId);
      }

      const screenedInCount = await tx.responseQuotaLink.count({
        where: { quotaId, status: "screenedIn" },
      });
      if (input.limit < screenedInCount) {
        throw new InvalidInputError(
          `The limit must be at least the number of responses already counted for this quota (${screenedInCount})`
        );
      }

      return await tx.surveyQuota.update({
        where: { id: quotaId, surveyId: input.surveyId },
        data: toPrismaData(input),
        select: quotaSelect,
      });
    });
  } catch (error) {
    return mapWriteError(error, input.name);
  }
};

export const deleteQuota = async (quotaId: string, surveyId: string): Promise<TSurveyQuota> => {
  validateInputs([quotaId, ZId], [surveyId, ZId]);

  try {
    return await prisma.surveyQuota.delete({ where: { id: quotaId, surveyId }, select: quotaSelect });
  } catch (error) {
    return mapWriteError(error, "");
  }
};

/**
 * Lowers the limit of each given quota by one. Used when a screened-in response is deleted and the user
 * chose "decrement quotas": the deleted response then still occupies its slot, i.e. the number of
 * further responses the quota accepts stays the same. Never goes below zero.
 */
export const reduceQuotaLimits = async (quotaIds: string[], tx: Prisma.TransactionClient): Promise<void> => {
  if (quotaIds.length === 0) return;

  await tx.surveyQuota.updateMany({
    where: { id: { in: quotaIds }, limit: { gt: 0 } },
    data: { limit: { decrement: 1 } },
  });
};
