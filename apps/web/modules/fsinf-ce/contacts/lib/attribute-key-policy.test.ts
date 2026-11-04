import { describe, expect, test } from "vitest";
import {
  formatReservedFutureDefaultAttributeKeys,
  getReservedFutureDefaultAttributeKeyIssue,
  isReservedFutureDefaultAttributeKey,
} from "./attribute-key-policy";

describe("attribute key policy", () => {
  test("reserves the snake_case spellings of the default keys", () => {
    expect(isReservedFutureDefaultAttributeKey("user_id")).toBe(true);
    expect(isReservedFutureDefaultAttributeKey("first_name")).toBe(true);
    expect(isReservedFutureDefaultAttributeKey("last_name")).toBe(true);
    expect(isReservedFutureDefaultAttributeKey(" USER_ID ")).toBe(true);
  });

  test("does not reserve current defaults or ordinary custom keys", () => {
    expect(isReservedFutureDefaultAttributeKey("userId")).toBe(false);
    expect(isReservedFutureDefaultAttributeKey("email")).toBe(false);
    expect(isReservedFutureDefaultAttributeKey("group_vorstand")).toBe(false);
  });

  test("formats the issue message used by the management API", () => {
    expect(getReservedFutureDefaultAttributeKeyIssue(["user_id"])).toBe(
      "Reserved attribute key(s): user_id. These keys are reserved for the v5.1 safe-identifier default attribute migration and cannot be created as custom attributes."
    );
    expect(formatReservedFutureDefaultAttributeKeys()).toBe("user_id, first_name, last_name");
  });
});
