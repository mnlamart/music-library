import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { action } from "./artists.$id.edit.tsx";

vi.mock("#app/utils/auth.server.ts", () => ({
  requireUserId: vi.fn(),
}));

describe("POST /api/metadata/artists/:id/edit", () => {
  let mockUserId: string;

  beforeEach(async () => {
    mockUserId = "test-user-id";
    vi.mocked(requireUserId).mockResolvedValue(mockUserId);
    await prisma.user.deleteMany();
    await prisma.artist.deleteMany();
  });

  test("curator can edit artist", async () => {
    await prisma.role.upsert({
      where: { name: "curator" },
      update: {},
      create: { name: "curator", description: "Curator" },
    });

    const curator = await prisma.user.create({
      data: {
        id: mockUserId,
        email: "curator@test.com",
        username: "curator",
        roles: { connect: { name: "curator" } },
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Original Name",
        normalizedName: "originalname",
      },
    });

    const request = new Request(`http://localhost/api/metadata/artists/${artist.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Updated Name",
        bio: "New bio",
        genre: "Rock",
        comment: "Fixing artist name",
      }),
    });

    const result = await action({ request, params: { id: artist.id } } as any);
    const data = result.data;

    expect(data.artist.name).toBe("Updated Name");
    expect(data.artist.normalizedName).toBe("updated name");
    expect(data.artist.bio).toBe("New bio");
    expect(data.artist.genre).toBe("Rock");
    expect(data.edit).toBeDefined();
    expect(data.edit.comment).toBe("Fixing artist name");
    expect(data.edit.editedBy).toBe(curator.id);

    const artistInDb = await prisma.artist.findUnique({ where: { id: artist.id } });
    expect(artistInDb?.name).toBe("Updated Name");
  });

  test("regular user cannot edit artist", async () => {
    await prisma.role.upsert({
      where: { name: "user" },
      update: {},
      create: { name: "user", description: "User" },
    });

    const user = await prisma.user.create({
      data: {
        id: mockUserId,
        email: "user@test.com",
        username: "user",
        roles: { connect: { name: "user" } },
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Original Name",
        normalizedName: "originalname",
      },
    });

    const request = new Request(`http://localhost/api/metadata/artists/${artist.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Updated Name",
        comment: "Trying to edit",
      }),
    });

    await expect(action({ request, params: { id: artist.id } } as any)).rejects.toThrow();
  });

  test("requires name field", async () => {
    await prisma.role.upsert({
      where: { name: "curator" },
      update: {},
      create: { name: "curator", description: "Curator" },
    });

    const curator = await prisma.user.create({
      data: {
        id: mockUserId,
        email: "curator@test.com",
        username: "curator",
        roles: { connect: { name: "curator" } },
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Original Name",
        normalizedName: "originalname",
      },
    });

    const request = new Request(`http://localhost/api/metadata/artists/${artist.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bio: "New bio",
      }),
    });

    await expect(action({ request, params: { id: artist.id } } as any)).rejects.toThrow();
  });

  test("creates edit history entry", async () => {
    await prisma.role.upsert({
      where: { name: "curator" },
      update: {},
      create: { name: "curator", description: "Curator" },
    });

    const curator = await prisma.user.create({
      data: {
        id: mockUserId,
        email: "curator@test.com",
        username: "curator",
        roles: { connect: { name: "curator" } },
      },
    });

    const artist = await prisma.artist.create({
      data: {
        name: "Original Name",
        normalizedName: "originalname",
        bio: "Original bio",
      },
    });

    const request = new Request(`http://localhost/api/metadata/artists/${artist.id}/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Updated Name",
        bio: "Updated bio",
        comment: "Test edit",
      }),
    });

    await action({ request, params: { id: artist.id } } as any);

    const edits = await prisma.artistEdit.findMany({
      where: { artistId: artist.id },
      orderBy: { editedAt: "desc" },
    });

    expect(edits).toHaveLength(1);
    expect(edits[0]?.name).toBe("Updated Name");
    expect(edits[0]?.bio).toBe("Updated bio");
    expect(edits[0]?.comment).toBe("Test edit");
  });

  test("returns 404 for non-existent artist", async () => {
    await prisma.role.upsert({
      where: { name: "curator" },
      update: {},
      create: { name: "curator", description: "Curator" },
    });

    const curator = await prisma.user.create({
      data: {
        id: mockUserId,
        email: "curator@test.com",
        username: "curator",
        roles: { connect: { name: "curator" } },
      },
    });

    const request = new Request("http://localhost/api/metadata/artists/nonexistent/edit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Updated Name",
      }),
    });

    await expect(action({ request, params: { id: "nonexistent" } } as any)).rejects.toThrow();
  });
});
