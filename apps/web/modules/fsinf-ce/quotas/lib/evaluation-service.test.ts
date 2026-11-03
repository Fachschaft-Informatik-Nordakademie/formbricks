import { beforeEach, describe, expect, test, vi } from "vitest";
import { Prisma } from "@formbricks/database/prisma";
import { TSurveyQuota } from "@formbricks/types/quota";
import { evaluateResponseQuotas } from "./evaluation-service";

// FSINF CE: tests for the transactional quota evaluation (locking, link writes, ending the survey).

vi.mock("server-only", () => ({}));
vi.mock("@formbricks/database", () => ({ prisma: {} }));
vi.mock("@formbricks/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const survey = {
  id: "survey1",
  blocks: [
    {
      id: "block1",
      name: "Block 1",
      elements: [
        {
          id: "age",
          type: "multipleChoiceSingle",
          headline: { default: "Age" },
          required: true,
          choices: [
            { id: "young", label: { default: "18-25" } },
            { id: "old", label: { default: "26+" } },
          ],
        },
      ],
    },
  ],
  variables: [],
  languages: [],
};

const makeQuota = (overrides: Partial<TSurveyQuota> = {}): TSurveyQuota => ({
  id: "quota1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  surveyId: "survey1",
  name: "Young",
  limit: 2,
  logic: {
    connector: "and",
    conditions: [
      {
        id: "c1",
        leftOperand: { type: "element", value: "age" },
        operator: "equals",
        rightOperand: { type: "static", value: "young" },
      },
    ],
  },
  action: "endSurvey",
  endingCardId: "ending1",
  countPartialSubmissions: false,
  ...overrides,
});

const createTx = () => ({
  surveyQuota: { findMany: vi.fn() },
  survey: { findUnique: vi.fn().mockResolvedValue(survey) },
  responseQuotaLink: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  response: { update: vi.fn() },
  $queryRaw: vi.fn().mockResolvedValue([]),
});

type TMockTx = ReturnType<typeof createTx>;

const run = (tx: TMockTx, overrides: Partial<Parameters<typeof evaluateResponseQuotas>[0]> = {}) =>
  evaluateResponseQuotas({
    surveyId: "survey1",
    responseId: "response1",
    data: { age: "18-25" },
    variables: {},
    language: "default",
    responseFinished: true,
    tx: tx as unknown as Prisma.TransactionClient,
    ...overrides,
  });

describe("evaluateResponseQuotas", () => {
  let tx: TMockTx;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = createTx();
  });

  test("returns a neutral result and touches nothing when the survey has no quotas", async () => {
    tx.surveyQuota.findMany.mockResolvedValue([]);

    await expect(run(tx)).resolves.toEqual({
      shouldEndSurvey: false,
      quotaFull: null,
      refreshedResponse: null,
    });
    expect(tx.survey.findUnique).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.responseQuotaLink.createMany).not.toHaveBeenCalled();
  });

  test("locks the matching quota before counting and screens the response in", async () => {
    tx.surveyQuota.findMany.mockResolvedValue([makeQuota()]);
    tx.responseQuotaLink.count.mockResolvedValue(1);

    const result = await run(tx);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.responseQuotaLink.count.mock.invocationCallOrder[0]
    );
    expect(tx.responseQuotaLink.count).toHaveBeenCalledWith({
      where: { quotaId: "quota1", status: "screenedIn" },
    });
    expect(tx.responseQuotaLink.createMany).toHaveBeenCalledWith({
      data: [{ responseId: "response1", quotaId: "quota1", status: "screenedIn" }],
      skipDuplicates: true,
    });
    expect(tx.response.update).not.toHaveBeenCalled();
    expect(result).toEqual({ shouldEndSurvey: false, quotaFull: null, refreshedResponse: null });
  });

  test("does not lock or count quotas the response does not match", async () => {
    tx.surveyQuota.findMany.mockResolvedValue([makeQuota()]);

    await run(tx, { data: { age: "26+" } });

    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.responseQuotaLink.count).not.toHaveBeenCalled();
    expect(tx.responseQuotaLink.createMany).not.toHaveBeenCalled();
  });

  test("screens out, finishes the response with the quota's ending and returns it when full", async () => {
    const quota = makeQuota({ limit: 2 });
    const refreshed = { id: "response1", finished: true, endingId: "ending1" };
    tx.surveyQuota.findMany.mockResolvedValue([quota]);
    tx.responseQuotaLink.count.mockResolvedValue(2);
    tx.response.update.mockResolvedValue(refreshed);

    const result = await run(tx, { responseFinished: false });

    expect(tx.responseQuotaLink.createMany).toHaveBeenCalledWith({
      data: [{ responseId: "response1", quotaId: "quota1", status: "screenedOut" }],
      skipDuplicates: true,
    });
    expect(tx.response.update).toHaveBeenCalledWith({
      where: { id: "response1" },
      data: { finished: true, endingId: "ending1" },
    });
    expect(result).toEqual({ shouldEndSurvey: true, quotaFull: quota, refreshedResponse: refreshed });
  });

  test("reports a full continueSurvey quota without ending the response", async () => {
    const quota = makeQuota({ action: "continueSurvey", endingCardId: null, limit: 1 });
    tx.surveyQuota.findMany.mockResolvedValue([quota]);
    tx.responseQuotaLink.count.mockResolvedValue(1);

    const result = await run(tx);

    expect(tx.response.update).not.toHaveBeenCalled();
    expect(result).toEqual({ shouldEndSurvey: false, quotaFull: quota, refreshedResponse: null });
  });

  test("removes the link of a response whose edited answers no longer match", async () => {
    tx.surveyQuota.findMany.mockResolvedValue([makeQuota()]);
    tx.responseQuotaLink.findMany.mockResolvedValue([{ quotaId: "quota1", status: "screenedIn" }]);

    await run(tx, { data: { age: "26+" } });

    expect(tx.responseQuotaLink.deleteMany).toHaveBeenCalledWith({
      where: { responseId: "response1", quotaId: { in: ["quota1"] } },
    });
    expect(tx.responseQuotaLink.createMany).not.toHaveBeenCalled();
  });

  test("leaves an existing screened-in link alone on later updates", async () => {
    tx.surveyQuota.findMany.mockResolvedValue([makeQuota({ limit: 1 })]);
    tx.responseQuotaLink.findMany.mockResolvedValue([{ quotaId: "quota1", status: "screenedIn" }]);
    tx.responseQuotaLink.count.mockResolvedValue(1);

    const result = await run(tx);

    expect(tx.responseQuotaLink.count).not.toHaveBeenCalled();
    expect(tx.responseQuotaLink.createMany).not.toHaveBeenCalled();
    expect(tx.responseQuotaLink.deleteMany).not.toHaveBeenCalled();
    expect(result.shouldEndSurvey).toBe(false);
  });

  test("returns a neutral result when the survey cannot be loaded", async () => {
    tx.surveyQuota.findMany.mockResolvedValue([makeQuota()]);
    tx.survey.findUnique.mockResolvedValue(null);

    await expect(run(tx)).resolves.toEqual({
      shouldEndSurvey: false,
      quotaFull: null,
      refreshedResponse: null,
    });
    expect(tx.responseQuotaLink.createMany).not.toHaveBeenCalled();
  });
});
