import { afterEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { loader } from "./$id.tsx";

describe("GET /api/artists/:id", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length === 0) return;
    await prisma.artist.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  });

  test("returns the artist name for an id", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const artist = await prisma.artist.create({
      data: {
        name: `Meryl ${stamp}`,
        normalizedName: `meryl ${stamp}`,
      },
    });
    createdIds.push(artist.id);

    const response = await loader({
      request: new Request(`http://localhost/api/artists/${artist.id}`),
      params: { id: artist.id },
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      artist: { id: string; name: string; trackCount: number } | null;
    };
    expect(body.artist).toEqual({
      id: artist.id,
      name: `Meryl ${stamp}`,
      trackCount: 0,
    });
  });

  test("returns a merged artist so the stored id can still be displayed", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const target = await prisma.artist.create({
      data: {
        name: `Canonical ${stamp}`,
        normalizedName: `canonical ${stamp}`,
      },
    });
    const source = await prisma.artist.create({
      data: {
        name: `Alias ${stamp}`,
        normalizedName: `alias ${stamp}`,
        mergedIntoId: target.id,
        mergedAt: new Date(),
      },
    });
    createdIds.push(source.id, target.id);

    const response = await loader({
      request: new Request(`http://localhost/api/artists/${source.id}`),
      params: { id: source.id },
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { artist: { id: string; name: string } | null };
    expect(body.artist).toMatchObject({ id: source.id, name: `Alias ${stamp}` });
  });

  test("returns 404 when the artist does not exist", async () => {
    const response = await loader({
      request: new Request("http://localhost/api/artists/missing-artist"),
      params: { id: "missing-artist" },
      context: {},
    } as never);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { artist: null };
    expect(body.artist).toBeNull();
  });
});
