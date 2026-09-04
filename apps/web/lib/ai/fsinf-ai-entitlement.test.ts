import { beforeEach, describe, expect, test, vi } from "vitest";

const isAiConfigured = vi.fn(() => false);
const envMock = { AI_PROVIDER: undefined as string | undefined, AI_MODEL: undefined as string | undefined };

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/ai", () => ({ isAiConfigured }));
vi.mock("@/lib/env", () => ({ env: envMock }));

const loadEntitlement = async () => {
  vi.resetModules();
  return await import("./fsinf-ai-entitlement");
};

describe("FSINF AI entitlement", () => {
  beforeEach(() => {
    isAiConfigured.mockReset();
  });

  test("entitles the instance once an AI provider is configured", async () => {
    isAiConfigured.mockReturnValue(true);

    const { isFsinfAiEntitled } = await loadEntitlement();

    expect(isFsinfAiEntitled()).toBe(true);
    // The env object is what carries the provider config, so it has to be the thing asked.
    expect(isAiConfigured).toHaveBeenCalledWith(envMock);
  });

  test("stays unentitled while no provider is configured", async () => {
    isAiConfigured.mockReturnValue(false);

    const { isFsinfAiEntitled } = await loadEntitlement();

    expect(isFsinfAiEntitled()).toBe(false);
  });
});
