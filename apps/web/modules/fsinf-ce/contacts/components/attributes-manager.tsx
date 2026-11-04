"use client";

/**
 * FSINF CE: attribute key management (attributes page) — list, search, create, edit label/description,
 * delete custom keys.
 */
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type {
  TContactAttributeDataType,
  TContactAttributeKey,
} from "@formbricks/types/contact-attribute-key";
import type { TUserLocale } from "@formbricks/types/user";
import { formatDate } from "@/lib/time";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { isSafeIdentifier } from "@/lib/utils/safe-identifier";
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
import { SearchBar } from "@/modules/ui/components/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/components/select";
import {
  createContactAttributeKeyAction,
  deleteContactAttributeKeysAction,
  updateContactAttributeKeyAction,
} from "../actions";
import {
  formatReservedFutureDefaultAttributeKeys,
  isReservedFutureDefaultAttributeKey,
} from "../lib/attribute-key-policy";

interface AttributesManagerProps {
  workspaceId: string;
  attributeKeys: TContactAttributeKey[];
  isReadOnly: boolean;
}

const DATA_TYPE_LABEL_KEYS: Record<TContactAttributeDataType, string> = {
  string: "common.string",
  number: "common.number",
  date: "common.date",
};

export const AttributesManager = ({
  workspaceId,
  attributeKeys,
  isReadOnly,
}: Readonly<AttributesManagerProps>) => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = (i18n.resolvedLanguage ?? "en-US") as TUserLocale;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TContactAttributeKey | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    description: "",
    dataType: "string" as TContactAttributeDataType,
  });

  const query = search.trim().toLowerCase();
  const visible = attributeKeys.filter(
    (key) => !query || key.key.toLowerCase().includes(query) || (key.name ?? "").toLowerCase().includes(query)
  );

  const keyError = (() => {
    if (!form.key) return t("workspace.contacts.attribute_key_required");
    if (!isSafeIdentifier(form.key)) return t("workspace.contacts.attribute_key_safe_identifier_required");
    if (isReservedFutureDefaultAttributeKey(form.key)) {
      return t("workspace.contacts.attribute_key_reserved_future_default", {
        reservedKeys: formatReservedFutureDefaultAttributeKeys(),
      });
    }
    return null;
  })();

  const openCreate = () => {
    setForm({ key: "", name: "", description: "", dataType: "string" });
    setIsCreateOpen(true);
  };

  const openEdit = (key: TContactAttributeKey) => {
    setForm({
      key: key.key,
      name: key.name ?? "",
      description: key.description ?? "",
      dataType: key.dataType,
    });
    setEditing(key);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const result = editing
      ? await updateContactAttributeKeyAction({
          workspaceId,
          contactAttributeKeyId: editing.id,
          name: form.name,
          description: form.description,
        })
      : await createContactAttributeKeyAction({
          workspaceId,
          key: form.key,
          name: form.name || undefined,
          description: form.description || undefined,
          dataType: form.dataType,
        });
    setIsSaving(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    toast.success(
      editing
        ? t("workspace.contacts.attribute_updated_successfully")
        : t("workspace.contacts.attribute_created_successfully")
    );
    setIsCreateOpen(false);
    setEditing(null);
    router.refresh();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteContactAttributeKeysAction({
      workspaceId,
      contactAttributeKeyIds: [...selected],
    });
    setIsDeleting(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    toast.success(t("common.table_items_deleted_successfully", { type: t("common.attributes") }));
    setSelected(new Set());
    setIsDeleteOpen(false);
    router.refresh();
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isDialogOpen = isCreateOpen || editing !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t("workspace.contacts.search_attribute_keys")}
          className="w-full max-w-sm"
        />
        <div className="flex gap-2">
          {!isReadOnly && selected.size > 0 && (
            <Button type="button" variant="destructive" size="sm" onClick={() => setIsDeleteOpen(true)}>
              {t("common.delete")} ({selected.size})
            </Button>
          )}
          {!isReadOnly && (
            <Button type="button" onClick={openCreate}>
              <PlusIcon />
              {t("workspace.contacts.add_attribute")}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-900">
            <tr>
              {!isReadOnly && <th className="w-10 px-4 py-3" />}
              <th className="px-4 py-3 font-semibold">{t("common.label")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.key")}</th>
              <th className="px-4 py-3 font-semibold">{t("workspace.contacts.data_type")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.type")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.description")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.created_at")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((key) => (
              <tr
                key={key.id}
                onClick={() => !isReadOnly && openEdit(key)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                {!isReadOnly && (
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    {key.type === "custom" ? (
                      <input
                        type="checkbox"
                        aria-label={key.key}
                        checked={selected.has(key.id)}
                        onChange={() => toggle(key.id)}
                      />
                    ) : null}
                  </td>
                )}
                <td className="px-4 py-3 font-medium">{key.name ?? key.key}</td>
                <td className="px-4 py-3 font-mono text-xs">{key.key}</td>
                <td className="px-4 py-3">{t(DATA_TYPE_LABEL_KEYS[key.dataType])}</td>
                <td className="px-4 py-3">
                  {key.type === "default" ? t("common.default") : t("workspace.contacts.custom_attributes")}
                </td>
                <td className="px-4 py-3 text-slate-500">{key.description}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(new Date(key.createdAt), locale)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {t("workspace.segments.no_attributes_yet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditing(null);
          }
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("workspace.contacts.edit_attribute")
                : t("workspace.contacts.create_new_attribute")}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? t("workspace.contacts.edit_attribute_description")
                : t("workspace.contacts.create_new_attribute_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label htmlFor="attribute-key" className="text-sm font-medium text-slate-700">
                {t("workspace.contacts.attribute_key")}
              </label>
              <Input
                id="attribute-key"
                value={form.key}
                disabled={editing !== null}
                placeholder={t("workspace.contacts.attribute_key_placeholder")}
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-500">
                {editing
                  ? t("workspace.contacts.attribute_key_cannot_be_changed")
                  : t("workspace.contacts.attribute_key_hint")}
              </p>
              {!editing && form.key && keyError && <p className="mt-1 text-xs text-red-500">{keyError}</p>}
            </div>
            <div>
              <label htmlFor="attribute-name" className="text-sm font-medium text-slate-700">
                {t("workspace.contacts.attribute_label")}
              </label>
              <Input
                id="attribute-name"
                value={form.name}
                placeholder={t("workspace.contacts.attribute_label_placeholder")}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="attribute-description" className="text-sm font-medium text-slate-700">
                {t("workspace.contacts.attribute_description")}
              </label>
              <Input
                id="attribute-description"
                value={form.description}
                placeholder={t("workspace.contacts.attribute_description_placeholder")}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div>
              <span className="text-sm font-medium text-slate-700">{t("workspace.contacts.data_type")}</span>
              <Select
                value={form.dataType}
                disabled={editing !== null}
                onValueChange={(dataType) =>
                  setForm((current) => ({ ...current, dataType: dataType as TContactAttributeDataType }))
                }>
                <SelectTrigger aria-label={t("workspace.contacts.data_type")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATA_TYPE_LABEL_KEYS) as TContactAttributeDataType[]).map((dataType) => (
                    <SelectItem key={dataType} value={dataType}>
                      {t(DATA_TYPE_LABEL_KEYS[dataType])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                {editing
                  ? t("workspace.contacts.data_type_cannot_be_changed")
                  : t("workspace.contacts.data_type_description")}
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setEditing(null);
              }}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              loading={isSaving}
              disabled={!editing && keyError !== null}
              onClick={handleSave}>
              {editing ? t("common.save") : t("workspace.contacts.create_attribute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={isDeleteOpen}
        setOpen={setIsDeleteOpen}
        deleteWhat={t("common.attributes")}
        text={t("workspace.contacts.delete_attribute_confirmation", { value: selected.size })}
        isDeleting={isDeleting}
        onDelete={handleDelete}
      />
    </div>
  );
};
