/**
 * FSINF CE: contacts page (Contacts > Contacts).
 */
import { getTranslate } from "@/lingodotdev/server";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";
import { ContactsSecondaryNavigation } from "./components/contacts-secondary-navigation";
import { ContactsTable } from "./components/contacts-table";
import { UploadContactsModal } from "./components/upload-contacts-modal";
import { getContactAttributeKeys } from "./lib/contact-attribute-keys";
import { CONTACTS_PAGE_SIZE, getContacts } from "./lib/contacts";

export const ContactsPage = async ({ params }: Readonly<{ params: Promise<{ workspaceId: string }> }>) => {
  const { workspaceId } = await params;
  const { workspace, isReadOnly } = await getWorkspaceAuth(workspaceId);
  const t = await getTranslate();

  const [contacts, attributeKeys] = await Promise.all([
    getContacts(workspace.id, 0, ""),
    getContactAttributeKeys(workspace.id),
  ]);

  return (
    <PageContentWrapper>
      <PageHeader
        pageTitle={t("common.contacts")}
        cta={
          isReadOnly ? undefined : (
            <UploadContactsModal workspaceId={workspace.id} attributeKeys={attributeKeys} />
          )
        }>
        <ContactsSecondaryNavigation workspaceId={workspace.id} activeId="contacts" />
      </PageHeader>
      <ContactsTable
        workspaceId={workspace.id}
        initialContacts={contacts}
        pageSize={CONTACTS_PAGE_SIZE}
        isReadOnly={isReadOnly}
      />
    </PageContentWrapper>
  );
};
