import { afterEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { loader } from "./search.tsx";

describe("GET /api/artists/search", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length === 0) return;
    await prisma.artist.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  });

  test("does not return artists that have been merged into another artist", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const target = await prisma.artist.create({
      data: {
        name: `Search Target ${stamp}`,
        normalizedName: `search target ${stamp}`,
      },
    });
    const source = await prisma.artist.create({
      data: {
        name: `Search Alias ${stamp}`,
        normalizedName: `search alias ${stamp}`,
        mergedIntoId: target.id,
        mergedAt: new Date(),
      },
    });
    createdIds.push(source.id, target.id);

    const response = await loader({
      request: new Request(`http://localhost/api/artists/search?q=${encodeURIComponent(stamp)}`),
      params: {},
      context: {},
    } as never);

    const body = (await response.json()) as {
      artists: Array<{ id: string; name: string }>;
    };
    const ids = body.artists.map((artist) => artist.id);

    expect(ids).not.toContain(source.id);
    expect(ids).toContain(target.id);
  });
});
