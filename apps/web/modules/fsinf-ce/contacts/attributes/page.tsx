/**
 * FSINF CE: attributes page (Contacts > Attributes).
 */
import { getTranslate } from "@/lingodotdev/server";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";
import { AttributesManager } from "../components/attributes-manager";
import { ContactsSecondaryNavigation } from "../components/contacts-secondary-navigation";
import { getContactAttributeKeys } from "../lib/contact-attribute-keys";

export const AttributesPage = async ({ params }: Readonly<{ params: Promise<{ workspaceId: string }> }>) => {
  const { workspaceId } = await params;
  const { workspace, isReadOnly } = await getWorkspaceAuth(workspaceId);
  const t = await getTranslate();
  const attributeKeys = await getContactAttributeKeys(workspace.id);

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.contacts")}>
        <ContactsSecondaryNavigation workspaceId={workspace.id} activeId="attributes" />
      </PageHeader>
      <AttributesManager workspaceId={workspace.id} attributeKeys={attributeKeys} isReadOnly={isReadOnly} />
    </PageContentWrapper>
  );
};
