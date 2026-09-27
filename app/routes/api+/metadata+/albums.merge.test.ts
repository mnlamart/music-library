import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { action } from "./albums.merge.tsx";

describe("POST /api/metadata/albums/merge", () => {
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
    await prisma.role.upsert({
      where: { name: "user" },
      update: {},
      create: { name: "user", description: "User" },
    });
  });

  test("curator can merge albums", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
      },
    });

    // Create service first
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

    const sourceAlbum = await prisma.album.create({
      data: {
        name: "Duplicate Album",
        artistId: artist.id,
      },
    });

    const targetAlbum = await prisma.album.create({
      data: {
        name: "Main Album",
        artistId: artist.id,
      },
    });

    // Create tracks for source album
    const track1 = await prisma.track.create({
      data: {
        title: "Track 1",
        artistId: artist.id,
        albumId: sourceAlbum.id,
        serviceId: service.id,
        externalId: "track1",
      },
    });

    const track2 = await prisma.track.create({
      data: {
        title: "Track 2",
        artistId: artist.id,
        albumId: sourceAlbum.id,
        serviceId: service.id,
        externalId: "track2",
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/merge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        sourceId: sourceAlbum.id,
        targetId: targetAlbum.id,
        keepAsAlias: false,
        comment: "Merging duplicate albums",
      }),
    });

    const response = await action({ request, params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.tracksUpdated).toBe(2);
    expect(data.targetAlbum.id).toBe(targetAlbum.id);

    // Verify tracks were moved
    const updatedTrack1 = await prisma.track.findUnique({ where: { id: track1.id } });
    const updatedTrack2 = await prisma.track.findUnique({ where: { id: track2.id } });
    expect(updatedTrack1?.albumId).toBe(targetAlbum.id);
    expect(updatedTrack2?.albumId).toBe(targetAlbum.id);

    // Verify source album is marked as merged
    const mergedAlbum = await prisma.album.findUnique({ where: { id: sourceAlbum.id } });
    expect(mergedAlbum?.mergedIntoId).toBe(targetAlbum.id);
    expect(mergedAlbum?.mergedAt).toBeDefined();
    expect(mergedAlbum?.mergedBy).toBe(curator.id);
  });

  test("prevents self-merge", async () => {
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

    const album = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist.id,
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/merge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        sourceId: album.id,
        targetId: album.id,
        keepAsAlias: false,
        comment: "Trying self-merge",
      }),
    });

    await expect(action({ request, params: {} })).rejects.toThrow();
  });

  test("prevents circular merge (target already merged)", async () => {
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

    const album1 = await prisma.album.create({
      data: {
        name: "Album 1",
        artistId: artist.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Album 2",
        artistId: artist.id,
      },
    });

    const album3 = await prisma.album.create({
      data: {
        name: "Album 3",
        artistId: artist.id,
        mergedIntoId: album1.id,
        mergedAt: new Date(),
        mergedBy: curator.id,
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/merge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        sourceId: album2.id,
        targetId: album3.id,
        keepAsAlias: false,
        comment: "Trying circular merge",
      }),
    });

    await expect(action({ request, params: {} })).rejects.toThrow();
  });

  test("requires comment field", async () => {
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

    const album1 = await prisma.album.create({
      data: {
        name: "Album 1",
        artistId: artist.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Album 2",
        artistId: artist.id,
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/merge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        sourceId: album1.id,
        targetId: album2.id,
        keepAsAlias: false,
      }),
    });

    await expect(action({ request, params: {} })).rejects.toThrow();
  });

  test("regular user cannot merge albums", async () => {
    const user = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "user" } },
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
        name: "Album 1",
        artistId: artist.id,
      },
    });

    const album2 = await prisma.album.create({
      data: {
        name: "Album 2",
        artistId: artist.id,
      },
    });

    const request = new Request("http://localhost/api/metadata/albums/merge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(user.id),
      },
      body: JSON.stringify({
        sourceId: album1.id,
        targetId: album2.id,
        keepAsAlias: false,
        comment: "Trying to merge",
      }),
    });

    await expect(action({ request, params: {} })).rejects.toThrow();
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
