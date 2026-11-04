/**
 * FSINF CE: tab bar shared by the contacts, segments and attributes pages.
 */
import { getTranslate } from "@/lingodotdev/server";
import { SecondaryNavigation } from "@/modules/ui/components/secondary-navigation";

interface ContactsSecondaryNavigationProps {
  workspaceId: string;
  activeId: "contacts" | "segments" | "attributes";
}

export const ContactsSecondaryNavigation = async ({
  workspaceId,
  activeId,
}: Readonly<ContactsSecondaryNavigationProps>) => {
  const t = await getTranslate();
  const base = `/workspaces/${workspaceId}`;
  return (
    <SecondaryNavigation
      activeId={activeId}
      navigation={[
        { id: "contacts", label: t("common.contacts"), href: `${base}/contacts` },
        { id: "segments", label: t("common.segments"), href: `${base}/segments` },
        { id: "attributes", label: t("common.attributes"), href: `${base}/attributes` },
      ]}
    />
  );
};
