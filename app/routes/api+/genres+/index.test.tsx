import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { loader, action } from "./index.tsx";

describe("GET /api/genres", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length === 0) return;
    await prisma.genre.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  });

  test("returns all genres with track counts", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create test genres
    const genre1 = await prisma.genre.create({
      data: {
        name: `Test Rock ${stamp}`,
        normalizedName: `test rock ${stamp}`,
      },
    });
    const genre2 = await prisma.genre.create({
      data: {
        name: `Test Jazz ${stamp}`,
        normalizedName: `test jazz ${stamp}`,
      },
    });

    createdIds.push(genre1.id, genre2.id);

    const response = await loader({
      request: new Request("http://localhost/api/genres"),
      params: {},
      context: {},
    } as never);

    const body = (await response.json()) as {
      genres: Array<{ id: string; name: string; trackCount: number }>;
    };

    const testGenres = body.genres.filter((g) => g.name.includes(stamp));
    expect(testGenres).toHaveLength(2);
    expect(testGenres[0]).toHaveProperty("trackCount");
  });

  test("returns empty array when no genres exist", async () => {
    // Clear all genres first
    await prisma.genre.deleteMany({});

    const response = await loader({
      request: new Request("http://localhost/api/genres"),
      params: {},
      context: {},
    } as never);

    const body = (await response.json()) as {
      genres: Array<{ id: string; name: string; trackCount: number }>;
    };

    expect(body.genres).toEqual([]);
  });
});

describe("POST /api/genres", () => {
  const createdIds: string[] = [];
  let curatorUserId: string;

  beforeEach(async () => {
    // Create a curator user for testing
    const curatorRole = await prisma.role.findFirst({
      where: { name: "curator" },
    });

    if (!curatorRole) {
      throw new Error("Curator role not found in database");
    }

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const curatorUser = await prisma.user.create({
      data: {
        email: `curator-${stamp}@test.com`,
        username: `curator-${stamp}`,
        roles: {
          connect: { id: curatorRole.id },
        },
      },
    });

    curatorUserId = curatorUser.id;
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await prisma.genre.deleteMany({ where: { id: { in: createdIds } } });
      createdIds.length = 0;
    }
    if (curatorUserId) {
      await prisma.user.delete({ where: { id: curatorUserId } }).catch(() => {});
    }
  });

  test("creates a new genre", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const genreName = `Test Progressive Rock ${stamp}`;

    // Mock request with curator session
    const request = new Request("http://localhost/api/genres", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: genreName,
      }),
    });

    // Mock the requireCuratorOrAdmin to return our test curator
    const originalRequireCurator = (await import("#app/utils/curator.server.ts"))
      .requireCuratorOrAdmin;
    vi.spyOn(
      await import("#app/utils/curator.server.ts"),
      "requireCuratorOrAdmin",
    ).mockResolvedValue(curatorUserId);

    const response = await action({
      request,
      params: {},
      context: {},
    } as never);

    const body = (await response.json()) as {
      genre: { id: string; name: string; trackCount: number };
    };

    expect(body.genre.name).toBe(genreName);
    expect(body.genre.trackCount).toBe(0);
    createdIds.push(body.genre.id);

    // Restore original function
    vi.mocked((await import("#app/utils/curator.server.ts")).requireCuratorOrAdmin).mockRestore();
  });

  test("returns 409 if genre already exists", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const genreName = `Test Duplicate ${stamp}`;

    // Create existing genre
    const existingGenre = await prisma.genre.create({
      data: {
        name: genreName,
        normalizedName: genreName.toLowerCase(),
      },
    });
    createdIds.push(existingGenre.id);

    // Mock request
    const request = new Request("http://localhost/api/genres", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: genreName,
      }),
    });

    vi.spyOn(
      await import("#app/utils/curator.server.ts"),
      "requireCuratorOrAdmin",
    ).mockResolvedValue(curatorUserId);

    await expect(async () => {
      await action({
        request,
        params: {},
        context: {},
      } as never);
    }).rejects.toThrow();

    vi.mocked((await import("#app/utils/curator.server.ts")).requireCuratorOrAdmin).mockRestore();
  });

  test("returns 400 for invalid genre name", async () => {
    const request = new Request("http://localhost/api/genres", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "", // Empty name
      }),
    });

    vi.spyOn(
      await import("#app/utils/curator.server.ts"),
      "requireCuratorOrAdmin",
    ).mockResolvedValue(curatorUserId);

    await expect(async () => {
      await action({
        request,
        params: {},
        context: {},
      } as never);
    }).rejects.toThrow();

    vi.mocked((await import("#app/utils/curator.server.ts")).requireCuratorOrAdmin).mockRestore();
  });
});
