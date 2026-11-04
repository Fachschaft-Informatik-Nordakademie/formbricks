import { describe, expect, test } from "vitest";
import {
  type TWorkflowDefinition,
  ZWorkflowDefinition,
  ZWorkflowExecutableDefinition,
  planExecutableSteps,
} from "@formbricks/workflows";
import {
  addSendEmailStep,
  createDefaultSendEmailConfig,
  createEmptyDefinition,
  getOrderedNodes,
  hasBranchNodes,
  moveNode,
  removeNode,
  setResponseCompletedTrigger,
  updateSendEmailConfig,
} from "./definition";

const SURVEY_ID = "clsurvey00000000000000001";

const filledEmail = (to: string) => ({
  ...createDefaultSendEmailConfig("noreply@example.com"),
  to,
  subject: "Thanks",
  body: "<p>Hello</p>",
});

const buildThreeSteps = (): TWorkflowDefinition => {
  let definition = setResponseCompletedTrigger(createEmptyDefinition(), {
    surveyId: SURVEY_ID,
    endingCardIds: [],
  });
  definition = addSendEmailStep(definition, { id: "a", config: filledEmail("a@example.com") });
  definition = addSendEmailStep(definition, { id: "b", config: filledEmail("b@example.com") });
  definition = addSendEmailStep(definition, { id: "c", config: filledEmail("c@example.com") });
  return definition;
};

const order = (definition: TWorkflowDefinition) => getOrderedNodes(definition).map((node) => node.id);

describe("workflow definition editing", () => {
  test("an empty draft is a valid persisted definition", () => {
    expect(ZWorkflowDefinition.safeParse(createEmptyDefinition()).success).toBe(true);
  });

  test("a trigger plus steps forms an executable linear chain", () => {
    const definition = buildThreeSteps();
    expect(order(definition)).toEqual(["a", "b", "c"]);

    const executable = ZWorkflowExecutableDefinition.parse(definition);
    expect(planExecutableSteps(executable).map((step) => step.stepId)).toEqual(["a", "b", "c"]);
  });

  test("steps added before a trigger are chained once the trigger is set", () => {
    let definition = addSendEmailStep(createEmptyDefinition(), { id: "a", config: filledEmail("a@x.org") });
    expect(definition.edges).toEqual([]);
    expect(ZWorkflowDefinition.safeParse(definition).success).toBe(true);

    definition = setResponseCompletedTrigger(definition, { surveyId: SURVEY_ID, endingCardIds: [] });
    expect(ZWorkflowExecutableDefinition.safeParse(definition).success).toBe(true);
  });

  test("changing the trigger config keeps the chain", () => {
    const definition = setResponseCompletedTrigger(buildThreeSteps(), {
      surveyId: SURVEY_ID,
      endingCardIds: ["clending000000000000000001"],
    });
    expect(order(definition)).toEqual(["a", "b", "c"]);
    expect(definition.trigger?.config.endingCardIds).toEqual(["clending000000000000000001"]);
  });

  test("removing a middle step relinks its neighbours", () => {
    const definition = removeNode(buildThreeSteps(), "b");
    expect(order(definition)).toEqual(["a", "c"]);
    expect(ZWorkflowExecutableDefinition.safeParse(definition).success).toBe(true);
  });

  test("moving steps reorders the chain and ignores out-of-range moves", () => {
    const moved = moveNode(buildThreeSteps(), "c", "up");
    expect(order(moved)).toEqual(["a", "c", "b"]);
    expect(ZWorkflowExecutableDefinition.safeParse(moved).success).toBe(true);

    const unchanged = moveNode(moved, "a", "up");
    expect(order(unchanged)).toEqual(["a", "c", "b"]);
  });

  test("config updates only touch the targeted step", () => {
    const definition = updateSendEmailConfig(buildThreeSteps(), "b", { subject: "Changed" });
    const nodes = getOrderedNodes(definition);
    expect(nodes.map((node) => (node.type === "action" ? node.config.subject : null))).toEqual([
      "Thanks",
      "Changed",
      "Thanks",
    ]);
  });

  test("unreachable stored nodes are still listed after the chain", () => {
    const definition = buildThreeSteps();
    const detached = { ...definition, edges: definition.edges.filter((edge) => edge.target !== "c") };
    expect(order(detached)).toEqual(["a", "b", "c"]);
  });

  test("definitions with branch nodes keep their stored edges", () => {
    const base = buildThreeSteps();
    const withBranch: TWorkflowDefinition = {
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: "branch",
          type: "if_else",
          config: {
            condition: {
              id: "g",
              connector: "and",
              conditions: [{ id: "c1", left: { path: "response.x" }, operator: "exists" }],
            },
          },
        },
      ],
    };
    expect(hasBranchNodes(withBranch)).toBe(true);
    const moved = moveNode(withBranch, "a", "down");
    expect(moved.edges).toEqual(withBranch.edges);

    const cleaned = removeNode(withBranch, "branch");
    expect(hasBranchNodes(cleaned)).toBe(false);
    expect(ZWorkflowExecutableDefinition.safeParse(cleaned).success).toBe(true);
  });
});
