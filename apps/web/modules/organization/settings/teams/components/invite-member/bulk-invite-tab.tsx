"use client";

import { ArrowUpFromLineIcon, XIcon } from "lucide-react";
import Link from "next/link";
import Papa, { type ParseResult } from "papaparse";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TOrganizationRole } from "@formbricks/types/memberships";
import { cn } from "@/lib/cn";
import type { TAuthentikDirectoryMember } from "@/modules/auth/lib/fsinf-authentik-directory";
import type { TOrganizationTeam } from "@/modules/ee/teams/team-list/types/team";
import { FsinfAuthentikMemberPicker } from "@/modules/organization/settings/teams/components/invite-member/fsinf-authentik-member-picker";
import { buildInviteesFromDirectory } from "@/modules/organization/settings/teams/components/invite-member/fsinf-directory-invitees";
import { ZInvitees } from "@/modules/organization/settings/teams/types/invites";
import { organizationSettingsPath } from "@/modules/settings/lib/routes";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { Button } from "@/modules/ui/components/button";
import { CsvTable } from "@/modules/ui/components/csv-table";
import { DialogFooter } from "@/modules/ui/components/dialog";
import { ModalButton, UpgradePrompt } from "@/modules/ui/components/upgrade-prompt";

interface BulkInviteTabProps {
  setOpen: (v: boolean) => void;
  onSubmit: (
    data: { name: string; email: string; role: TOrganizationRole; teamIds: string[] }[]
  ) => Promise<boolean>;
  teams: TOrganizationTeam[];
  organizationId: string;
  isAccessControlAllowed: boolean;
  isFormbricksCloud: boolean;
  isBulkInviteAllowed: boolean;
  enterpriseLicenseRequestFormUrl: string;
}

export type BulkCsvRow = Record<string, string | undefined>;

const PREVIEW_ROW_LIMIT = 11;

// Guards ENG-1596: a missing/misnamed CSV column yields undefined at runtime (the
// PapaParse generic is a compile-time lie), so cell access must never assume string.
// Returning "" lets ZInvitees validation reject the row and surface the CSV error
// instead of a TypeError crash that silently closes the modal.
export const readCell = (row: BulkCsvRow, ...keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
};

