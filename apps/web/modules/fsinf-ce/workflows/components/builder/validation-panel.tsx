"use client";

import { AlertTriangleIcon, CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TDescribedWorkflowProblem } from "@/modules/fsinf-ce/workflows/lib/editor/problems";

/**
 * FSINF CE: validation side panel of the builder. Shows the result of the server-side dry-run check
 * (`POST /api/v3/workflows/{id}/test`, re-run after every save); each problem jumps to its step.
 */
export const ValidationPanel = ({
  isChecking,
  problems,
  checkError,
}: Readonly<{
  isChecking: boolean;
  problems: TDescribedWorkflowProblem[] | null;
  checkError: string | null;
}>) => {
  const { t } = useTranslation();

  const jumpTo = (nodeId?: string) => {
    if (!nodeId) return;
    document
      .getElementById(`workflow-node-${nodeId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          {t("workspace.workflows.validation_problems_title")}
        </h2>
        {isChecking ? <LoaderIcon className="size-4 animate-spin text-slate-400" aria-hidden="true" /> : null}
      </div>

      {checkError ? <p className="text-sm text-red-600">{checkError}</p> : null}

      {problems && problems.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2Icon className="size-4" aria-hidden="true" />
          {t("workspace.workflows.validation_status_valid")}
        </p>
      ) : null}

      {problems && problems.length > 0 ? (
        <>
          <p className="text-sm text-slate-600">
            {t("workspace.workflows.validation_problems_count", { count: problems.length })} ·{" "}
            {t("workspace.workflows.validation_problems_description")}
          </p>
          <ul className="space-y-2">
            {problems.map((problem) => {
              const message = t(problem.messageKey);
              return (
                <li key={`${problem.messageKey}-${problem.nodeId ?? ""}`}>
                  <button
                    type="button"
                    disabled={!problem.nodeId}
                    aria-label={t("workspace.workflows.validation_problem_fix_label", { problem: message })}
                    onClick={() => jumpTo(problem.nodeId)}
                    className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent">
                    <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                    {message}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </aside>
  );
};
