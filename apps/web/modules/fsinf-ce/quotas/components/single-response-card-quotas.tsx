"use client";

import { useTranslation } from "react-i18next";
import { TResponseWithQuotas } from "@formbricks/types/responses";

/**
 * FSINF CE: quotas a response counts towards (its screened-in quota links), shown in the single response
 * card. The response services only load screened-in links into `quotas`, so this lists exactly the
 * quotas whose limit this response occupies; renders nothing when there are none.
 */

interface ResponseCardQuotasProps {
  quotas?: TResponseWithQuotas["quotas"];
}

export const ResponseCardQuotas = ({ quotas }: Readonly<ResponseCardQuotasProps>) => {
  const { t } = useTranslation();

  if (!quotas || quotas.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <p className="text-sm text-slate-500">{t("common.quotas")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {quotas.map((quota) => (
          <span
            key={quota.id}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {quota.name}
          </span>
        ))}
      </div>
    </div>
  );
};
