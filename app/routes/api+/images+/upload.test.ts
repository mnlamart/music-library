import { beforeEach, describe, expect, test, vi } from "vitest";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { action, clientAction } from "./upload.tsx";

vi.mock("#app/utils/permissions.server.ts", () => ({
  requireCuratorRole: vi.fn(),
}));

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function uploadRequest(formData: FormData) {
  return new Request("http://localhost/api/images/upload", {
    method: "POST",
    body: formData,
  });
}

/**
 * react-router's data() is a DataWithResponseInit. Fetcher submissions only
 * receive data.error when the action returns that payload. Throwing it becomes
 * a route error and leaves the fetcher empty.
 */
async function returnedValidation(request: Request) {
  try {
    return await action({ request } as never);
  } catch (error) {
    const thrown = error as { data?: { error?: string }; init?: { status?: number } };
    throw new Error(
      `expected a returned 400 payload, but the action threw ${thrown.init?.status ?? "unknown"}: ${thrown.data?.error ?? String(error)}`,
      { cause: error },
    );
  }
}

describe("POST /api/images/upload validation", () => {
  beforeEach(() => {
    vi.mocked(requireCuratorRole).mockResolvedValue("curator-1");
  });

  test("returns an undersized image as action data instead of throwing", async () => {
    const formData = new FormData();
    formData.append("image", new File([TINY_PNG], "tiny.png", { type: "image/png" }));
    formData.append("entityType", "album");
    formData.append("entityId", "album-1");

    const result = await returnedValidation(uploadRequest(formData));

    expect(result).toMatchObject({
      data: {
        error: "Image too small. Minimum size is 500x500px",
      },
      init: { status: 400 },
    });
  });
});

describe("clientAction for POST /api/images/upload", () => {
  test("returns a successful server upload", async () => {
    const payload = {
      success: true,
      image: { id: "img-1", objectKey: "images/albums/album-1/cover.png" },
    };
    const serverAction = vi.fn().mockResolvedValue(payload);

    const result = await clientAction({
      request: new Request("http://localhost/api/images/upload", { method: "POST" }),
      params: {},
      serverAction,
    } as never);

    expect(serverAction).toHaveBeenCalledOnce();
    expect(result).toEqual(payload);
  });

  test("rethrows server failures so real errors still hit the boundary", async () => {
    const serverAction = vi.fn().mockRejectedValue(new Error("storage exploded"));

    await expect(
      clientAction({
        request: new Request("http://localhost/api/images/upload", { method: "POST" }),
        params: {},
        serverAction,
      } as never),
    ).rejects.toThrow("storage exploded");
  });
});
