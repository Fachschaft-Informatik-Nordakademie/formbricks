/**
 * FSINF CE: contact attribute key service (workspace-scoped).
 */
import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@formbricks/database";
import { Prisma } from "@formbricks/database/prisma";
import { ZId } from "@formbricks/types/common";
import type {
  TContactAttributeDataType,
  TContactAttributeKey,
} from "@formbricks/types/contact-attribute-key";
import {
  DatabaseError,
  InvalidInputError,
  OperationNotAllowedError,
  ResourceNotFoundError,
} from "@formbricks/types/errors";
import { MAX_ATTRIBUTE_CLASSES_PER_ENVIRONMENT } from "@/lib/constants";
import { formatSnakeCaseToTitleCase, isSafeIdentifier } from "@/lib/utils/safe-identifier";
import { validateInputs } from "@/lib/utils/validate";
import {
  getReservedFutureDefaultAttributeKeyIssue,
  isReservedFutureDefaultAttributeKey,
} from "./attribute-key-policy";

export const MAX_ATTRIBUTE_KEYS_PER_WORKSPACE = MAX_ATTRIBUTE_CLASSES_PER_ENVIRONMENT;

export const selectContactAttributeKey = {
  id: true,
  createdAt: true,
  updatedAt: true,
  isUnique: true,
  key: true,
  name: true,
  description: true,
  type: true,
  dataType: true,
  workspaceId: true,
} satisfies Prisma.ContactAttributeKeySelect;

export const getContactAttributeKeys = reactCache(
  async (workspaceId: string): Promise<TContactAttributeKey[]> => {
    validateInputs([workspaceId, ZId]);
    try {
      return await prisma.contactAttributeKey.findMany({
        where: { workspaceId },
        select: selectContactAttributeKey,
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) throw new DatabaseError(error.message);
      throw error;
    }
  }
);

/** Loads one key and fails closed when it does not belong to the given workspace. */
export const getContactAttributeKeyInWorkspace = async (
  contactAttributeKeyId: string,
  workspaceId: string
): Promise<TContactAttributeKey> => {
  const key = await prisma.contactAttributeKey.findFirst({
    where: { id: contactAttributeKeyId, workspaceId },
    select: selectContactAttributeKey,
  });
  if (!key) throw new ResourceNotFoundError("contactAttributeKey", contactAttributeKeyId);
  return key;
};

export interface TCreateContactAttributeKeyInput {
  workspaceId: string;
  key: string;
  name?: string | null;
  description?: string | null;
  dataType?: TContactAttributeDataType;
}

/** Validates a key created by a person (UI/API): safe identifier, not reserved. */
export const assertValidNewAttributeKey = (key: string): void => {
  if (!isSafeIdentifier(key)) {
    throw new InvalidInputError(
      "Key must be a safe identifier: only lowercase letters, numbers, and underscores, and must start with a letter"
    );
  }
  if (isReservedFutureDefaultAttributeKey(key)) {
    throw new InvalidInputError(getReservedFutureDefaultAttributeKeyIssue([key]));
  }
};

export const createContactAttributeKey = async (
  input: TCreateContactAttributeKeyInput
): Promise<TContactAttributeKey> => {
  assertValidNewAttributeKey(input.key);

  const count = await prisma.contactAttributeKey.count({ where: { workspaceId: input.workspaceId } });
  if (count >= MAX_ATTRIBUTE_KEYS_PER_WORKSPACE) {
    throw new OperationNotAllowedError(
      `Maximum number of attribute keys (${MAX_ATTRIBUTE_KEYS_PER_WORKSPACE}) reached for this workspace`
    );
  }

  try {
    return await prisma.contactAttributeKey.create({
      data: {
        workspaceId: input.workspaceId,
        key: input.key,
        name: input.name?.trim() || formatSnakeCaseToTitleCase(input.key),
        description: input.description?.trim() || null,
        type: "custom",
        dataType: input.dataType ?? "string",
      },
      select: selectContactAttributeKey,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InvalidInputError(`Attribute key "${input.key}" already exists`);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) throw new DatabaseError(error.message);
    throw error;
  }
};

/** Only label and description are editable; key and data type are fixed after creation. */
export const updateContactAttributeKey = async (
  contactAttributeKeyId: string,
  workspaceId: string,
  data: { name?: string | null; description?: string | null }
): Promise<TContactAttributeKey> => {
  await getContactAttributeKeyInWorkspace(contactAttributeKeyId, workspaceId);
  return prisma.contactAttributeKey.update({
    where: { id: contactAttributeKeyId },
    data: {
      ...(data.name !== undefined ? { name: data.name?.trim() || null } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
    },
    select: selectContactAttributeKey,
  });
};

/** Deletes a custom key and (by cascade) every value stored under it. Default keys are protected. */
export const deleteContactAttributeKey = async (
  contactAttributeKeyId: string,
  workspaceId: string
): Promise<TContactAttributeKey> => {
  const key = await getContactAttributeKeyInWorkspace(contactAttributeKeyId, workspaceId);
  if (key.type === "default") {
    throw new OperationNotAllowedError("Default attribute keys cannot be deleted");
  }
  await prisma.contactAttributeKey.delete({ where: { id: contactAttributeKeyId } });
  return key;
};
