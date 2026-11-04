"use client";

/**
 * FSINF CE: actions on the contact detail page — edit attributes, generate a personal survey link,
 * delete the contact.
 */
import { LinkIcon, PencilIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TContactAttributeDataType } from "@formbricks/types/contact-attribute-key";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { Button } from "@/modules/ui/components/button";
import { DeleteDialog } from "@/modules/ui/components/delete-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { Input } from "@/modules/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";
import { deleteContactAction, generatePersonalLinkAction, updateContactAttributesAction } from "../actions";

export interface TEditableAttribute {
  key: string;
  name: string;
  dataType: TContactAttributeDataType;
  /** Current value in the form the input needs (ISO date `YYYY-MM-DD` for dates); "" = not set. */
  value: string;
}

interface ContactDetailActionsProps {
  workspaceId: string;
  contactId: string;
  attributes: TEditableAttribute[];
  linkSurveys: { id: string; name: string }[];
  isReadOnly: boolean;
}

const inputTypeFor = (dataType: TContactAttributeDataType) => {
  if (dataType === "number") return "number";
  if (dataType === "date") return "date";
  return "text";
};

export const ContactDetailActions = ({
  workspaceId,
  contactId,
  attributes,
  linkSurveys,
  isReadOnly,
}: Readonly<ContactDetailActionsProps>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [surveyId, setSurveyId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const openEdit = () => {
    setValues(Object.fromEntries(attributes.map((attribute) => [attribute.key, attribute.value])));
    setIsEditOpen(true);
  };

  const handleSave = async () => {
    const changed = Object.fromEntries(
      attributes
        .filter((attribute) => (values[attribute.key] ?? "") !== attribute.value)
        .map((attribute) => [attribute.key, (values[attribute.key] ?? "").trim()])
    );
    if (Object.keys(changed).length === 0) {
      setIsEditOpen(false);
      return;
    }
    setIsSaving(true);
    const result = await updateContactAttributesAction({ workspaceId, contactId, attributes: changed });
    setIsSaving(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    if (result.data.messages.length > 0) toast(result.data.messages.join("\n"));
    toast.success(t("workspace.contacts.edit_attributes_success"));
    setIsEditOpen(false);
    router.refresh();
  };

  const handleGenerateLink = async () => {
    if (!surveyId) {
      toast.error(t("workspace.contacts.please_select_a_survey"));
      return;
    }
    setIsGenerating(true);
    const result = await generatePersonalLinkAction({ workspaceId, contactId, surveyId });
    setIsGenerating(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    try {
      await navigator.clipboard.writeText(result.data);
      toast.success(t("workspace.contacts.personal_link_generated"));
    } catch {
      toast.success(
        t("workspace.contacts.personal_link_generated_but_clipboard_failed", { url: result.data }),
        {
          duration: 15000,
        }
      );
    }
    setIsLinkOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteContactAction({ workspaceId, contactId });
    setIsDeleting(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    toast.success(t("workspace.contacts.contact_deleted_successfully"));
    router.push(`/workspaces/${workspaceId}/contacts`);
    router.refresh();
  };

  if (isReadOnly) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={openEdit}>
        <PencilIcon />
        {t("workspace.contacts.edit_attributes")}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => setIsLinkOpen(true)}>
        <LinkIcon />
        {t("workspace.contacts.generate_personal_link")}
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={() => setIsDeleteOpen(true)}>
        <TrashIcon />
        {t("common.delete")}
      </Button>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.contacts.edit_attribute_values")}</DialogTitle>
            <DialogDescription>{t("workspace.contacts.edit_attribute_values_description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {attributes.map((attribute) => (
              <div key={attribute.key}>
                <label htmlFor={`attr-${attribute.key}`} className="text-sm font-medium text-slate-700">
                  {attribute.name}
                </label>
                <Input
                  id={`attr-${attribute.key}`}
                  type={inputTypeFor(attribute.dataType)}
                  value={values[attribute.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [attribute.key]: event.target.value }))
                  }
                />
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" loading={isSaving} onClick={handleSave}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.contacts.generate_personal_link")}</DialogTitle>
            <DialogDescription>
              {t("workspace.contacts.generate_personal_link_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {linkSurveys.length === 0 ? (
              <p className="text-sm text-slate-500">
                {t("workspace.contacts.no_published_link_surveys_available")}
              </p>
            ) : (
              <Select value={surveyId} onValueChange={setSurveyId}>
                <SelectTrigger aria-label={t("workspace.contacts.select_a_survey")}>
                  <SelectValue placeholder={t("workspace.contacts.select_a_survey")} />
                </SelectTrigger>
                <SelectContent>
                  {linkSurveys.map((survey) => (
                    <SelectItem key={survey.id} value={survey.id}>
                      {survey.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsLinkOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              loading={isGenerating}
              disabled={linkSurveys.length === 0}
              onClick={handleGenerateLink}>
              {t("workspace.contacts.generate_personal_link")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={isDeleteOpen}
        setOpen={setIsDeleteOpen}
        deleteWhat={t("common.contact")}
        text={t("workspace.contacts.delete_contact_confirmation")}
        isDeleting={isDeleting}
        onDelete={handleDelete}
      />
    </div>
  );
};
