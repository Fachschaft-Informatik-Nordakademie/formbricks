import { describe, expect, test } from "vitest";
import { ZWorkflowExecutableDefinition } from "@formbricks/workflows";
import {
  addSendEmailStep,
  createDefaultSendEmailConfig,
  createEmptyDefinition,
  setResponseCompletedTrigger,
} from "./definition";
import { describeWorkflowProblem, describeWorkflowProblems } from "./problems";

const SURVEY_ID = "clsurvey00000000000000001";

const toProblems = (definition: Parameters<typeof ZWorkflowExecutableDefinition.safeParse>[0]) => {
  const result = ZWorkflowExecutableDefinition.safeParse(definition);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    code: "definition_not_executable" as const,
    field: issue.path.map(String).join(".") || "definition",
    message: issue.message,
  }));
};

describe("describeWorkflowProblems", () => {
  test("a draft without trigger reports the missing trigger", () => {
    const definition = createEmptyDefinition();
    const described = describeWorkflowProblems(toProblems(definition), definition);
    expect(described.map((problem) => problem.messageKey)).toContain(
      "workspace.workflows.validation_problem_trigger_missing"
    );
  });

  test("a trigger without steps asks to connect a step", () => {
    const definition = setResponseCompletedTrigger(createEmptyDefinition(), {
      surveyId: SURVEY_ID,
      endingCardIds: [],
    });
    const described = describeWorkflowProblems(toProblems(definition), definition);
    expect(described).toEqual([
      { messageKey: "workspace.workflows.validation_problem_trigger_not_connected", nodeId: "trigger" },
    ]);
  });

  test("blank email fields map to one incomplete-step problem on that step", () => {
    const definition = addSendEmailStep(
      setResponseCompletedTrigger(createEmptyDefinition(), { surveyId: SURVEY_ID, endingCardIds: [] }),
      { id: "mail", config: createDefaultSendEmailConfig("noreply@example.com") }
    );
    const described = describeWorkflowProblems(toProblems(definition), definition);
    expect(described).toEqual([
      { messageKey: "workspace.workflows.validation_problem_step_incomplete", nodeId: "mail" },
    ]);
  });

  test("reference problems map to trigger and recipient messages", () => {
    const definition = createEmptyDefinition();
    expect(
      describeWorkflowProblem(
        { code: "survey_not_found", field: "definition.trigger.config.surveyId", message: "" },
        definition
      )
    ).toEqual({
      messageKey: "workspace.workflows.validation_problem_trigger_survey_unbound",
      nodeId: "trigger",
    });
    expect(
      describeWorkflowProblem(
        { code: "ending_card_not_found", field: "definition.trigger.config.endingCardIds", message: "" },
        definition
      ).messageKey
    ).toBe("workspace.workflows.validation_problem_trigger_ending_not_found");
    expect(
      describeWorkflowProblem(
        { code: "recipient_not_allowed", field: "definition.nodes.config.to", message: "" },
        definition
      ).messageKey
    ).toBe("workspace.workflows.email_to_unavailable_warning");
  });

  test("unknown paths fall back to the generic message", () => {
    expect(
      describeWorkflowProblem(
        { code: "definition_not_executable", field: "schemaVersion", message: "" },
        createEmptyDefinition()
      ).messageKey
    ).toBe("workspace.workflows.validation_problem_generic");
  });
});
