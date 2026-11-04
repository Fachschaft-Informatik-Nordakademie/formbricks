"use server";

/**
 * FSINF CE: server actions behind the contacts and attributes pages. (Server actions are the
 * established pattern for these legacy pages; every action re-checks workspace access server-side.)
 */
import { z } from "zod";
import { ZId } from "@formbricks/types/common";
import { ZContactAttributeDataType } from "@formbricks/types/contact-attribute-key";
import { InvalidInputError, ResourceNotFoundError } from "@formbricks/types/errors";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { withAuditLogging } from "@/modules/fsinf-ce/audit-logs/lib/handler";
import { authorizeContactsAccess } from "./lib/authorize";
import {
  createContactAttributeKey,
  deleteContactAttributeKey,
  updateContactAttributeKey,
} from "./lib/contact-attribute-keys";
import { upsertContactAttributes } from "./lib/contact-attributes";
import { getContactSurveyLink } from "./lib/contact-survey-link";
import {
  deleteContact,
  getContactActivity,
  getContactInWorkspace,
  getContacts,
  getPublishedLinkSurveys,
} from "./lib/contacts";
import { MAX_IMPORT_ROWS, importContacts } from "./lib/contacts-import";

const ZGetContactsAction = z.object({
  workspaceId: ZId,
  offset: z.number().int().min(0),
  searchValue: z.string().max(200).optional(),
});

export const getContactsAction = authenticatedActionClient
  .inputSchema(ZGetContactsAction)
  .action(async ({ ctx, parsedInput }) => {
    await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "read");
    return getContacts(parsedInput.workspaceId, parsedInput.offset, parsedInput.searchValue ?? "");
  });

const ZContactRef = z.object({ workspaceId: ZId, contactId: ZId });

export const deleteContactAction = authenticatedActionClient.inputSchema(ZContactRef).action(
  withAuditLogging("deleted", "contact", async ({ ctx, parsedInput }) => {
    const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;
    ctx.auditLoggingCtx.contactId = parsedInput.contactId;
    const deleted = await deleteContact(parsedInput.contactId, parsedInput.workspaceId);
    // Only ids go into the audit record — attribute values are personal data.
    ctx.auditLoggingCtx.oldObject = { id: deleted.id, workspaceId: deleted.workspaceId };
    return { id: deleted.id };
  })
);

const ZDeleteContactsAction = z.object({ workspaceId: ZId, contactIds: z.array(ZId).min(1).max(500) });

export const deleteContactsAction = authenticatedActionClient.inputSchema(ZDeleteContactsAction).action(
  withAuditLogging("deleted", "contact", async ({ ctx, parsedInput }) => {
    const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;
    for (const contactId of parsedInput.contactIds) {
      await deleteContact(contactId, parsedInput.workspaceId);
    }
    ctx.auditLoggingCtx.oldObject = {
      contactIds: parsedInput.contactIds,
      workspaceId: parsedInput.workspaceId,
    };
    return { deleted: parsedInput.contactIds.length };
  })
);

const ZUpdateContactAttributesAction = ZContactRef.extend({
  attributes: z.record(z.string().min(1).max(64), z.string().max(1000)),
});

export const updateContactAttributesAction = authenticatedActionClient
  .inputSchema(ZUpdateContactAttributesAction)
  .action(
    withAuditLogging("updated", "contact", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.contactId = parsedInput.contactId;

      const contact = await getContactInWorkspace(parsedInput.contactId, parsedInput.workspaceId);
      if (!contact) throw new ResourceNotFoundError("contact", parsedInput.contactId);

      const result = await upsertContactAttributes(
        contact.id,
        parsedInput.workspaceId,
        parsedInput.attributes,
        {
          allowCreateKeys: false,
          deleteEmpty: true,
        }
      );
      if (result.errors.length > 0) throw new InvalidInputError(result.errors.join("\n"));
      ctx.auditLoggingCtx.newObject = { updatedKeys: result.updatedKeys };
      return { updatedKeys: result.updatedKeys, messages: result.messages };
    })
  );

export const getContactActivityAction = authenticatedActionClient
  .inputSchema(ZContactRef)
  .action(async ({ ctx, parsedInput }) => {
    await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "read");
    const contact = await getContactInWorkspace(parsedInput.contactId, parsedInput.workspaceId);
    if (!contact) throw new ResourceNotFoundError("contact", parsedInput.contactId);
    return getContactActivity(contact.id, parsedInput.workspaceId);
  });

