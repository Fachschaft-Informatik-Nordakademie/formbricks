"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { CopyIcon, EllipsisVerticalIcon, PencilIcon, PieChartIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { TSurveyQuota, TSurveyQuotaInput } from "@formbricks/types/quota";
import { TSurvey } from "@formbricks/types/surveys/types";
import { cn } from "@/lib/cn";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import { Button } from "@/modules/ui/components/button";
import { DeleteDialog } from "@/modules/ui/components/delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/modules/ui/components/dropdown-menu";
import type { TV3QuotaBody } from "../api/operations";
import {
  createQuotaRequest,
  deleteQuotaRequest,
  listQuotas,
  quotaKeys,
  updateQuotaRequest,
} from "../lib/quotas-client";
import { QuotaModal, TQuotaModalSubmit } from "./quota-modal";

/**
 * FSINF CE: survey editor settings card for quotas.
 *
 * Quotas are saved immediately through `/api/v3/surveys/{id}/quotas` (independent of the survey's own
 * save button), listed from the TanStack Query cache with their current screened-in counts, and the
 * editor page is refreshed afterwards so the other editor parts that guard against deleting questions
 * or endings used by a quota see the new state. In this build quotas are always available, so there is
 * no upgrade/locked state.
 */

interface QuotasCardProps {
  localSurvey: TSurvey;
  isQuotasAllowed: boolean;
  isFormbricksCloud: boolean;
  quotas: TSurveyQuota[];
  hasResponses: boolean;
  enterpriseLicenseRequestFormUrl: string;
}

const toBody = (input: TSurveyQuotaInput): TV3QuotaBody => ({
  name: input.name,
  limit: input.limit,
  logic: input.logic,
  action: input.action,
  endingCardId: input.endingCardId,
  countPartialSubmissions: input.countPartialSubmissions,
});

