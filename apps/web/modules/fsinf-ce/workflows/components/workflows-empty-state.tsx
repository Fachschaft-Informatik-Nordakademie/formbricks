import { WorkflowIcon } from "lucide-react";

/** FSINF CE: empty / no-results block of the workflows list and run tables. */
export const WorkflowsEmptyState = ({
  title,
  description,
}: Readonly<{ title: string; description?: string }>) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
    <WorkflowIcon className="size-6 text-slate-400" aria-hidden="true" />
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
  </div>
);
