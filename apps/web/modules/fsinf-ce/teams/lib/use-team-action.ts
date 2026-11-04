"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { getFormattedErrorMessage } from "@/lib/utils/helper";

type TActionResult = Parameters<typeof getFormattedErrorMessage>[0] & { data?: unknown };

/**
 * FSINF CE: runs a team server action, toasts the outcome and refreshes the server-rendered page so
 * every list shows the new state. Returns whether the action succeeded.
 */
export const useTeamAction = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState(false);

  const run = async (action: () => Promise<TActionResult | undefined>, successMessage: string) => {
    setIsPending(true);
    try {
      const result = await action();
      if (!result || result.data === undefined) {
        toast.error(
          result ? getFormattedErrorMessage(result) : t("common.something_went_wrong_please_try_again")
        );
        return false;
      }
      toast.success(successMessage);
      router.refresh();
      return true;
    } catch {
      toast.error(t("common.something_went_wrong_please_try_again"));
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return { run, isPending };
};