const QuotasCardContent = ({ localSurvey, quotas, hasResponses }: Readonly<QuotasCardProps>) => {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ quota: TSurveyQuota | null; key: number } | null>(null);
  const [quotaToDelete, setQuotaToDelete] = useState<TSurveyQuota | null>(null);

  const queryKey = quotaKeys.list(localSurvey.id);
  const quotasQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => listQuotas(localSurvey.id, signal),
    enabled: open,
  });
  const listedQuotas: (TSurveyQuota & { screenedInCount?: number })[] = quotasQuery.data ?? quotas;

  const onChanged = async () => {
    await queryClient.invalidateQueries({ queryKey });
    router.refresh();
  };

  const saveMutation = useMutation({
    mutationFn: async ({ input, asNewQuota, quotaId }: TQuotaModalSubmit & { quotaId: string | null }) => {
      if (quotaId && !asNewQuota) {
        return { quota: await updateQuotaRequest(localSurvey.id, quotaId, toBody(input)), kind: "updated" };
      }
      const name = asNewQuota ? `${input.name} ${t("common.duplicate_copy")}` : input.name;
      return {
        quota: await createQuotaRequest(localSurvey.id, toBody({ ...input, name })),
        kind: asNewQuota ? "duplicated" : "created",
      };
    },
    onSuccess: async ({ kind }) => {
      const messages = {
        created: t("workspace.surveys.edit.quotas.quota_created_successfull_toast"),
        updated: t("workspace.surveys.edit.quotas.quota_updated_successfull_toast"),
        duplicated: t("workspace.surveys.edit.quotas.quota_duplicated_successfull_toast"),
      } as const;
      toast.success(messages[kind as keyof typeof messages]);
      await onChanged();
    },
    onError: (error) => {
      toast.error(getV3ApiErrorMessage(error, t("common.something_went_wrong_please_try_again")));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (quota: TSurveyQuota) =>
      createQuotaRequest(localSurvey.id, {
        ...toBody(quota),
        name: `${quota.name} ${t("common.duplicate_copy")}`,
      }),
    onSuccess: async () => {
      toast.success(t("workspace.surveys.edit.quotas.quota_duplicated_successfull_toast"));
      await onChanged();
    },
    onError: (error) => {
      toast.error(getV3ApiErrorMessage(error, t("common.something_went_wrong_please_try_again")));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (quotaId: string) => deleteQuotaRequest(localSurvey.id, quotaId),
    onSuccess: async () => {
      toast.success(t("workspace.surveys.edit.quotas.quota_deleted_successfull_toast"));
      setQuotaToDelete(null);
      await onChanged();
    },
    onError: (error) => {
      toast.error(getV3ApiErrorMessage(error, t("common.something_went_wrong_please_try_again")));
    },
  });

  const openModal = (quota: TSurveyQuota | null) => setEditing({ quota, key: Date.now() });

  const handleSubmit = async (submit: TQuotaModalSubmit): Promise<boolean> => {
    try {
      await saveMutation.mutateAsync({ ...submit, quotaId: editing?.quota?.id ?? null });
      return true;
    } catch {
      return false;
    }
  };

  const editedCount = editing?.quota
    ? listedQuotas.find((quota) => quota.id === editing.quota?.id)?.screenedInCount
    : undefined;

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={cn(
        open ? "" : "hover:bg-slate-50",
        "w-full space-y-2 rounded-lg border border-slate-300 bg-white"
      )}>
      <Collapsible.CollapsibleTrigger asChild className="h-full w-full cursor-pointer">
        <div className="inline-flex px-4 py-4">
          <div className="flex items-center pr-5 pl-2">
            <PieChartIcon
              strokeWidth={2.5}
              className={cn(
                "size-7 rounded-full border p-1.5",
                quotas.length > 0
                  ? "border-green-400 bg-green-100 text-green-500"
                  : "border-slate-300 bg-slate-100 text-slate-500"
              )}
            />
          </div>
          <div>
            <p className="font-semibold text-slate-800">{t("common.quotas")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("common.quotas_description")}</p>
          </div>
        </div>
      </Collapsible.CollapsibleTrigger>

      <Collapsible.CollapsibleContent className="flex flex-col overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <hr className="py-1 text-slate-600" />
        <div className="space-y-3 px-3 pb-3">
          {listedQuotas.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {listedQuotas.map((quota) => (
                <li key={quota.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openModal(quota)}>
                    <p className="truncate text-sm font-semibold text-slate-800">{quota.name}</p>
                    <p className="text-xs text-slate-500">
                      {quota.screenedInCount === undefined
                        ? t("workspace.surveys.edit.quotas.limited_to_x_responses", { limit: quota.limit })
                        : `${quota.screenedInCount} / ${quota.limit}`}
                      {" · "}
                      {quota.action === "endSurvey"
                        ? t("workspace.surveys.edit.quotas.end_survey_for_matching_participants")
                        : t("workspace.surveys.edit.quotas.continue_survey_normally")}
                    </p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t("common.actions")}>
                        <EllipsisVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        icon={<PencilIcon className="size-4" />}
                        onClick={() => openModal(quota)}>
                        {t("common.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        icon={<CopyIcon className="size-4" />}
                        disabled={duplicateMutation.isPending}
                        onClick={() => duplicateMutation.mutate(quota)}>
                        {t("common.duplicate")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        icon={<TrashIcon className="size-4" />}
                        onClick={() => setQuotaToDelete(quota)}>
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" variant="secondary" size="sm" onClick={() => openModal(null)}>
            <PlusIcon />
            {t("workspace.surveys.edit.quotas.add_quota")}
          </Button>
        </div>
      </Collapsible.CollapsibleContent>

      {editing && (
        <QuotaModal
          key={editing.key}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditing(null);
          }}
          localSurvey={localSurvey}
          quota={editing.quota}
          screenedInCount={editedCount}
          hasResponses={hasResponses}
          isSaving={saveMutation.isPending}
          onSubmit={handleSubmit}
        />
      )}

      <DeleteDialog
        open={quotaToDelete !== null}
        setOpen={(nextOpen) => {
          if (!nextOpen) setQuotaToDelete(null);
        }}
        deleteWhat={t("common.quota")}
        text={t("workspace.surveys.edit.quotas.delete_quota_confirmation_text", {
          quotaName: quotaToDelete?.name ?? "",
        })}
        isDeleting={deleteMutation.isPending}
        onDelete={() => {
          if (quotaToDelete) deleteMutation.mutate(quotaToDelete.id);
        }}
      />
    </Collapsible.Root>
  );
};

export const QuotasCard = (props: Readonly<QuotasCardProps>) => {
  const [queryClient] = useState(() => new QueryClient());

  // Quotas are always available in this build; the flag is still honoured for completeness.
  if (!props.isQuotasAllowed) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <QuotasCardContent {...props} />
    </QueryClientProvider>
  );
};
