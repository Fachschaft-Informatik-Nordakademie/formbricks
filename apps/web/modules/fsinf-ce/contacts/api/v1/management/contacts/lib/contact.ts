/**
 * FSINF CE: v1 management API representation of a contact (identity only, no attribute values).
 */
import type { Prisma } from "@formbricks/database/prisma";

export const v1ContactSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  workspaceId: true,
  attributes: {
    where: { attributeKey: { key: "userId" } },
    select: { value: true },
  },
} satisfies Prisma.ContactSelect;

type TV1ContactRow = Prisma.ContactGetPayload<{ select: typeof v1ContactSelect }>;

export const toV1Contact = ({ attributes, ...contact }: TV1ContactRow) => ({
  ...contact,
  userId: attributes[0]?.value ?? null,
});

/** Parses `limit`/`skip` query parameters with an upper bound. */
export const getPagination = (searchParams: URLSearchParams, maxLimit: number) => {
  const limitParam = Number(searchParams.get("limit") ?? maxLimit);
  const skipParam = Number(searchParams.get("skip") ?? 0);
  return {
    take: Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, maxLimit) : maxLimit,
    skip: Number.isInteger(skipParam) && skipParam > 0 ? skipParam : 0,
  };
};
