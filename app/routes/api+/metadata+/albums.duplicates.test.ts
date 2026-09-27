import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { loader } from "./albums.duplicates.tsx";

describe("GET /api/metadata/albums/duplicates", () => {
  beforeEach(async () => {
    await prisma.track.deleteMany();
    await prisma.album.deleteMany();
    await prisma.artist.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.upsert({
      where: { name: "curator" },
      update: {},
      create: { name: "curator", description: "Curator" },
    });
  });

  test("curator can find duplicate albums", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    // Create service
    const service = await prisma.service.create({
      data: {
        name: "test",
        displayName: "Test",
        baseUrl: "http://test.com",
        isActive: true,
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
      },
    });

    // Create albums with same artist and name
    const album1 = await prisma.album.create({
      data: {
        name: "Abbey Road",
        artistId: artist.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Abbey Road",
        artistId: artist.id,
      },
    });

    // Create tracks for each album
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist.id,
        albumId: album1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    await prisma.track.create({
      data: {
        title: "Track 2",
        artistId: artist.id,
        albumId: album1.id,
        serviceId: service.id,
        externalId: "track2",
      },
    });

    await prisma.track.create({
      data: {
        title: "Track 3",
        artistId: artist.id,
        albumId: album2.id,
        serviceId: service.id,
        externalId: "track3",
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/duplicates", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]?.artistId).toBe(artist.id);
    expect(data.groups[0]?.artistName).toBe("Artist");
    expect(data.groups[0]?.name).toBe("Abbey Road");
    expect(data.groups[0]?.albums).toHaveLength(2);

    const albums = data.groups[0]?.albums;
    expect(albums?.some((a: any) => a.id === album1.id && a.trackCount === 2)).toBe(true);
    expect(albums?.some((a: any) => a.id === album2.id && a.trackCount === 1)).toBe(true);
  });

  test("filters by minimum track count", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    // Create service
    const service = await prisma.service.create({
      data: {
        name: "test",
        displayName: "Test",
        baseUrl: "http://test.com",
        isActive: true,
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
      },
    });

    // Create albums with same name
    const album1 = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist.id,
      },
    });

    // Create 1 track for album1 (below threshold)
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist.id,
        albumId: album1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    // Create 3 tracks for album2
    for (let i = 2; i <= 4; i++) {
      await prisma.track.create({
        data: {
          title: `Track ${i}`,
          artistId: artist.id,
          albumId: album2.id,
          serviceId: service.id,
          externalId: `track${i}`,
        },
      });
    }

    const request = new Request("http://localhost/api/metadata/albums/duplicates?minTracks=2", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);

    const albums = data.groups[0]?.albums;
    // Only album2 should be included (3 tracks >= minTracks of 2)
    expect(albums?.length).toBe(1);
    expect(albums?.[0]?.id).toBe(album2.id);
  });

  test("excludes merged albums", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    // Create service
    const service = await prisma.service.create({
      data: {
        name: "test",
        displayName: "Test",
        baseUrl: "http://test.com",
        isActive: true,
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
      },
    });

    const album1 = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist.id,
        mergedIntoId: album1.id,
        mergedAt: new Date(),
        mergedBy: curator.id,
      },
    });

    // Create tracks
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist.id,
        albumId: album1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/duplicates", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    // No duplicates since merged album is excluded
    expect(data.groups).toHaveLength(0);
  });

  test("groups albums by artist and name", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    // Create service
    const service = await prisma.service.create({
      data: {
        name: "test",
        displayName: "Test",
        baseUrl: "http://test.com",
        isActive: true,
      },
    });

    const artist1 = await prisma.artist.create({
      data: {
        name: "Artist 1",
        normalizedName: "artist1",
      },
    });

    const artist2 = await prisma.artist.create({
      data: {
        name: "Artist 2",
        normalizedName: "artist2",
      },
    });

    // Same album name but different artists - should NOT be grouped
    const album1 = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist1.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist2.id,
      },
    });

    // Create tracks
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist1.id,
        albumId: album1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    await prisma.track.create({
      data: {
        title: "Track 2",
        artistId: artist2.id,
        albumId: album2.id,
        serviceId: service.id,
        externalId: "track2",
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/duplicates", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    // No duplicates because they have different artists
    expect(data.groups).toHaveLength(0);
  });

  test("returns empty array when no duplicates", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
      },
    });

    await prisma.album.create({
      data: {
        name: "Unique Album",
        artistId: artist.id,
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/duplicates", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(0);
  });
});

async function createSessionCookie(userId: string): Promise<string> {
  const session = await prisma.session.create({
    data: {
      userId,
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  return `en_session=${session.id}`;
}
