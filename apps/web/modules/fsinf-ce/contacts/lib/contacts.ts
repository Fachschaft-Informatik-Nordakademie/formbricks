/**
 * FSINF CE: contact service. Every read/write takes the workspace id and matches the contact
 * against it, so a contact id from another workspace is indistinguishable from a missing one.
 */
import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { ZId } from "@formbricks/types/common";
import type {
  TContactAttributeDataType,
  TContactAttributeKeyType,
} from "@formbricks/types/contact-attribute-key";
import { DatabaseError, InvalidInputError, ResourceNotFoundError } from "@formbricks/types/errors";
import type { TBaseFilters } from "@formbricks/types/segment";
import { getPublicDomain } from "@/lib/getPublicUrl";
import { validateInputs } from "@/lib/utils/validate";
import { segmentFilterToPrismaQuery } from "@/modules/fsinf-ce/contacts/segments/lib/filter/prisma-query";
import { buildViewerSurveyWhere } from "@/modules/survey/lib/fsinf-survey-visibility";
import { createContactSurveyToken } from "./contact-survey-link";
import { SEGMENT_SURVEY_WORKSPACE_MISMATCH_ERROR_CODE } from "./personal-link-errors";

export const CONTACTS_PAGE_SIZE = 50;

/** Upper bound for one personal-link export, keeps the CSV and the request bounded. */
export const MAX_PERSONAL_LINKS = 5000;

export interface TContactListItem {
  id: string;
  createdAt: Date;
  attributes: Record<string, string>;
}

const toAttributeRecord = (attributes: { value: string; attributeKey: { key: string } }[]) =>
  Object.fromEntries(attributes.map((attribute) => [attribute.attributeKey.key, attribute.value]));

const wrapDatabaseError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) throw new DatabaseError(error.message);
  throw error;
};

