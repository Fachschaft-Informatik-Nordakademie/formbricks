import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET, POST } from "./route";

const { handlerMock } = vi.hoisted(() => ({
  handlerMock: vi.fn(async () => new Response("ok", { status: 200 })),
}));

vi.mock("@/modules/auth/lib/auth", () => ({ auth: { handler: handlerMock } }));

describe("[...all] Better Auth route", () => {
  beforeEach(() => {
    handlerMock.mockClear();
  });

  test("GET delegates to auth.handler", async () => {
    const request = new Request("http://localhost/api/auth/get-session");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(handlerMock).toHaveBeenCalledWith(request);
  });

  test("POST delegates to auth.handler", async () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", { method: "POST" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(handlerMock).toHaveBeenCalledWith(request);
  });

  test("GET and POST share the single handler", () => {
    expect(GET).toBe(POST);
  });
});
