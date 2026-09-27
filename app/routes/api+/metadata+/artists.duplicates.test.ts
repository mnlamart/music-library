import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { loader } from "./artists.duplicates.tsx";

describe("GET /api/metadata/artists/duplicates", () => {
  beforeEach(async () => {
    await prisma.track.deleteMany();
    await prisma.artist.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.upsert({
      where: { name: "curator" },
      update: {},
      create: { name: "curator", description: "Curator" },
    });
  });

  test("curator can find duplicate artists", async () => {
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

    // Create artists with same normalized name
    const artist1 = await prisma.artist.create({
      data: {
        name: "The Beatles",
        normalizedName: "thebeatles",
      },
    });

    const artist2 = await prisma.artist.create({
      data: {
        name: "The Beatles",
        normalizedName: "thebeatles",
      },
    });

    // Create tracks for each artist
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    await prisma.track.create({
      data: {
        title: "Track 2",
        artistId: artist1.id,
        serviceId: service.id,
        externalId: "track2",
      },
    });

    await prisma.track.create({
      data: {
        title: "Track 3",
        artistId: artist2.id,
        serviceId: service.id,
        externalId: "track3",
      },
    });

    const request = new Request("http://localhost/api/metadata/artists/duplicates", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]?.normalizedName).toBe("thebeatles");
    expect(data.groups[0]?.artists).toHaveLength(2);

    const artists = data.groups[0]?.artists;
    expect(artists?.some((a: any) => a.id === artist1.id && a.trackCount === 2)).toBe(true);
    expect(artists?.some((a: any) => a.id === artist2.id && a.trackCount === 1)).toBe(true);
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

    // Create artists with same normalized name
    const artist1 = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
      },
    });

    const artist2 = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
      },
    });

    // Create 1 track for artist1 (below threshold)
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    // Create 3 tracks for artist2
    for (let i = 2; i <= 4; i++) {
      await prisma.track.create({
        data: {
          title: `Track ${i}`,
          artistId: artist2.id,
          serviceId: service.id,
          externalId: `track${i}`,
        },
      });
    }

    const request = new Request("http://localhost/api/metadata/artists/duplicates?minTracks=2", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toHaveLength(1);

    const artists = data.groups[0]?.artists;
    // Only artist2 should be included (3 tracks >= minTracks of 2)
    expect(artists?.length).toBe(1);
    expect(artists?.[0]?.id).toBe(artist2.id);
  });

  test("excludes merged artists", async () => {
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
        name: "Artist",
        normalizedName: "artist",
      },
    });

    const artist2 = await prisma.artist.create({
      data: {
        name: "Artist",
        normalizedName: "artist",
        mergedIntoId: artist1.id,
        mergedAt: new Date(),
        mergedBy: curator.id,
      },
    });

    // Create tracks
    await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist1.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    const request = new Request("http://localhost/api/metadata/artists/duplicates", {
      method: "GET",
      headers: {
        Cookie: await createSessionCookie(curator.id),
      },
    });

    const response = await loader({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    // No duplicates since merged artist is excluded
    expect(data.groups).toHaveLength(0);
  });

  test("returns empty array when no duplicates", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    await prisma.artist.create({
      data: {
        name: "Unique Artist",
        normalizedName: "uniqueartist",
      },
    });

    const request = new Request("http://localhost/api/metadata/artists/duplicates", {
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
