import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@formbricks/database";
import {
  CONTACT_SURVEY_TOKEN_PURPOSE,
  createContactSurveyToken,
  getContactSurveyLink,
  verifyContactSurveyToken,
} from "./contact-survey-link";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/constants", () => ({ NEXTAUTH_SECRET: "test-secret", ENCRYPTION_KEY: "test-key" }));
vi.mock("@/lib/crypto", () => ({
  symmetricEncrypt: (text: string) => `enc:${text}`,
  symmetricDecrypt: (text: string) => text.replace(/^enc:/, ""),
}));
vi.mock("@/lib/getPublicUrl", () => ({ getPublicDomain: () => "https://forms.example.org" }));
vi.mock("@formbricks/database", () => ({
  prisma: { contact: { findUnique: vi.fn() }, survey: { findUnique: vi.fn() } },
}));

describe("contact survey link tokens", () => {
  beforeEach(() => vi.clearAllMocks());

  test("round-trips contact and survey ids", () => {
    const token = createContactSurveyToken("contact1", "survey1");
    expect(token.ok).toBe(true);
    if (!token.ok) return;
    expect(verifyContactSurveyToken(token.data)).toEqual({
      ok: true,
      data: { contactId: "contact1", surveyId: "survey1" },
    });
  });

  test("does not expose the contact id in clear text", () => {
    const token = createContactSurveyToken("contact1", "survey1");
    if (!token.ok) throw new Error("token expected");
    expect((jwt.decode(token.data) as { contactId: string }).contactId).toBe("enc:contact1");
  });

  test("reports expired tokens distinctly", () => {
    const expired = jwt.sign(
      { contactId: "enc:c", surveyId: "s", purpose: CONTACT_SURVEY_TOKEN_PURPOSE, exp: 1 },
      "test-secret",
      { algorithm: "HS256" }
    );
    expect(verifyContactSurveyToken(expired)).toEqual({
      ok: false,
      error: { type: "bad_request", details: [{ field: "token", issue: "token_expired" }] },
    });
  });

  test("rejects tokens minted for another purpose or with another secret", () => {
    const otherPurpose = jwt.sign(
      { contactId: "enc:c", surveyId: "s", purpose: "email_verification" },
      "test-secret"
    );
    const otherSecret = jwt.sign(
      { contactId: "enc:c", surveyId: "s", purpose: CONTACT_SURVEY_TOKEN_PURPOSE },
      "x"
    );
    for (const token of [otherPurpose, otherSecret, "garbage"]) {
      const result = verifyContactSurveyToken(token);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details?.[0].issue).toBe("invalid_token");
    }
  });

  test("builds the public link only when contact and survey share a workspace", async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ workspaceId: "ws1" } as never);
    vi.mocked(prisma.survey.findUnique).mockResolvedValue({ workspaceId: "ws1" } as never);
    const link = await getContactSurveyLink("contact1", "survey1", 7);
    expect(link.ok).toBe(true);
    if (link.ok) expect(link.data.startsWith("https://forms.example.org/c/")).toBe(true);

    vi.mocked(prisma.survey.findUnique).mockResolvedValue({ workspaceId: "ws2" } as never);
    const mismatch = await getContactSurveyLink("contact1", "survey1");
    expect(mismatch.ok).toBe(false);
  });
});
