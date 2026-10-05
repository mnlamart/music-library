import { afterEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { loader } from "./$id.tsx";

describe("GET /api/albums/:id", () => {
  const artistIds: string[] = [];
  const albumIds: string[] = [];

  afterEach(async () => {
    if (albumIds.length) {
      await prisma.album.deleteMany({ where: { id: { in: albumIds } } });
      albumIds.length = 0;
    }
    if (artistIds.length) {
      await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
      artistIds.length = 0;
    }
  });

  test("returns the album name, artist, and year for an id", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const artist = await prisma.artist.create({
      data: { name: `Miles ${stamp}`, normalizedName: `miles ${stamp}` },
    });
    const album = await prisma.album.create({
      data: { name: `Kind of Blue ${stamp}`, artistId: artist.id, year: 1959 },
    });
    artistIds.push(artist.id);
    albumIds.push(album.id);

    const response = await loader({
      request: new Request(`http://localhost/api/albums/${album.id}`),
      params: { id: album.id },
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      album: {
        id: string;
        name: string;
        artistName: string;
        year: number | null;
        trackCount: number;
      } | null;
    };
    expect(body.album).toEqual({
      id: album.id,
      name: `Kind of Blue ${stamp}`,
      artistName: `Miles ${stamp}`,
      year: 1959,
      trackCount: 0,
    });
  });

  test("returns a merged album so the stored id can still be displayed", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const artist = await prisma.artist.create({
      data: { name: `Artist ${stamp}`, normalizedName: `artist ${stamp}` },
    });
    const target = await prisma.album.create({
      data: { name: `Canonical ${stamp}`, artistId: artist.id },
    });
    const source = await prisma.album.create({
      data: {
        name: `Alias ${stamp}`,
        artistId: artist.id,
        mergedIntoId: target.id,
        mergedAt: new Date(),
      },
    });
    artistIds.push(artist.id);
    albumIds.push(source.id, target.id);

    const response = await loader({
      request: new Request(`http://localhost/api/albums/${source.id}`),
      params: { id: source.id },
      context: {},
    } as never);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { album: { id: string; name: string } | null };
    expect(body.album).toMatchObject({ id: source.id, name: `Alias ${stamp}` });
  });

  test("returns 404 when the album does not exist", async () => {
    const response = await loader({
      request: new Request("http://localhost/api/albums/missing-album"),
      params: { id: "missing-album" },
      context: {},
    } as never);

    expect(response.status).toBe(404);
    const body = (await response.json()) as { album: null };
    expect(body.album).toBeNull();
  });
});
