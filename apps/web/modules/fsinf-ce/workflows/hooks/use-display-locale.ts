"use client";

import { useTranslation } from "react-i18next";
import { timeSince } from "@/lib/time";
import { formatDateTimeForDisplay } from "@/lib/utils/datetime";

/**
 * FSINF CE: date rendering of the workflows UI through the shared helpers, with the locale taken
 * from the app's i18n language (never the browser default).
 */
export const useWorkflowDateFormat = () => {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en-US";

  return {
    formatRelative: (iso: string) => timeSince(iso, locale),
    formatDateTime: (iso: string) => formatDateTimeForDisplay(new Date(iso), locale),
  };
};
