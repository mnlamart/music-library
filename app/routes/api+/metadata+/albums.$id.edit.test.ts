import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { action } from "./albums.$id.edit.tsx";

describe("POST /api/metadata/albums/:id/edit", () => {
  beforeEach(async () => {
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

  test("curator can edit album", async () => {
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
        name: "Original Album",
        artistId: artist.id,
      },
    });

    const request = new Request(`http://localhost/api/metadata/albums/${album.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        name: "Updated Album",
        artistId: artist.id,
        year: 2024,
        comment: "Fixing album name",
      }),
    });

    const response = await action({ request, params: { id: album.id } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.album.name).toBe("Updated Album");
    expect(data.album.year).toBe(2024);
    expect(data.edit).toBeDefined();
    expect(data.edit.comment).toBe("Fixing album name");
    expect(data.edit.editedBy).toBe(curator.id);

    const albumInDb = await prisma.album.findUnique({ where: { id: album.id } });
    expect(albumInDb?.name).toBe("Updated Album");
    expect(albumInDb?.year).toBe(2024);
  });

  test("can change album artist", async () => {
    const curator = await prisma.user.create({
      data: {
        ...createUser(),
        roles: { connect: { name: "curator" } },
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

    const album = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist1.id,
      },
    });

    const request = new Request(`http://localhost/api/metadata/albums/${album.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        name: "Album",
        artistId: artist2.id,
        comment: "Moving to correct artist",
      }),
    });

    const response = await action({ request, params: { id: album.id } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.album.artistId).toBe(artist2.id);

    const albumInDb = await prisma.album.findUnique({ where: { id: album.id } });
    expect(albumInDb?.artistId).toBe(artist2.id);
  });

  test("regular user cannot edit album", async () => {
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

    const album = await prisma.album.create({
      data: {
        name: "Album",
        artistId: artist.id,
      },
    });

    const request = new Request(`http://localhost/api/metadata/albums/${album.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(user.id),
      },
      body: JSON.stringify({
        name: "Updated Album",
        artistId: artist.id,
        comment: "Trying to edit",
      }),
    });

    await expect(action({ request, params: { id: album.id } })).rejects.toThrow();
  });

  test("requires name and artistId fields", async () => {
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

    const request = new Request(`http://localhost/api/metadata/albums/${album.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        year: 2024,
      }),
    });

    await expect(action({ request, params: { id: album.id } })).rejects.toThrow();
  });

  test("creates edit history entry", async () => {
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
        name: "Original Album",
        artistId: artist.id,
        year: 2020,
      },
    });

    const request = new Request(`http://localhost/api/metadata/albums/${album.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        name: "Updated Album",
        artistId: artist.id,
        year: 2024,
        comment: "Test edit",
      }),
    });

    await action({ request, params: { id: album.id } });

    const edits = await prisma.albumEdit.findMany({
      where: { albumId: album.id },
      orderBy: { editedAt: "desc" },
    });

    expect(edits).toHaveLength(1);
    expect(edits[0]?.name).toBe("Updated Album");
    expect(edits[0]?.year).toBe(2024);
    expect(edits[0]?.comment).toBe("Test edit");
  });

  test("returns 404 for non-existent album", async () => {
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

    const request = new Request("http://localhost/api/metadata/albums/nonexistent/edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: await createSessionCookie(curator.id),
      },
      body: JSON.stringify({
        name: "Updated Album",
        artistId: artist.id,
      }),
    });

    await expect(action({ request, params: { id: "nonexistent" } })).rejects.toThrow();
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
