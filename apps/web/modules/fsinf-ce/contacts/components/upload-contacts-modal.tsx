"use client";

/**
 * FSINF CE: CSV import dialog for contacts (file → column mapping → duplicate handling → upload).
 */
import { UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TContactAttributeKey } from "@formbricks/types/contact-attribute-key";
import { getFormattedErrorMessage } from "@/lib/utils/helper";
import { Button } from "@/modules/ui/components/button";
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
import { importContactsAction } from "../actions";
import { formatReservedFutureDefaultAttributeKeys } from "../lib/attribute-key-policy";
import {
  MAX_CSV_FILE_BYTES,
  type TColumnMapping,
  buildImportRows,
  buildInitialMapping,
  countRowsWithoutIdentity,
  findTypeMismatches,
  validateMapping,
} from "../lib/csv-mapping";

interface UploadContactsModalProps {
  workspaceId: string;
  attributeKeys: TContactAttributeKey[];
}

type TDuplicateAction = "skip" | "update" | "overwrite";

const EXAMPLE_CSV = "email,userId,firstName,lastName\njane.doe@example.org,jane,Jane,Doe\n";

export const UploadContactsModal = ({ workspaceId, attributeKeys }: Readonly<UploadContactsModalProps>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<TColumnMapping>({});
  const [duplicateAction, setDuplicateAction] = useState<TDuplicateAction>("skip");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const reset = () => {
    setRows([]);
    setColumns([]);
    setMapping({});
    setError(null);
    setDuplicateAction("skip");
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError(t("workspace.contacts.upload_contacts_error_invalid_file_type"));
      return;
    }
    if (file.size > MAX_CSV_FILE_BYTES) {
      setError(t("workspace.contacts.upload_contacts_error_file_too_large"));
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const fields = (result.meta.fields ?? []).filter((field) => field.trim() !== "");
        if (fields.length === 0 || result.data.length === 0) {
          setError(t("workspace.contacts.upload_contacts_error_no_valid_contacts"));
          return;
        }
        setColumns(fields);
        setRows(result.data);
        setMapping(buildInitialMapping(fields, attributeKeys));
      },
      error: () => setError(t("common.failed_to_parse_csv")),
    });
  };

  const getMappingErrors = (): string[] => {
    const messages: string[] = [];
    for (const issue of validateMapping(mapping, attributeKeys)) {
      if (issue.type === "duplicate") {
        messages.push(
          t("workspace.contacts.upload_contacts_error_duplicate_mappings", {
            attributes: issue.keys.join(", "),
          })
        );
      } else if (issue.type === "invalid_name") {
        messages.push(t("workspace.contacts.invalid_csv_column_names", { columns: issue.keys.join(", ") }));
      } else if (issue.type === "reserved") {
        messages.push(
          t("workspace.contacts.invalid_csv_reserved_column_names", {
            columns: issue.keys.join(", "),
            reservedKeys: formatReservedFutureDefaultAttributeKeys(),
          })
        );
      } else {
        messages.push(t("workspace.contacts.upload_contacts_error_no_valid_contacts"));
      }
    }
    const importRows = buildImportRows(rows, mapping);
    for (const mismatch of findTypeMismatches(importRows, attributeKeys)) {
      messages.push(
        t("workspace.contacts.upload_contacts_error_attribute_type_mismatch", {
          key: mismatch.key,
          dataType: mismatch.dataType,
          values: mismatch.values.join(", "),
        })
      );
    }
    return messages;
  };

  const mappingErrors = rows.length > 0 ? getMappingErrors() : [];
  const importRows = rows.length > 0 ? buildImportRows(rows, mapping) : [];
  const rowsWithoutIdentity = countRowsWithoutIdentity(importRows);

  const handleUpload = async () => {
    setIsUploading(true);
    const result = await importContactsAction({
      workspaceId,
      rows: importRows.filter((row) => row.email || row.userId),
      duplicateAction,
    });
    setIsUploading(false);
    if (!result?.data) {
      setError(getFormattedErrorMessage(result) || t("workspace.contacts.upload_contacts_error_generic"));
      return;
    }
    if (result.data.errors.length > 0) {
      toast.error(result.data.errors.slice(0, 3).join("\n"), { duration: 8000 });
    }
    toast.success(t("workspace.contacts.upload_contacts_success"));
    setOpen(false);
    reset();
    router.refresh();
  };

  const downloadExample = () => {
    const url = URL.createObjectURL(new Blob([EXAMPLE_CSV], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "contacts-example.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const duplicateOptions: { id: TDuplicateAction; title: string; description: string }[] = [
    {
      id: "skip",
      title: t("workspace.contacts.upload_contacts_modal_duplicates_skip_title"),
      description: t("workspace.contacts.upload_contacts_modal_duplicates_skip_description"),
    },
    {
      id: "update",
      title: t("workspace.contacts.upload_contacts_modal_duplicates_update_title"),
      description: t("workspace.contacts.upload_contacts_modal_duplicates_update_description"),
    },
    {
      id: "overwrite",
      title: t("workspace.contacts.upload_contacts_modal_duplicates_overwrite_title"),
      description: t("workspace.contacts.upload_contacts_modal_duplicates_overwrite_description"),
    },
  ];

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UploadIcon />
        {t("workspace.contacts.upload_contacts_modal_upload_btn")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}>
        <DialogContent width="wide">
          <DialogHeader>
            <DialogTitle>{t("workspace.contacts.upload_contacts_modal_upload_btn")}</DialogTitle>
            <DialogDescription>{t("workspace.contacts.upload_contacts_modal_description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {rows.length === 0 ? (
              <div className="space-y-3">
                <Input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
                <Button type="button" variant="link" size="sm" onClick={downloadExample}>
                  {t("workspace.contacts.upload_contacts_modal_download_example_csv")}
                </Button>
              </div>
            ) : (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("workspace.contacts.upload_contacts_modal_attributes_title")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("workspace.contacts.upload_contacts_modal_attributes_description")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-500">
                    <span>{t("workspace.contacts.upload_contacts_modal_csv_column_header")}</span>
                    <span>{t("workspace.contacts.upload_contacts_modal_attribute_header")}</span>
                  </div>
                  {columns.map((column) => (
                    <div key={column} className="grid grid-cols-2 items-center gap-2">
                      <span className="ph-no-capture truncate rounded-md bg-slate-100 px-2 py-1.5 text-sm">
                        {column}
                      </span>
                      <Input
                        list="contact-attribute-keys"
                        aria-label={t("workspace.contacts.upload_contacts_modal_attribute_header")}
                        value={mapping[column] ?? ""}
                        placeholder={t("workspace.contacts.upload_contacts_modal_attributes_search_or_add")}
                        onChange={(event) =>
                          setMapping((current) => ({ ...current, [column]: event.target.value.trim() }))
                        }
                      />
                    </div>
                  ))}
                  <datalist id="contact-attribute-keys">
                    {attributeKeys.map((attributeKey) => (
                      <option key={attributeKey.id} value={attributeKey.key} />
                    ))}
                  </datalist>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("workspace.contacts.upload_contacts_modal_duplicates_title")}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t("workspace.contacts.upload_contacts_modal_duplicates_description")}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {duplicateOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer flex-col gap-1 rounded-md border border-slate-200 p-3 has-[:checked]:border-slate-900">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="radio"
                            name="duplicate-action"
                            checked={duplicateAction === option.id}
                            onChange={() => setDuplicateAction(option.id)}
                          />
                          {option.title}
                        </span>
                        <span className="text-xs text-slate-500">{option.description}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("workspace.contacts.upload_contacts_modal_preview")}
                  </h3>
                  <div className="ph-no-capture overflow-x-auto rounded-md border border-slate-200 text-xs">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          {columns.map((column) => (
                            <th key={column} className="px-2 py-1 text-left font-medium">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 3).map((row, index) => (
                          <tr key={index} className="border-t border-slate-100">
                            {columns.map((column) => (
                              <td key={column} className="px-2 py-1">
                                {row[column]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500">
                    {t("common.count_contacts", { count: rows.length })}
                  </p>
                </section>
                {rowsWithoutIdentity > 0 && (
                  <p className="text-xs text-amber-700">
                    {rowsWithoutIdentity} × {t("workspace.contacts.attributes_msg_email_or_userid_required")}
                  </p>
                )}
                {mappingErrors.map((message) => (
                  <p key={message} className="text-xs text-red-600">
                    {message}
                  </p>
                ))}
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            {rows.length > 0 && (
              <Button type="button" variant="secondary" onClick={reset}>
                {t("workspace.contacts.upload_contacts_modal_pick_different_file")}
              </Button>
            )}
            <Button
              type="button"
              loading={isUploading}
              disabled={rows.length === 0 || mappingErrors.length > 0 || rowsWithoutIdentity === rows.length}
              onClick={handleUpload}>
              {t("workspace.contacts.upload_contacts_modal_upload_btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
