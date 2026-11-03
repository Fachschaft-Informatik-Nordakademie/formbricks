import { describe, expect, test, vi } from "vitest";
import {
  FSINF_FEATURES,
  getAccessControlPermission,
  getIsContactsEnabled,
  getIsMultiOrgEnabled,
  getIsQuotasEnabled,
  getIsSamlSsoEnabled,
  getIsWorkflowsEnabled,
  getOrganizationWorkspacesLimit,
} from "./index";

vi.mock("server-only", () => ({}));

describe("fsinf-ce features", () => {
  test("rebuilt features are available without any license", async () => {
    await expect(getAccessControlPermission("org")).resolves.toBe(true);
    await expect(getIsContactsEnabled("org")).resolves.toBe(true);
    await expect(getIsQuotasEnabled("org")).resolves.toBe(true);
    await expect(getIsWorkflowsEnabled("org")).resolves.toBe(true);
  });

  test("features without an AGPL implementation stay off", async () => {
    await expect(getIsSamlSsoEnabled()).resolves.toBe(false);
    await expect(getIsMultiOrgEnabled()).resolves.toBe(false);
    expect(FSINF_FEATURES.whitelabel).toBe(false);
  });

  test("workspace count is not limited", async () => {
    const limit = await getOrganizationWorkspacesLimit("org");
    expect(limit).toBe(Number.POSITIVE_INFINITY);
    expect(1000 >= limit).toBe(false);
  });
});
