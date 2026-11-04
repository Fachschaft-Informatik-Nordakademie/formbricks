/**
 * FSINF CE: identify-or-create a contact for the JS SDK and compute its user state.
 *
 * The SDK posts `{ userId, attributes }` (setup with a userId, `setUserId`, `setAttribute(s)`,
 * `setLanguage`, and after survey interactions that can flip `surveyInteraction` segments). The
 * response is the SDK's `TUserState` plus optional `messages` (debug) and `errors` (always logged).
 *
 * Segment membership is evaluated in memory against the contact's loaded attributes, displays and
 * responses — see `segments/lib/filter/evaluate.ts`.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@formbricks/database";
import type { TJsPersonState } from "@formbricks/types/js";
import type { TBaseFilters } from "@formbricks/types/segment";
import {
  ensureDefaultAttributeKey,
  upsertContactAttributes,
} from "@/modules/fsinf-ce/contacts/lib/contact-attributes";
import {
  TContactAttributeSnapshot,
  evaluateSegmentFilters,
} from "@/modules/fsinf-ce/contacts/segments/lib/filter/evaluate";

/** How long the SDK may cache the user state before it asks again. */
export const USER_STATE_TTL_MS = 30 * 60 * 1000;

const MAX_ATTRIBUTES_PER_REQUEST = 50;

export const ZClientUserInput = z.object({
  userId: z.string().trim().min(1).max(255),
  attributes: z
    .record(z.string().min(1).max(64), z.union([z.string(), z.number(), z.boolean()]))
    .refine((attributes) => Object.keys(attributes).length <= MAX_ATTRIBUTES_PER_REQUEST, {
      error: `At most ${MAX_ATTRIBUTES_PER_REQUEST} attributes per request`,
    })
    .optional(),
});

export type TClientUserInput = z.infer<typeof ZClientUserInput>;

export const getDeviceTypeFromUserAgent = (userAgent: string | null): "phone" | "desktop" =>
  userAgent && /mobile|android|iphone|ipad|ipod|windows phone/i.test(userAgent) ? "phone" : "desktop";

/** Finds the contact that carries `userId` in this workspace, or creates it. */
const getOrCreateContactId = async (workspaceId: string, userId: string): Promise<string> => {
  const existing = await prisma.contact.findFirst({
    where: {
      workspaceId,
      attributes: { some: { attributeKey: { key: "userId", workspaceId }, value: userId } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const userIdKeyId = await ensureDefaultAttributeKey(workspaceId, "userId");
  const created = await prisma.contact.create({
    data: {
      workspaceId,
      attributes: { create: { attributeKeyId: userIdKeyId, value: userId } },
    },
    select: { id: true },
  });
  return created.id;
};

export interface TClientUserResult {
  state: TJsPersonState;
  messages?: string[];
  errors?: string[];
}

export const identifyClientUser = async (
  workspaceId: string,
  input: TClientUserInput,
  deviceType: "phone" | "desktop",
  now: Date = new Date()
): Promise<TClientUserResult> => {
  const contactId = await getOrCreateContactId(workspaceId, input.userId);

  let messages: string[] = [];
  let errors: string[] = [];

  if (input.attributes) {
    // The identity comes from the top-level userId; an attribute must never re-key the contact.
    const { userId: _ignored, ...attributes } = input.attributes;
    const result = await upsertContactAttributes(contactId, workspaceId, attributes, {
      allowCreateKeys: true,
    });
    messages = result.messages;
    errors = result.errors;
  }

  const [contact, segments] = await Promise.all([
    prisma.contact.findUniqueOrThrow({
      where: { id: contactId },
      select: {
        attributes: {
          select: {
            value: true,
            valueNumber: true,
            valueDate: true,
            attributeKey: { select: { key: true } },
          },
        },
        displays: { select: { surveyId: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        responses: { select: { surveyId: true, createdAt: true, finished: true } },
      },
    }),
    prisma.segment.findMany({ where: { workspaceId }, select: { id: true, filters: true } }),
  ]);

  const attributes: Record<string, TContactAttributeSnapshot> = {};
  for (const attribute of contact.attributes) {
    attributes[attribute.attributeKey.key] = {
      value: attribute.value,
      valueNumber: attribute.valueNumber,
      valueDate: attribute.valueDate,
    };
  }

  const filtersBySegmentId = new Map(
    segments.map((segment) => [segment.id, (segment.filters ?? []) as unknown as TBaseFilters])
  );
  const evaluationContact = {
    attributes,
    deviceType,
    displays: contact.displays,
    responses: contact.responses,
  };
  const memberSegmentIds = segments
    .filter((segment) =>
      evaluateSegmentFilters(
        filtersBySegmentId.get(segment.id) ?? [],
        evaluationContact,
        { now, resolveSegmentFilters: (id) => filtersBySegmentId.get(id) },
        segment.id
      )
    )
    .map((segment) => segment.id);

  const respondedSurveyIds = [...new Set(contact.responses.map((response) => response.surveyId))];
  const language = attributes.language?.value;

  return {
    state: {
      expiresAt: new Date(now.getTime() + USER_STATE_TTL_MS),
      data: {
        userId: input.userId,
        contactId,
        segments: memberSegmentIds,
        displays: contact.displays,
        responses: respondedSurveyIds,
        lastDisplayAt: contact.displays[0]?.createdAt ?? null,
        ...(language ? { language } : {}),
      },
    },
    ...(messages.length > 0 ? { messages } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  };
};
