import { Skeleton } from "@/modules/ui/components/skeleton";

/**
 * FSINF CE: route loading skeletons of the workflows pages. They render inside the layouts (header +
 * tabs stay visible), so only the page body is sketched.
 */

const RowsSkeleton = ({ rows }: Readonly<{ rows: number }>) => (
  <div className="space-y-2">
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-14 w-full rounded-xl" />
    ))}
  </div>
);

export const WorkflowsListBodyLoading = () => (
  <div className="mt-6 space-y-4">
    <div className="flex gap-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-8 w-32" />
    </div>
    <RowsSkeleton rows={6} />
  </div>
);

export const WorkspaceWorkflowRunsBodyLoading = () => (
  <div className="mt-6 space-y-4">
    <Skeleton className="h-8 w-40" />
    <RowsSkeleton rows={8} />
  </div>
);

export const WorkflowRunsBodyLoading = WorkspaceWorkflowRunsBodyLoading;

export const WorkflowBuilderBodyLoading = () => (
  <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div className="space-y-4">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-10 w-40" />
    </div>
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
);
