/**
 * FSINF CE: contact detail page. The contact is always looked up WITH the workspace of the URL, so a
 * contact id of another workspace renders a 404 and never any of its data.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/time";
import { getUserLocale } from "@/lib/user/service";
import { getTranslate } from "@/lingodotdev/server";
import { GoBackButton } from "@/modules/ui/components/go-back-button";
import { PageContentWrapper } from "@/modules/ui/components/page-content-wrapper";
import { PageHeader } from "@/modules/ui/components/page-header";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";
import { ContactDetailActions, type TEditableAttribute } from "../components/contact-detail-actions";
import { getContactAttributeKeys } from "../lib/contact-attribute-keys";
import { getContactActivity, getContactInWorkspace, getPublishedLinkSurveys } from "../lib/contacts";

const toEditableValue = (attribute?: { value: string; valueDate: Date | null; dataType: string }): string => {
  if (!attribute) return "";
  if (attribute.dataType === "date" && attribute.valueDate)
    return attribute.valueDate.toISOString().slice(0, 10);
  return attribute.value;
};

export const SingleContactPage = async ({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string; contactId: string }> }>) => {
  const { workspaceId, contactId } = await params;
  const { workspace, session, isReadOnly } = await getWorkspaceAuth(workspaceId);

  const contact = await getContactInWorkspace(contactId, workspace.id);
  if (!contact) notFound();

  const t = await getTranslate();
  const [activity, keys, linkSurveys, locale] = await Promise.all([
    getContactActivity(contact.id, workspace.id),
    getContactAttributeKeys(workspace.id),
    getPublishedLinkSurveys(workspace.id),
    getUserLocale(session.user.id),
  ]);

  const byKey = new Map(contact.attributes.map((attribute) => [attribute.attributeKey.key, attribute]));
  const title = byKey.get("email")?.value || byKey.get("userId")?.value || contact.id;

  const editable: TEditableAttribute[] = keys.map((key) => ({
    key: key.key,
    name: key.name ?? key.key,
    dataType: key.dataType,
    value: toEditableValue(
      byKey.has(key.key) ? { ...byKey.get(key.key)!, dataType: key.dataType } : undefined
    ),
  }));

  const systemAttributes = contact.attributes.filter(
    (attribute) => attribute.attributeKey.type === "default"
  );
  const customAttributes = contact.attributes.filter((attribute) => attribute.attributeKey.type === "custom");

  const renderAttributes = (attributes: typeof contact.attributes) =>
    attributes.length === 0 ? (
      <p className="text-sm text-slate-500">{t("workspace.contacts.not_provided")}</p>
    ) : (
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {attributes.map((attribute) => (
          <div key={attribute.id}>
            <dt className="text-xs font-medium text-slate-500">
              {attribute.attributeKey.name ?? attribute.attributeKey.key}
            </dt>
            <dd className="ph-no-capture text-sm break-all text-slate-900">{attribute.value}</dd>
          </div>
        ))}
      </dl>
    );

  const surveyLink = (survey: { id: string; name: string }) => (
    <Link
      href={`/workspaces/${workspace.id}/surveys/${survey.id}/responses`}
      className="font-medium text-slate-900 underline">
      {survey.name}
    </Link>
  );

  return (
    <PageContentWrapper>
      <GoBackButton url={`/workspaces/${workspace.id}/contacts`} />
      <PageHeader pageTitle={<span className="ph-no-capture break-all">{title}</span>} />
      <div className="space-y-8">
        <ContactDetailActions
          workspaceId={workspace.id}
          contactId={contact.id}
          attributes={editable}
          linkSurveys={linkSurveys}
          isReadOnly={isReadOnly}
        />

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("workspace.contacts.system_attributes")}
          </h2>
          {renderAttributes(systemAttributes)}
          <h2 className="pt-3 text-sm font-semibold text-slate-900">
            {t("workspace.contacts.custom_attributes")}
          </h2>
          {renderAttributes(customAttributes)}
          <p className="pt-2 text-xs text-slate-400">
            {t("common.created_at")}: {formatDate(contact.createdAt, locale ?? "en-US")}
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">{t("common.responses")}</h2>
          {activity.responses.length === 0 && activity.displays.length === 0 ? (
            <p className="text-sm text-slate-500">{t("workspace.contacts.no_activity_yet")}</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {activity.responses.map((response) => (
              <li key={response.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {surveyLink(response.survey)} ·{" "}
                  {response.finished
                    ? t("common.completed")
                    : t("workspace.contacts.survey_response_created")}
                </span>
                <span className="text-slate-500">{formatDate(response.createdAt, locale ?? "en-US")}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">{t("workspace.contacts.displays")}</h2>
          <ul className="space-y-2 text-sm">
            {activity.displays.map((display) => (
              <li key={display.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {surveyLink(display.survey)} · {t("workspace.contacts.survey_viewed")}
                </span>
                <span className="text-slate-500">{formatDate(display.createdAt, locale ?? "en-US")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageContentWrapper>
  );
};
