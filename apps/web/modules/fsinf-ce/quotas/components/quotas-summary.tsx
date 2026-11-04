"use client";

import { useTranslation } from "react-i18next";
import { TSurveySummary } from "@formbricks/types/surveys/types";
import { ProgressBar } from "@/modules/ui/components/progress-bar";

/**
 * FSINF CE: "Quotas" tab of the survey summary — one row per quota with its screened-in count, limit and
 * fill level. Counts come from `getQuotasSummary` (screened-in links), the same number the evaluation
 * compares against the limit.
 */

interface QuotasSummaryProps {
  quotas: TSurveySummary["quotas"];
}

export const QuotasSummary = ({ quotas }: Readonly<QuotasSummaryProps>) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="grid min-h-10 grid-cols-6 items-center rounded-t-xl border-b border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
        <div className="col-span-2 px-4 md:px-6">{t("common.quota")}</div>
        <div className="col-span-2 px-4 md:px-6">{t("common.progress")}</div>
        <div className="px-4 text-right md:px-6">{t("workspace.surveys.summary.current_count")}</div>
        <div className="px-4 text-right md:px-6">{t("workspace.surveys.summary.limit")}</div>
      </div>

      {quotas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 md:px-6">{t("common.no_quotas_found")}</p>
      ) : (
        quotas.map((quota) => {
          const isFull = quota.count >= quota.limit;
          return (
            <div
              key={quota.id}
              className="grid grid-cols-6 items-center border-b border-slate-100 text-xs text-slate-800 last:border-b-0 md:text-sm">
              <div className="col-span-2 truncate px-4 py-3 font-medium md:px-6" title={quota.name}>
                {quota.name}
              </div>
              <div className="col-span-2 flex items-center gap-3 px-4 py-3 md:px-6">
                <ProgressBar
                  progress={quota.limit > 0 ? quota.count / quota.limit : 1}
                  barColor={isFull ? "bg-slate-700" : "bg-brand-dark"}
                  height={2}
                />
                <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-600">
                  {Math.round(quota.percentage)}%
                </span>
              </div>
              <div className="px-4 py-3 text-right font-mono font-medium md:px-6">{quota.count}</div>
              <div className="px-4 py-3 text-right font-mono font-medium md:px-6">{quota.limit}</div>
            </div>
          );
        })
      )}
    </div>
  );
};