export const getContacts = reactCache(
  async (workspaceId: string, offset: number, searchValue: string): Promise<TContactListItem[]> => {
    validateInputs([workspaceId, ZId]);
    const search = searchValue.trim();
    try {
      const contacts = await prisma.contact.findMany({
        where: {
          workspaceId,
          ...(search
            ? {
                OR: [
                  { id: { contains: search } },
                  { attributes: { some: { value: { contains: search, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          createdAt: true,
          attributes: { select: { value: true, attributeKey: { select: { key: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: CONTACTS_PAGE_SIZE,
        skip: offset,
      });
      return contacts.map((contact) => ({ ...contact, attributes: toAttributeRecord(contact.attributes) }));
    } catch (error) {
      return wrapDatabaseError(error);
    }
  }
);

export const getContactCount = reactCache(async (workspaceId: string): Promise<number> => {
  validateInputs([workspaceId, ZId]);
  return prisma.contact.count({ where: { workspaceId } });
});

export interface TContactDetailAttribute {
  id: string;
  value: string;
  valueNumber: number | null;
  valueDate: Date | null;
  attributeKey: {
    id: string;
    key: string;
    name: string | null;
    type: TContactAttributeKeyType;
    dataType: TContactAttributeDataType;
  };
}

export interface TContactDetail {
  id: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  attributes: TContactDetailAttribute[];
}

/** The contact if (and only if) it belongs to `workspaceId`; null otherwise. */
export const getContactInWorkspace = reactCache(
  async (contactId: string, workspaceId: string): Promise<TContactDetail | null> => {
    if (!ZId.safeParse(contactId).success) return null;
    return prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
        attributes: {
          select: {
            id: true,
            value: true,
            valueNumber: true,
            valueDate: true,
            attributeKey: { select: { id: true, key: true, name: true, type: true, dataType: true } },
          },
          orderBy: { attributeKey: { createdAt: "asc" } },
        },
      },
    });
  }
);

export interface TContactActivity {
  responses: {
    id: string;
    createdAt: Date;
    finished: boolean;
    survey: { id: string; name: string };
  }[];
  displays: { id: string; createdAt: Date; survey: { id: string; name: string } }[];
}

/** Responses and displays of a contact — only for surveys the current viewer may see. */
export const getContactActivity = async (
  contactId: string,
  workspaceId: string
): Promise<TContactActivity> => {
  const viewerWhere = await buildViewerSurveyWhere(workspaceId);
  const surveyWhere = { workspaceId, ...viewerWhere };
  const [responses, displays] = await Promise.all([
    prisma.response.findMany({
      where: { contactId, contact: { workspaceId }, survey: surveyWhere },
      select: { id: true, createdAt: true, finished: true, survey: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.display.findMany({
      where: { contactId, contact: { workspaceId }, survey: surveyWhere },
      select: { id: true, createdAt: true, survey: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { responses, displays };
};

/** Deletes a contact with its attributes, displays and responses (cascade). */
export const deleteContact = async (contactId: string, workspaceId: string): Promise<TContactDetail> => {
  const contact = await getContactInWorkspace(contactId, workspaceId);
  if (!contact) throw new ResourceNotFoundError("contact", contactId);
  await prisma.contact.delete({ where: { id: contactId } });
  return contact;
};

/** Published link surveys of the workspace the current viewer may see (personal link picker). */
export const getPublishedLinkSurveys = async (
  workspaceId: string
): Promise<{ id: string; name: string }[]> => {
  const viewerWhere = await buildViewerSurveyWhere(workspaceId);
  return prisma.survey.findMany({
    where: { workspaceId, type: "link", status: "inProgress", archivedAt: null, ...viewerWhere },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
};

export interface TPersonalLink {
  contactId: string;
  attributes: Record<string, string>;
  surveyUrl: string;
  expiresAt: Date | null;
}

const PERSONAL_LINK_ATTRIBUTE_KEYS = ["userId", "email", "firstName", "lastName"];

/**
 * One personal link per contact of the segment. The caller authorizes access to the survey's
 * workspace; the segment must live in the same workspace.
 */
export const generatePersonalLinks = async (
  surveyId: string,
  segmentId: string,
  expirationDays?: number
): Promise<TPersonalLink[]> => {
  const [survey, segment] = await Promise.all([
    prisma.survey.findUnique({ where: { id: surveyId }, select: { workspaceId: true, type: true } }),
    prisma.segment.findUnique({ where: { id: segmentId }, select: { workspaceId: true, filters: true } }),
  ]);
  if (!survey) throw new ResourceNotFoundError("survey", surveyId);
  if (!segment) throw new ResourceNotFoundError("segment", segmentId);
  if (segment.workspaceId !== survey.workspaceId) {
    throw new InvalidInputError(SEGMENT_SURVEY_WORKSPACE_MISMATCH_ERROR_CODE);
  }
  if (survey.type !== "link")
    throw new InvalidInputError("Personal links are only available for link surveys");

  const query = await segmentFilterToPrismaQuery(
    segmentId,
    segment.filters as unknown as TBaseFilters,
    segment.workspaceId
  );
  if (!query.ok) throw new DatabaseError("Could not resolve segment members");

  const contacts = await prisma.contact.findMany({
    where: query.data.whereClause,
    select: {
      id: true,
      attributes: {
        where: { attributeKey: { key: { in: PERSONAL_LINK_ATTRIBUTE_KEYS } } },
        select: { value: true, attributeKey: { select: { key: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PERSONAL_LINKS,
  });

  const expiresAt = expirationDays ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000) : null;
  const publicDomain = getPublicDomain();

  return contacts.flatMap((contact) => {
    const token = createContactSurveyToken(contact.id, surveyId, expirationDays);
    if (!token.ok) return [];
    return [
      {
        contactId: contact.id,
        attributes: toAttributeRecord(contact.attributes),
        surveyUrl: `${publicDomain}/c/${token.data}`,
        expiresAt,
      },
    ];
  });
};

/** Number of contacts currently matching a segment (segments table). */
export const getSegmentContactCount = async (
  segmentId: string,
  workspaceId: string,
  filters: TBaseFilters
): Promise<number | null> => {
  const query = await segmentFilterToPrismaQuery(segmentId, filters, workspaceId);
  if (!query.ok) return null;
  return prisma.contact.count({ where: query.data.whereClause });
};
