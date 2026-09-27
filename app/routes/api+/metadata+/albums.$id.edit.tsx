import { data } from "react-router";
import { z } from "zod";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { type Route } from "./+types/albums.$id.edit.ts";

const EditAlbumSchema = z.object({
  name: z.string().min(1, "Name is required"),
  artistId: z.string().min(1, "Artist ID is required"),
  year: z.number().nullable().optional(),
  coverImageId: z.string().nullable().optional(),
  comment: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
  // Check curator/admin role
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      roles: {
        some: {
          name: { in: ["curator", "admin"] },
        },
      },
    },
  });

  if (!user) {
    throw data(
      {
        error: "Unauthorized",
        message: "You must be a curator or admin to edit albums",
      },
      { status: 403 },
    );
  }

  const { id: albumId } = params;

  if (!albumId) {
    throw data({ error: "Album ID is required" }, { status: 400 });
  }

  // Parse and validate request body
  const body = await request.json();
  const result = EditAlbumSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        issues: result.error.issues,
      },
      { status: 400 },
    );
  }

  const { name, artistId, year, coverImageId, comment } = result.data;

  // Check if album exists
  const existingAlbum = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!existingAlbum) {
    throw data({ error: "Album not found" }, { status: 404 });
  }

  // Verify artist exists
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
  });

  if (!artist) {
    throw data({ error: "Artist not found" }, { status: 404 });
  }

  // Update album and create edit history in a transaction
  const { album, edit } = await prisma.$transaction(async (tx) => {
    // Update album
    const updatedAlbum = await tx.album.update({
      where: { id: albumId },
      data: {
        name: name.trim(),
        artistId,
        year: year !== undefined ? year : undefined,
        coverImageId: coverImageId !== undefined ? coverImageId : undefined,
      },
    });

    // Create edit history entry
    const albumEdit = await tx.albumEdit.create({
      data: {
        albumId,
        editedBy: userId,
        comment: comment || null,
        name: updatedAlbum.name,
        artistId: updatedAlbum.artistId,
        year: updatedAlbum.year,
        coverImageId: updatedAlbum.coverImageId,
      },
    });

    return { album: updatedAlbum, edit: albumEdit };
  });

  return data({ album, edit });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
