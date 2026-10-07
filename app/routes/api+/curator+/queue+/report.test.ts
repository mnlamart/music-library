import { describe, expect, test, vi } from "vitest";
import { clientAction } from "./report.ts";

vi.mock("#app/utils/auth.server.ts", () => ({
  requireUserId: vi.fn(),
}));

vi.mock("#app/utils/db.server.ts", () => ({
  prisma: {
    track: { findUnique: vi.fn() },
    reviewQueueItem: { create: vi.fn() },
  },
}));

describe("clientAction for POST /api/curator/queue/report", () => {
  test("forwards the fetcher submission to the server action", async () => {
    const payload = { success: true };
    const serverAction = vi.fn().mockResolvedValue(payload);

    const result = await clientAction({
      request: new Request("http://localhost/api/curator/queue/report", { method: "POST" }),
      params: {},
      serverAction,
    } as never);

    expect(serverAction).toHaveBeenCalledOnce();
    expect(result).toEqual(payload);
  });
});
