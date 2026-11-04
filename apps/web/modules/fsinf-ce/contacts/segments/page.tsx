/**
 * FSINF CE: segments page (Contacts > Segments).
 */
import { getTranslate } from "@/lingodotdev/server";
import { ContactsSecondaryNavigation } from "@/modules/fsinf-ce/contacts/components/contacts-secondary-navigation";
import { getContactAttributeKeys } from "@/modules/fsinf-ce/contacts/lib/contact-attribute-keys";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";
import { SegmentsList } from "./components/segments-list";
import { getSegmentsWithSurveyRefs, getSurveyRefsForWorkspace } from "./lib/segments";

export const SegmentsPage = async ({ params }: Readonly<{ params: Promise<{ workspaceId: string }> }>) => {
  const { workspaceId } = await params;
  const { workspace, isReadOnly } = await getWorkspaceAuth(workspaceId);
  const t = await getTranslate();

  const [segments, contactAttributeKeys, surveys] = await Promise.all([
    getSegmentsWithSurveyRefs(workspace.id),
    getContactAttributeKeys(workspace.id),
    getSurveyRefsForWorkspace(workspace.id),
  ]);

  return (
    <PageContentWrapper>
      <PageHeader pageTitle={t("common.contacts")}>
        <ContactsSecondaryNavigation workspaceId={workspace.id} activeId="segments" />
      </PageHeader>
      <SegmentsList
        workspaceId={workspace.id}
        segments={segments.filter((segment) => !segment.isPrivate)}
        contactAttributeKeys={contactAttributeKeys}
        surveys={surveys.map(({ id, name }) => ({ id, name }))}
        isReadOnly={isReadOnly}
      />
    </PageContentWrapper>
  );
};
