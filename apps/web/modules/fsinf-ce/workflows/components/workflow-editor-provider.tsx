"use client";

import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TWorkflowDefinition, TWorkflowResource, TWorkflowTestResult } from "@formbricks/workflows";
import { getV3ApiErrorMessage } from "@/modules/api/lib/v3-client";
import { getWorkflow, patchWorkflow, testWorkflow } from "@/modules/fsinf-ce/workflows/lib/client/api";
import { workflowKeys } from "@/modules/fsinf-ce/workflows/lib/client/query-keys";

/**
 * FSINF CE: shared state of one workflow's detail pages (title, header CTA, builder).
 *
 * Server data lives in the TanStack Query cache (`workflowKeys.detail`). The only local state is the
 * not-yet-saved definition draft: edits are autosaved (debounced PATCH), and `flush()` lets the enable
 * action wait for the latest edit to be persisted before publishing.
 */

export type TWorkflowSaveState = "idle" | "saving" | "saved" | "failed";

interface TWorkflowEditorContext {
  workflowId: string;
  workflowQuery: UseQueryResult<TWorkflowResource>;
  workflow: TWorkflowResource | undefined;
  /** The definition the editor shows: the unsaved draft, else the saved one. */
  definition: TWorkflowDefinition | undefined;
  updateDefinition: (update: (definition: TWorkflowDefinition) => TWorkflowDefinition) => void;
  hasUnsavedChanges: boolean;
  saveState: TWorkflowSaveState;
  saveError: string | null;
  /** Persists pending edits now; resolves false when they could not be saved. */
  flush: () => Promise<boolean>;
  testQuery: UseQueryResult<TWorkflowTestResult>;
}

const WorkflowEditorContext = createContext<TWorkflowEditorContext | null>(null);

const AUTOSAVE_DELAY_MS = 800;

export const WorkflowEditorProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const params = useParams<{ workflowId: string }>();
  const workflowId = params.workflowId;
  const queryClient = useQueryClient();

  const workflowQuery = useQuery({
    queryKey: workflowKeys.detail(workflowId),
    queryFn: ({ signal }) => getWorkflow(workflowId, signal),
    enabled: !!workflowId,
  });
  const workflow = workflowQuery.data;

  const testQuery = useQuery({
    queryKey: workflowKeys.test(workflowId),
    queryFn: () => testWorkflow(workflowId),
    enabled: !!workflow && workflow.status !== "archived",
  });

  const [draft, setDraft] = useState<TWorkflowDefinition | null>(null);
  const draftRef = useRef<TWorkflowDefinition | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const [saveState, setSaveState] = useState<TWorkflowSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) {
      await savePromiseRef.current;
    }

    const toSave = draftRef.current;
    if (!toSave) {
      return true;
    }

    setSaveState("saving");
    const promise = (async () => {
      try {
        const updated = await patchWorkflow(workflowId, { definition: toSave });
        queryClient.setQueryData(workflowKeys.detail(workflowId), updated);
        if (draftRef.current === toSave) {
          draftRef.current = null;
          setDraft(null);
        }
        setSaveError(null);
        setSaveState(draftRef.current ? "saving" : "saved");
        await queryClient.invalidateQueries({ queryKey: workflowKeys.test(workflowId) });
        await queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
        return true;
      } catch (error) {
        setSaveError(getV3ApiErrorMessage(error, ""));
        setSaveState("failed");
        return false;
      } finally {
        savePromiseRef.current = null;
      }
    })();

    savePromiseRef.current = promise;
    return promise;
  }, [queryClient, workflowId]);

  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      void saveDraft();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, saveDraft]);

  // Warn before leaving the page with edits that are not persisted yet.
  useEffect(() => {
    if (!draft && saveState !== "saving") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft, saveState]);

  const updateDefinition = useCallback(
    (update: (definition: TWorkflowDefinition) => TWorkflowDefinition) => {
      const base =
        draftRef.current ??
        queryClient.getQueryData<TWorkflowResource>(workflowKeys.detail(workflowId))?.definition;
      if (!base) return;
      const next = update(base);
      draftRef.current = next;
      setDraft(next);
    },
    [queryClient, workflowId]
  );

  const value = useMemo<TWorkflowEditorContext>(
    () => ({
      workflowId,
      workflowQuery,
      workflow,
      definition: draft ?? workflow?.definition,
      updateDefinition,
      hasUnsavedChanges: draft !== null,
      saveState,
      saveError,
      flush: saveDraft,
      testQuery,
    }),
    [workflowId, workflowQuery, workflow, draft, updateDefinition, saveState, saveError, saveDraft, testQuery]
  );

  return <WorkflowEditorContext.Provider value={value}>{children}</WorkflowEditorContext.Provider>;
};

export const useWorkflowEditor = (): TWorkflowEditorContext => {
  const context = useContext(WorkflowEditorContext);
  if (!context) {
    throw new Error("useWorkflowEditor must be used within a WorkflowEditorProvider");
  }
  return context;
};
