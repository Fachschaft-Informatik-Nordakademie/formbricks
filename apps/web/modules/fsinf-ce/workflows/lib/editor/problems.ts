import type { TWorkflowDefinition, TWorkflowTestProblem } from "@formbricks/workflows";

/**
 * FSINF CE: maps the problems of `POST /api/v3/workflows/{id}/test` (zod issue paths + codes) to the
 * author-facing messages of the builder's validation panel, and to the step they belong to so the
 * builder can highlight it. Pure; unit-tested.
 */
export type TWorkflowProblemMessageKey =
  | "workspace.workflows.validation_problem_trigger_missing"
  | "workspace.workflows.validation_problem_trigger_not_connected"
  | "workspace.workflows.validation_problem_flow_invalid"
  | "workspace.workflows.validation_problem_step_incomplete"
  | "workspace.workflows.validation_problem_step_not_executable"
  | "workspace.workflows.validation_problem_trigger_survey_unbound"
  | "workspace.workflows.validation_problem_trigger_ending_not_found"
  | "workspace.workflows.email_to_unavailable_warning"
  | "workspace.workflows.validation_problem_generic";

export interface TDescribedWorkflowProblem {
  messageKey: TWorkflowProblemMessageKey;
  /** Child node the problem belongs to, or "trigger"; undefined for whole-workflow problems. */
  nodeId?: string;
}

const NODE_PATH = /^nodes\.(\d+)(?:\.(.+))?$/;

const describeDefinitionProblem = (
  field: string,
  definition: TWorkflowDefinition
): TDescribedWorkflowProblem => {
  if (field === "trigger" || field.startsWith("trigger.") || field === "entryNodeId") {
    return {
      messageKey: definition.trigger
        ? "workspace.workflows.validation_problem_generic"
        : "workspace.workflows.validation_problem_trigger_missing",
      nodeId: "trigger",
    };
  }

  if (field === "edges" || field.startsWith("edges.")) {
    const hasTriggerEdge =
      !!definition.trigger && definition.edges.some((edge) => edge.source === definition.trigger?.id);
    return hasTriggerEdge
      ? { messageKey: "workspace.workflows.validation_problem_flow_invalid" }
      : { messageKey: "workspace.workflows.validation_problem_trigger_not_connected", nodeId: "trigger" };
  }

  if (field === "nodes") {
    return { messageKey: "workspace.workflows.validation_problem_flow_invalid" };
  }

  const nodeMatch = NODE_PATH.exec(field);
  if (nodeMatch) {
    const nodeId = definition.nodes[Number(nodeMatch[1])]?.id;
    const rest = nodeMatch[2] ?? "";
    if (rest === "type" || rest === "actionType") {
      return { messageKey: "workspace.workflows.validation_problem_step_not_executable", nodeId };
    }
    if (rest.startsWith("config.")) {
      return { messageKey: "workspace.workflows.validation_problem_step_incomplete", nodeId };
    }
    return { messageKey: "workspace.workflows.validation_problem_generic", nodeId };
  }

  return { messageKey: "workspace.workflows.validation_problem_generic" };
};

export const describeWorkflowProblem = (
  problem: TWorkflowTestProblem,
  definition: TWorkflowDefinition
): TDescribedWorkflowProblem => {
  switch (problem.code) {
    case "survey_not_found":
      return {
        messageKey: "workspace.workflows.validation_problem_trigger_survey_unbound",
        nodeId: "trigger",
      };
    case "ending_card_not_found":
      return {
        messageKey: "workspace.workflows.validation_problem_trigger_ending_not_found",
        nodeId: "trigger",
      };
    case "recipient_not_allowed":
      return { messageKey: "workspace.workflows.email_to_unavailable_warning" };
    case "definition_not_executable":
      return describeDefinitionProblem(problem.field, definition);
  }
};

/** Describes every problem and drops duplicates (several zod issues often map to one message). */
export const describeWorkflowProblems = (
  problems: TWorkflowTestProblem[],
  definition: TWorkflowDefinition
): TDescribedWorkflowProblem[] => {
  const seen = new Set<string>();
  const described: TDescribedWorkflowProblem[] = [];
  for (const problem of problems) {
    const entry = describeWorkflowProblem(problem, definition);
    const key = `${entry.messageKey}|${entry.nodeId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    described.push(entry);
  }
  return described;
};
