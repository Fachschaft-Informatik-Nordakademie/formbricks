import { describe, expect, test } from "vitest";
import { getBillingFallbackPath } from "./navigation";

describe("getBillingFallbackPath", () => {
  // FSINF CE: no billing or enterprise-license page exists in this build, so billing-role members land
  // on the general organization settings in every mode.
  test.each([true, false])("returns the general org settings path (cloud=%s)", (isCloud) => {
    expect(getBillingFallbackPath("org_123", isCloud)).toBe("/organizations/org_123/settings/general");
  });
});
