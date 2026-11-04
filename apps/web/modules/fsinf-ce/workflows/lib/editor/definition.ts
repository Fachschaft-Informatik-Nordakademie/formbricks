import {
  type TResponseCompletedTriggerConfig,
  type TWorkflowChildNode,
  type TWorkflowDefinition,
  type TWorkflowEdge,
  type TWorkflowSendEmailActionConfig,
  type TWorkflowSendEmailActionNode,
  WORKFLOW_ACTIONS,
  WORKFLOW_SCHEMA_VERSION,
  WORKFLOW_TRIGGERS,
} from "@formbricks/workflows";

/**
 * FSINF CE: pure editing operations of the workflow builder.
 *
 * The builder edits a workflow as an ordered step list (trigger → step 1 → step 2 …) instead of a
 * free canvas; every structural operation rewrites the edges as that single chain, which is exactly
 * the graph shape the runner executes. `if_else` nodes exist in the schema but are not executable and
 * cannot be authored here; a definition that contains one (created through the API) keeps its edges
 * untouched until those nodes are removed — see `hasBranchNodes`.
 */

export const TRIGGER_NODE_ID = "trigger";

export const createEmptyDefinition = (): TWorkflowDefinition => ({
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  trigger: null,
  nodes: [],
  edges: [],
  entryNodeId: null,
});

export const hasBranchNodes = (definition: TWorkflowDefinition): boolean =>
  definition.nodes.some((node) => node.type === "if_else");

/**
 * Nodes in run order: the chain reachable from the trigger first, then every node the chain does not
 * reach (in stored order) so nothing an API client stored is hidden from the author.
 */
export const getOrderedNodes = (definition: TWorkflowDefinition): TWorkflowChildNode[] => {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const ordered: TWorkflowChildNode[] = [];
  const seen = new Set<string>();

  let currentId: string | undefined = definition.trigger?.id;
  while (currentId) {
    const next = definition.edges.find((edge) => edge.source === currentId);
    const nextNode = next ? nodesById.get(next.target) : undefined;
    if (!nextNode || seen.has(nextNode.id)) break;
    ordered.push(nextNode);
    seen.add(nextNode.id);
    currentId = nextNode.id;
  }

  for (const node of definition.nodes) {
    if (!seen.has(node.id)) ordered.push(node);
  }

  return ordered;
};

const buildChainEdges = (triggerId: string | null, nodes: TWorkflowChildNode[]): TWorkflowEdge[] => {
  if (!triggerId) return [];

  const edges: TWorkflowEdge[] = [];
  let source = triggerId;
  for (const node of nodes) {
    edges.push({ id: `edge-${source}-${node.id}`, source, target: node.id });
    source = node.id;
  }
  return edges;
};

/** Rebuilds the definition from a trigger + ordered node list as a single linear chain. */
const withChain = (definition: TWorkflowDefinition, nodes: TWorkflowChildNode[]): TWorkflowDefinition => {
  if (nodes.some((node) => node.type === "if_else")) {
    // Branch nodes need then/else edges; keep the stored graph instead of corrupting it.
    return { ...definition, nodes };
  }
  return { ...definition, nodes, edges: buildChainEdges(definition.trigger?.id ?? null, nodes) };
};

export const setResponseCompletedTrigger = (
  definition: TWorkflowDefinition,
  config: TResponseCompletedTriggerConfig
): TWorkflowDefinition => {
  const triggerId = definition.trigger?.id ?? TRIGGER_NODE_ID;
  const next: TWorkflowDefinition = {
    ...definition,
    trigger: {
      ...definition.trigger,
      id: triggerId,
      type: "trigger",
      triggerType: WORKFLOW_TRIGGERS.RESPONSE_COMPLETED,
      config,
    },
    entryNodeId: triggerId,
  };
  return definition.trigger ? next : withChain(next, getOrderedNodes(definition));
};

export const createDefaultSendEmailConfig = (from: string): TWorkflowSendEmailActionConfig => ({
  to: "",
  from,
  replyTo: [],
  subject: "",
  body: "",
  attachResponseData: false,
  includeVariables: false,
  includeHiddenFields: false,
});

export const addSendEmailStep = (
  definition: TWorkflowDefinition,
  { id, config }: { id: string; config: TWorkflowSendEmailActionConfig }
): TWorkflowDefinition => {
  const node: TWorkflowSendEmailActionNode = {
    id,
    type: "action",
    actionType: WORKFLOW_ACTIONS.SEND_EMAIL,
    config,
  };
  return withChain(definition, [...getOrderedNodes(definition), node]);
};

export const removeNode = (definition: TWorkflowDefinition, nodeId: string): TWorkflowDefinition => {
  const remaining = getOrderedNodes(definition).filter((node) => node.id !== nodeId);
  const removed = {
    ...definition,
    edges: definition.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  };
  return withChain(removed, remaining);
};

export const moveNode = (
  definition: TWorkflowDefinition,
  nodeId: string,
  direction: "up" | "down"
): TWorkflowDefinition => {
  const nodes = getOrderedNodes(definition);
  const index = nodes.findIndex((node) => node.id === nodeId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= nodes.length) return definition;

  const reordered = [...nodes];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return withChain(definition, reordered);
};

export const updateSendEmailConfig = (
  definition: TWorkflowDefinition,
  nodeId: string,
  patch: Partial<TWorkflowSendEmailActionConfig>
): TWorkflowDefinition => ({
  ...definition,
  nodes: definition.nodes.map((node) =>
    node.id === nodeId && node.type === "action" ? { ...node, config: { ...node.config, ...patch } } : node
  ),
});
