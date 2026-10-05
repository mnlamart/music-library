import { afterEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { loader } from "./search.tsx";

describe("GET /api/albums/search", () => {
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

  async function createAlbum(name: string, artistName: string, year?: number) {
    const artist = await prisma.artist.create({
      data: {
        name: artistName,
        normalizedName: artistName.toLowerCase(),
      },
    });
    artistIds.push(artist.id);
    const album = await prisma.album.create({
      data: {
        name,
        artistId: artist.id,
        year,
      },
    });
    albumIds.push(album.id);
    return { artist, album };
  }

  async function search(query: string) {
    const response = await loader({
      request: new Request(`http://localhost/api/albums/search?q=${encodeURIComponent(query)}`),
      params: {},
      context: {},
    } as never);
    return (await response.json()) as {
      albums: Array<{
        id: string;
        name: string;
        artistName: string;
        year: number | null;
        trackCount: number;
      }>;
    };
  }

  test("returns albums whose name contains the query, with artist and year", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { album } = await createAlbum(`Blue Note ${stamp}`, `Miles ${stamp}`, 1959);

    const body = await search(`blue note ${stamp}`);

    expect(body.albums).toEqual([
      {
        id: album.id,
        name: `Blue Note ${stamp}`,
        artistName: `Miles ${stamp}`,
        year: 1959,
        trackCount: 0,
      },
    ]);
  });

  test("matches album names case-insensitively", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { album } = await createAlbum(`Kind Of Blue ${stamp}`, `Miles ${stamp}`);

    const body = await search(stamp.toUpperCase());

    expect(body.albums.map((item) => item.id)).toContain(album.id);
  });

  test("matches the album artist name", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { album } = await createAlbum(`Untitled ${stamp}`, `Search Artist ${stamp}`);

    const body = await search(`search artist ${stamp}`);

    expect(body.albums.map((item) => item.id)).toEqual([album.id]);
  });

  test("does not return albums that have been merged into another album", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { artist, album: target } = await createAlbum(`Canonical ${stamp}`, `Artist ${stamp}`);
    const source = await prisma.album.create({
      data: {
        name: `Alias ${stamp}`,
        artistId: artist.id,
        mergedIntoId: target.id,
        mergedAt: new Date(),
      },
    });
    albumIds.push(source.id);

    const body = await search(stamp);
    const ids = body.albums.map((album) => album.id);

    expect(ids).toContain(target.id);
    expect(ids).not.toContain(source.id);
  });

  test("returns no albums for an empty or oversized query", async () => {
    const empty = await loader({
      request: new Request("http://localhost/api/albums/search?q="),
      params: {},
      context: {},
    } as never);
    const tooLong = await loader({
      request: new Request(`http://localhost/api/albums/search?q=${"a".repeat(101)}`),
      params: {},
      context: {},
    } as never);

    expect(await empty.json()).toEqual({ albums: [] });
    expect(await tooLong.json()).toEqual({ albums: [] });
  });
});
