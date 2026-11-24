import { beforeEach, describe, expect, test, vi } from "vitest";
import { ResourceNotFoundError } from "@formbricks/types/errors";
import { isSurveyResponsePresentAction, sendLinkSurveyEmailAction, validateSurveyPinAction } from "./actions";
import { getSurveyWithMetadata, isSurveyResponsePresent } from "./lib/data";
import { getPageAccess } from "./lib/fsinf-respondent-sso/page-gate";
import { checkAndValidateSingleUseId } from "./lib/helper";

// FSINF: the PIN action is a public, session-less action that hands out the survey definition. It must only
// do so for a survey a visitor could open on /s/<id> right now (upstream ENG-4032 / ENG-4041, backported
// for Formbricks 6.1.2) and, in this fork, only past the respondent SSO gate.

vi.mock("@/lib/utils/action-client", () => ({
  actionClient: {
    inputSchema: vi.fn().mockReturnThis(),
    action: vi.fn((fn) => fn),
  },
}));
vi.mock("@/modules/core/rate-limit/helpers", () => ({ applyIPRateLimit: vi.fn() }));
vi.mock("@/modules/core/rate-limit/rate-limit-configs", () => ({
  rateLimitConfigs: {
    actions: { sendLinkSurveyEmail: {}, validateSurveyPin: {}, isSurveyResponsePresent: {} },
  },
}));
vi.mock("@/modules/email", () => ({ sendLinkSurveyToVerifiedEmail: vi.fn() }));
vi.mock("./lib/data", () => ({
  getSurveyWithMetadata: vi.fn(),
  isSurveyResponsePresent: vi.fn(() => vi.fn().mockResolvedValue(false)),
}));
vi.mock("./lib/pin-token", () => ({ createLinkSurveyPinToken: vi.fn(() => "pin-token") }));
vi.mock("./lib/helper", () => ({ checkAndValidateSingleUseId: vi.fn() }));
vi.mock("./lib/fsinf-respondent-sso/page-gate", () => ({ getPageAccess: vi.fn() }));

const surveyId = "clsurvey00000000000000000";

const mockSurvey = (overrides: Record<string, unknown> = {}) =>
  vi.mocked(getSurveyWithMetadata).mockResolvedValue({
    id: surveyId,
    type: "link",
    status: "inProgress",
    archivedAt: null,
    pin: 1234,
    singleUse: { enabled: false, isEncrypted: false },
    fsinfSso: null,
    isVerifyEmailEnabled: true,
    isSingleResponsePerEmailEnabled: true,
    questions: [{ headline: "private question" }],
    ...overrides,
  } as never);

type TPinHandler = (args: {
  parsedInput: { surveyId: string; pin: string; suId?: string; suToken?: string };
}) => Promise<{ survey?: unknown; pinAuthToken?: string }>;
const pinAction = validateSurveyPinAction as unknown as TPinHandler;

describe("validateSurveyPinAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns the survey and a PIN token for an open link survey with the right PIN", async () => {
    mockSurvey();
    const result = await pinAction({ parsedInput: { surveyId, pin: "1234" } });
    expect(result.survey).toBeDefined();
    expect(result.pinAuthToken).toBe("pin-token");
  });

  test.each([
    ["draft", { status: "draft" }],
    ["scheduled", { status: "scheduled" }],
    ["paused", { status: "paused" }],
    ["completed", { status: "completed" }],
    ["archived", { archivedAt: new Date() }],
    ["app survey", { type: "app" }],
  ])("treats a %s survey as not found, even with the right PIN", async (_label, overrides) => {
    mockSurvey(overrides);
    await expect(pinAction({ parsedInput: { surveyId, pin: "1234" } })).rejects.toThrow(
      ResourceNotFoundError
    );
  });

  test("does not hand out a survey without PIN that is not open (no PIN-less content leak)", async () => {
    mockSurvey({ pin: null, status: "draft" });
    await expect(pinAction({ parsedInput: { surveyId, pin: "0000" } })).rejects.toThrow(
      ResourceNotFoundError
    );
  });

  test("rejects a single-use survey without a valid single-use link", async () => {
    mockSurvey({ singleUse: { enabled: true, isEncrypted: true } });
    vi.mocked(checkAndValidateSingleUseId).mockReturnValue(null);
    await expect(pinAction({ parsedInput: { surveyId, pin: "1234" } })).rejects.toThrow(
      ResourceNotFoundError
    );
  });

  test("accepts a single-use survey with a valid single-use link", async () => {
    mockSurvey({ singleUse: { enabled: true, isEncrypted: false } });
    vi.mocked(checkAndValidateSingleUseId).mockReturnValue("su-1");
    const result = await pinAction({
      parsedInput: { surveyId, pin: "1234", suId: "su-1", suToken: "tok" },
    });
    expect(result.survey).toBeDefined();
    expect(checkAndValidateSingleUseId).toHaveBeenCalledWith("su-1", false, surveyId, "tok");
  });

  test.each(["login", "denied", "unconfigured"] as const)(
    "hides an SSO-only survey when the SSO gate says %s",
    async (kind) => {
      mockSurvey({ fsinfSso: { enabled: true, allowedGroups: [], allowedUsers: [] } });
      vi.mocked(getPageAccess).mockResolvedValue({ kind, signedInAs: "x" } as never);
      await expect(pinAction({ parsedInput: { surveyId, pin: "1234" } })).rejects.toThrow(
        ResourceNotFoundError
      );
    }
  );

  test("serves an SSO-only survey to an allowed respondent", async () => {
    mockSurvey({ fsinfSso: { enabled: true, allowedGroups: [], allowedUsers: [] } });
    vi.mocked(getPageAccess).mockResolvedValue({ kind: "allowed" });
    const result = await pinAction({ parsedInput: { surveyId, pin: "1234" } });
    expect(result.survey).toBeDefined();
  });

  test("checks the gate before the PIN, so a closed survey can't be probed for its PIN", async () => {
    mockSurvey({ status: "paused" });
    await expect(pinAction({ parsedInput: { surveyId, pin: "9999" } })).rejects.toThrow(
      ResourceNotFoundError
    );
  });
});

describe("other public link-survey actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sendLinkSurveyEmailAction treats a draft survey as not found", async () => {
    mockSurvey({ status: "draft" });
    const handler = sendLinkSurveyEmailAction as unknown as (a: unknown) => Promise<unknown>;
    await expect(
      handler({ parsedInput: { surveyId, email: "a@example.com", surveyName: "x", suId: "" } })
    ).rejects.toThrow(ResourceNotFoundError);
  });

  test("isSurveyResponsePresentAction treats an archived survey as not found", async () => {
    mockSurvey({ archivedAt: new Date() });
    const handler = isSurveyResponsePresentAction as unknown as (a: unknown) => Promise<unknown>;
    await expect(handler({ parsedInput: { surveyId, email: "a@example.com" } })).rejects.toThrow(
      ResourceNotFoundError
    );
    expect(isSurveyResponsePresent).not.toHaveBeenCalled();
  });
});
