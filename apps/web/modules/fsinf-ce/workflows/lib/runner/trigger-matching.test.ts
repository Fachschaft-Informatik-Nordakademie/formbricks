import { describe, expect, test } from "vitest";
import type { TWorkflowExecutableDefinition } from "@formbricks/workflows";
import { buildResponseCompletedTriggerPayload, matchesResponseCompletedTrigger } from "./trigger-matching";

const SURVEY_ID = "clsurvey00000000000000001";
const ENDING_A = "clending000000000000000001";
const ENDING_B = "clending000000000000000002";

const definition = (endingCardIds: string[] = []): TWorkflowExecutableDefinition => ({
  schemaVersion: 1,
  trigger: {
    id: "trigger",
    type: "trigger",
    triggerType: "response.completed",
    config: { surveyId: SURVEY_ID, endingCardIds },
  },
  nodes: [],
  edges: [],
  entryNodeId: "trigger",
});

const response = (
  overrides: Partial<{ surveyId: string; finished: boolean; endingId: string | null }> = {}
) => ({
  id: "clresponse0000000000000001",
  surveyId: SURVEY_ID,
  finished: true,
  endingId: ENDING_A,
  ...overrides,
});

describe("matchesResponseCompletedTrigger", () => {
  test("fires for a finished response of the trigger's survey", () => {
    expect(matchesResponseCompletedTrigger(definition(), response())).toBe(true);
  });

  test("does not fire for another survey", () => {
    expect(
      matchesResponseCompletedTrigger(definition(), response({ surveyId: "clother0000000000000000001" }))
    ).toBe(false);
  });

  test("does not fire for an unfinished response", () => {
    expect(matchesResponseCompletedTrigger(definition(), response({ finished: false }))).toBe(false);
  });

  test("empty ending list matches any ending, including none", () => {
    expect(matchesResponseCompletedTrigger(definition(), response({ endingId: null }))).toBe(true);
  });

  test("specific endings only match those endings", () => {
    expect(matchesResponseCompletedTrigger(definition([ENDING_A]), response())).toBe(true);
    expect(matchesResponseCompletedTrigger(definition([ENDING_B]), response())).toBe(false);
    expect(matchesResponseCompletedTrigger(definition([ENDING_A]), response({ endingId: null }))).toBe(false);
  });
});

describe("buildResponseCompletedTriggerPayload", () => {
  test("captures ids, ending and timestamp", () => {
    const triggeredAt = new Date("2026-11-03T10:00:00.000Z");
    expect(
      buildResponseCompletedTriggerPayload({ workspaceId: "ws", response: response(), triggeredAt })
    ).toEqual({
      type: "response.completed",
      workspaceId: "ws",
      surveyId: SURVEY_ID,
      responseId: "clresponse0000000000000001",
      endingCardId: ENDING_A,
      triggeredAt: "2026-11-03T10:00:00.000Z",
    });
  });

  test("omits the ending when the response has none", () => {
    const payload = buildResponseCompletedTriggerPayload({
      workspaceId: "ws",
      response: response({ endingId: null }),
      triggeredAt: new Date(),
    });
    expect(payload).not.toHaveProperty("endingCardId");
  });
});
