"use client";

/**
 * FSINF CE: contacts list with search, "load more" pagination and bulk delete.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TUserLocale } from "@formbricks/types/user";
import { formatDate } from "@/lib/time";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { Button } from "@/modules/ui/components/button";
import { DeleteDialog } from "@/modules/ui/components/delete-dialog";
import { SearchBar } from "@/modules/ui/components/search-bar";
import { deleteContactsAction, getContactsAction } from "../actions";
import type { TContactListItem } from "../lib/contacts";

interface ContactsTableProps {
  workspaceId: string;
  initialContacts: TContactListItem[];
  pageSize: number;
  isReadOnly: boolean;
}

export const getContactDisplayName = (contact: Pick<TContactListItem, "id" | "attributes">): string =>
  contact.attributes.email || contact.attributes.userId || contact.id;

export const ContactsTable = ({
  workspaceId,
  initialContacts,
  pageSize,
  isReadOnly,
}: Readonly<ContactsTableProps>) => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = (i18n.resolvedLanguage ?? "en-US") as TUserLocale;
  const [contacts, setContacts] = useState(initialContacts);
  const [hasMore, setHasMore] = useState(initialContacts.length >= pageSize);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const requestId = useRef(0);
  const isFirstRun = useRef(true);

  // Debounced server-side search; the request counter drops answers of outdated queries.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const current = ++requestId.current;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const result = await getContactsAction({ workspaceId, offset: 0, searchValue: search });
      if (current !== requestId.current) return;
      setIsLoading(false);
      if (!result?.data) {
        toast.error(getFormattedErrorMessage(result));
        return;
      }
      setContacts(result.data);
      setHasMore(result.data.length >= pageSize);
      setSelected(new Set());
    }, 300);
    return () => clearTimeout(timer);
  }, [search, workspaceId, pageSize]);

  const loadMore = async () => {
    setIsLoading(true);
    const result = await getContactsAction({ workspaceId, offset: contacts.length, searchValue: search });
    setIsLoading(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    const known = new Set(contacts.map((contact) => contact.id));
    setContacts([...contacts, ...result.data.filter((contact) => !known.has(contact.id))]);
    setHasMore(result.data.length >= pageSize);
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteContactsAction({ workspaceId, contactIds: [...selected] });
    setIsDeleting(false);
    if (!result?.data) {
      toast.error(getFormattedErrorMessage(result));
      return;
    }
    toast.success(t("common.table_items_deleted_successfully", { type: t("common.contact") }));
    setContacts((current) => current.filter((contact) => !selected.has(contact.id)));
    setSelected(new Set());
    setIsDeleteOpen(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t("workspace.contacts.search_contact")}
          className="w-full max-w-sm"
        />
        {!isReadOnly && selected.size > 0 && (
          <Button type="button" variant="destructive" size="sm" onClick={() => setIsDeleteOpen(true)}>
            {t("common.delete")} ({selected.size})
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-900">
            <tr>
              {!isReadOnly && <th className="w-10 px-4 py-3" />}
              <th className="px-4 py-3 font-semibold">{t("common.email")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.user_id")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.name")}</th>
              <th className="px-4 py-3 font-semibold">{t("common.created_at")}</th>
            </tr>
          </thead>
          <tbody className="ph-no-capture">
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                onClick={() => router.push(`/workspaces/${workspaceId}/contacts/${contact.id}`)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                {!isReadOnly && (
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={getContactDisplayName(contact)}
                      checked={selected.has(contact.id)}
                      onChange={() => toggle(contact.id)}
                    />
                  </td>
                )}
                <td className="px-4 py-3">{contact.attributes.email ?? ""}</td>
                <td className="px-4 py-3">{contact.attributes.userId ?? ""}</td>
                <td className="px-4 py-3">
                  {[contact.attributes.firstName, contact.attributes.lastName].filter(Boolean).join(" ")}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(new Date(contact.createdAt), locale)}
                </td>
              </tr>
            ))}
            {contacts.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {t("workspace.contacts.no_responses_found")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" loading={isLoading} onClick={loadMore}>
            {t("common.load_more")}
          </Button>
        </div>
      )}

      <DeleteDialog
        open={isDeleteOpen}
        setOpen={setIsDeleteOpen}
        deleteWhat={t("common.contacts")}
        text={t("workspace.contacts.delete_contact_confirmation")}
        isDeleting={isDeleting}
        onDelete={handleDelete}
      />
    </div>
  );
};