const ZGeneratePersonalLinkAction = ZContactRef.extend({
  surveyId: ZId,
  expirationDays: z.number().int().min(1).max(365).optional(),
});

export const generatePersonalLinkAction = authenticatedActionClient
  .inputSchema(ZGeneratePersonalLinkAction)
  .action(async ({ ctx, parsedInput }) => {
    await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
    const [contact, surveys] = await Promise.all([
      getContactInWorkspace(parsedInput.contactId, parsedInput.workspaceId),
      getPublishedLinkSurveys(parsedInput.workspaceId),
    ]);
    if (!contact) throw new ResourceNotFoundError("contact", parsedInput.contactId);
    if (!surveys.some((survey) => survey.id === parsedInput.surveyId)) {
      throw new ResourceNotFoundError("survey", parsedInput.surveyId);
    }
    const link = await getContactSurveyLink(contact.id, parsedInput.surveyId, parsedInput.expirationDays);
    if (!link.ok) throw new InvalidInputError(link.error.details?.[0]?.issue ?? "Could not create link");
    return link.data;
  });

const ZImportContactsAction = z.object({
  workspaceId: ZId,
  rows: z
    .array(z.record(z.string().max(64), z.string().max(1000)))
    .min(1)
    .max(MAX_IMPORT_ROWS),
  duplicateAction: z.enum(["skip", "update", "overwrite"]),
});

export const importContactsAction = authenticatedActionClient.inputSchema(ZImportContactsAction).action(
  withAuditLogging("createdUpdated", "contact", async ({ ctx, parsedInput }) => {
    const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
    ctx.auditLoggingCtx.organizationId = organizationId;
    const result = await importContacts(
      parsedInput.workspaceId,
      parsedInput.rows,
      parsedInput.duplicateAction
    );
    ctx.auditLoggingCtx.newObject = {
      workspaceId: parsedInput.workspaceId,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped.length,
    };
    return result;
  })
);

const ZCreateAttributeKeyAction = z.object({
  workspaceId: ZId,
  key: z.string().min(1).max(64),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  dataType: ZContactAttributeDataType.optional(),
});

export const createContactAttributeKeyAction = authenticatedActionClient
  .inputSchema(ZCreateAttributeKeyAction)
  .action(
    withAuditLogging("created", "contactAttributeKey", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
      ctx.auditLoggingCtx.organizationId = organizationId;
      const key = await createContactAttributeKey(parsedInput);
      ctx.auditLoggingCtx.contactAttributeKeyId = key.id;
      ctx.auditLoggingCtx.newObject = key;
      return key;
    })
  );

const ZUpdateAttributeKeyAction = z.object({
  workspaceId: ZId,
  contactAttributeKeyId: ZId,
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

export const updateContactAttributeKeyAction = authenticatedActionClient
  .inputSchema(ZUpdateAttributeKeyAction)
  .action(
    withAuditLogging("updated", "contactAttributeKey", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
      ctx.auditLoggingCtx.organizationId = organizationId;
      ctx.auditLoggingCtx.contactAttributeKeyId = parsedInput.contactAttributeKeyId;
      const key = await updateContactAttributeKey(
        parsedInput.contactAttributeKeyId,
        parsedInput.workspaceId,
        {
          name: parsedInput.name,
          description: parsedInput.description,
        }
      );
      ctx.auditLoggingCtx.newObject = key;
      return key;
    })
  );

const ZDeleteAttributeKeysAction = z.object({
  workspaceId: ZId,
  contactAttributeKeyIds: z.array(ZId).min(1).max(200),
});

export const deleteContactAttributeKeysAction = authenticatedActionClient
  .inputSchema(ZDeleteAttributeKeysAction)
  .action(
    withAuditLogging("deleted", "contactAttributeKey", async ({ ctx, parsedInput }) => {
      const organizationId = await authorizeContactsAccess(ctx.user.id, parsedInput.workspaceId, "readWrite");
      ctx.auditLoggingCtx.organizationId = organizationId;
      const deleted = [];
      for (const id of parsedInput.contactAttributeKeyIds) {
        deleted.push(await deleteContactAttributeKey(id, parsedInput.workspaceId));
      }
      ctx.auditLoggingCtx.oldObject = { keys: deleted.map((key) => key.key) };
      return { deleted: deleted.length };
    })
  );