export const parseTeamCell = (cell: string | undefined): string[] => {
  if (!cell) return [];
  return cell
    .split(/[,|]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
};

export const BulkInviteTab = ({
  setOpen,
  onSubmit,
  teams,
  organizationId,
  isAccessControlAllowed,
  isFormbricksCloud,
  isBulkInviteAllowed,
  enterpriseLicenseRequestFormUrl,
}: Readonly<BulkInviteTabProps>) => {
  const { t } = useTranslation();
  const [csvFile, setCSVFile] = useState<File>();
  const [previewRows, setPreviewRows] = useState<BulkCsvRow[]>([]);
  const [error, setError] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  // FSINF: people picked from Authentik, the alternative to uploading a CSV.
  const [directorySelection, setDirectorySelection] = useState<TAuthentikDirectoryMember[]>([]);

  const toggleDirectoryMember = (member: TAuthentikDirectoryMember) => {
    setError("");
    setDirectorySelection((current) =>
      current.some((entry) => entry.email.toLowerCase() === member.email.toLowerCase())
        ? current.filter((entry) => entry.email.toLowerCase() !== member.email.toLowerCase())
        : [...current, member]
    );
  };

  const handleFileSelected = (file: File | undefined) => {
    if (!file) return;

    setPreviewRows([]);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError(t("common.invalid_file_type"));
      return;
    }

    setError("");
    setCSVFile(file);

    Papa.parse<BulkCsvRow>(file, {
      skipEmptyLines: true,
      header: true,
      complete: (results: ParseResult<BulkCsvRow>) => {
        // FieldMismatch (TooFewFields/TooManyFields) is non-fatal: the row still parses,
        // missing cells come back undefined and are caught by schema validation on import.
        const fatalErrors = results.errors.filter((parseError) => parseError.type !== "FieldMismatch");
        if (fatalErrors.length > 0) {
          setError(t("workspace.settings.general.please_check_csv_file"));
          setPreviewRows([]);
          return;
        }
        setPreviewRows(results.data);
      },
      error: () => {
        setError(t("workspace.settings.general.please_check_csv_file"));
        setPreviewRows([]);
      },
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelected(e.dataTransfer.files[0]);
  };

  const resetFile = () => {
    setCSVFile(undefined);
    setPreviewRows([]);
    setError("");
  };

  /** FSINF: invite everyone picked from Authentik — same submit path as the CSV import below. */
  const onInviteSelection = async () => {
    if (!directorySelection.length || !isBulkInviteAllowed || isImporting) return;

    const parsed = ZInvitees.safeParse(buildInviteesFromDirectory(directorySelection, isAccessControlAllowed));
    if (!parsed.success) {
      setError(t("workspace.settings.general.please_check_csv_file"));
      return;
    }

    setIsImporting(true);
    try {
      const success = await onSubmit(parsed.data);
      if (success) {
        setOpen(false);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const onImport = async () => {
    if (!csvFile || !previewRows.length || !isBulkInviteAllowed || isImporting) {
      return;
    }

    const teamByName = new Map(teams.map((team) => [team.name.trim().toLowerCase(), team]));
    const unknownTeamNames = new Set<string>();
    const billingRoleEmails = new Set<string>();

    const members = previewRows.map((csv) => {
      const email = readCell(csv, "Email Address", "email").trim();
      const roleCell = readCell(csv, "Organization Role", "Role", "role");
      const orgRole = isAccessControlAllowed ? roleCell.trim().toLowerCase() : "owner";
      if (!isFormbricksCloud && orgRole === "billing") {
        billingRoleEmails.add(email);
      }

      const teamsCell = readCell(csv, "Teams", "teams");
      const teamIds = isAccessControlAllowed
        ? parseTeamCell(teamsCell).reduce<string[]>((acc, teamName) => {
            const match = teamByName.get(teamName.toLowerCase());
            if (match) {
              if (!acc.includes(match.id)) {
                acc.push(match.id);
              }
            } else {
              unknownTeamNames.add(teamName);
            }
            return acc;
          }, [])
        : [];

      return {
        name: readCell(csv, "Full Name", "name").trim(),
        email,
        role: orgRole as TOrganizationRole,
        teamIds,
      };
    });

    if (unknownTeamNames.size > 0) {
      setError(
        t("workspace.settings.general.bulk_invite_unknown_teams", {
          teams: Array.from(unknownTeamNames).join(", "),
        })
      );
      return;
    }

    if (billingRoleEmails.size > 0) {
      setError(
        t("workspace.settings.general.bulk_invite_billing_not_supported", {
          emails: Array.from(billingRoleEmails).join(", "),
        })
      );
      return;
    }

    const parsed = ZInvitees.safeParse(members);
    if (!parsed.success) {
      setError(t("workspace.settings.general.please_check_csv_file"));
      return;
    }

    setIsImporting(true);
    try {
      const success = await onSubmit(parsed.data);
      if (success) {
        setOpen(false);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const previewCount = previewRows.length;
  const extraRowCount = Math.max(previewCount - PREVIEW_ROW_LIMIT, 0);

  if (!isBulkInviteAllowed) {
    const upgradeButtons: [ModalButton, ModalButton] = [
      {
        text: isFormbricksCloud ? t("common.upgrade_plan") : t("common.request_trial_license"),
        href: isFormbricksCloud
          ? organizationSettingsPath(organizationId, "billing")
          : enterpriseLicenseRequestFormUrl,
      },
      {
        text: t("common.learn_more"),
        href: "https://formbricks.com/docs/self-hosting/license",
      },
    ];

    return (
      <UpgradePrompt
        title={t("workspace.settings.teams.bulk_invite_scale_only_title")}
        description={t("workspace.settings.teams.bulk_invite_scale_only_description")}
        buttons={upgradeButtons}
        feature="bulk-invite"
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert variant="error">
            <AlertDescription className="break-words whitespace-normal">{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* FSINF: pick the people straight from Authentik instead of preparing a CSV. Hidden once a
            file is loaded, so there is always exactly one source of truth for what gets imported. */}
        {!csvFile && (
          <div className="flex flex-col gap-2">
            <FsinfAuthentikMemberPicker
              organizationId={organizationId}
              onSelect={toggleDirectoryMember}
              selectedEmails={directorySelection.map((member) => member.email)}
              keepOpenOnSelect
              label={
                directorySelection.length
                  ? `${directorySelection.length} Mitglied(er) aus Authentik gewählt`
                  : "Mitglieder aus Authentik wählen"
              }
            />
            {directorySelection.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {directorySelection.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleDirectoryMember(member)}
                    title={`${member.email} entfernen`}
                    className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pr-2 pl-3 text-xs text-slate-700 hover:bg-slate-200">
                    {member.name}
                    <XIcon className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="no-scrollbar rounded-md border-2 border-dashed border-slate-300 bg-slate-50 p-4">
            {csvFile ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <h3 className="font-medium text-slate-700">{csvFile.name}</h3>
                {previewCount > 0 ? (
                  <>
                    <div className="max-h-[300px] w-full overflow-auto rounded-md border border-slate-300">
                      <CsvTable data={previewRows.slice(0, PREVIEW_ROW_LIMIT)} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {t("workspace.settings.general.bulk_invite_rows_detected", { count: previewCount })}
                      {extraRowCount > 0
                        ? ` · ${t("workspace.settings.general.bulk_invite_rows_more", { count: extraRowCount })}`
                        : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">
                    {t("workspace.settings.general.bulk_invite_rows_detected", { count: 0 })}
                  </p>
                )}
              </div>
            ) : (
              <label
                htmlFor="bulk-invite-file"
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center rounded-lg hover:bg-slate-100"
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <ArrowUpFromLineIcon className="h-6 text-slate-500" />
                  <p className="mt-2 text-center text-sm text-slate-500">
                    <span className="font-semibold">{t("common.upload_input_description")}</span>
                  </p>
                  <input
                    type="file"
                    id="bulk-invite-file"
                    name="bulk-invite-file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleFileSelected(e.target.files?.[0])}
                  />
                </div>
              </label>
            )}
          </div>

          {csvFile ? null : (
            <div className="flex justify-start">
              <Link
                download
                href="/sample-csv/formbricks-organization-members-template.csv"
                target="_blank"
                rel="noopener noreferrer">
                <Button variant="secondary">
                  {t("workspace.settings.general.bulk_invite_download_template")}
                </Button>
              </Link>
            </div>
          )}
        </div>

        {!isAccessControlAllowed && (
          <Alert variant="default" className="mt-1.5 flex items-start bg-slate-50" role="status">
            <AlertDescription className="ml-2">
              <p className="text-sm">
                <strong>{t("common.warning")}: </strong>
                {t("workspace.settings.general.bulk_invite_warning_description")}
              </p>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <DialogFooter>
        {csvFile ? (
          <Button variant="secondary" type="button" onClick={resetFile}>
            {t("workspace.contacts.upload_contacts_modal_pick_different_file")}
          </Button>
        ) : null}
        {/* FSINF: with people picked from Authentik and no file loaded, the primary button invites the
            selection; otherwise it stays the CSV import it always was. */}
        {directorySelection.length > 0 && !csvFile ? (
          <Button onClick={() => void onInviteSelection()} disabled={isImporting} loading={isImporting}>
            {`${directorySelection.length} Mitglied(er) einladen`}
          </Button>
        ) : (
          <Button
            onClick={() => void onImport()}
            disabled={!csvFile || !previewCount || isImporting}
            loading={isImporting}>
            {t("common.import")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
};
