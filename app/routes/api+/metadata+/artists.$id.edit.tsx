import { data } from "react-router";
import { z } from "zod";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserWithRole } from "#app/utils/permissions.server.ts";
import { normalizeArtistName } from "#app/utils/artist-management.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { type Route } from "./+types/artists.$id.edit.ts";

const EditArtistSchema = z.object({
  name: z.string().min(1, "Name is required"),
  bio: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
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
        message: "You must be a curator or admin to edit artists",
      },
      { status: 403 },
    );
  }

  const { id: artistId } = params;

  if (!artistId) {
    throw data({ error: "Artist ID is required" }, { status: 400 });
  }

  // Parse and validate request body
  const body = await request.json();
  const result = EditArtistSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        issues: result.error.issues,
      },
      { status: 400 },
    );
  }

  const { name, bio, genre, country, imageUrl, website, comment } = result.data;

  // Check if artist exists
  const existingArtist = await prisma.artist.findUnique({
    where: { id: artistId },
  });

  if (!existingArtist) {
    throw data({ error: "Artist not found" }, { status: 404 });
  }

  // Update artist and create edit history in a transaction
  const { artist, edit } = await prisma.$transaction(async (tx) => {
    // Update artist
    const normalizedName = normalizeArtistName(name);
    const updatedArtist = await tx.artist.update({
      where: { id: artistId },
      data: {
        name: name.trim(),
        normalizedName,
        bio: bio !== undefined ? bio : undefined,
        genre: genre !== undefined ? genre : undefined,
        country: country !== undefined ? country : undefined,
        imageUrl: imageUrl !== undefined ? imageUrl : undefined,
        website: website !== undefined ? website : undefined,
      },
    });

    // Create edit history entry
    const artistEdit = await tx.artistEdit.create({
      data: {
        artistId,
        editedBy: userId,
        comment: comment || null,
        name: updatedArtist.name,
        bio: updatedArtist.bio,
        imageUrl: updatedArtist.imageUrl,
        website: updatedArtist.website,
        genre: updatedArtist.genre,
        country: updatedArtist.country,
      },
    });

    return { artist: updatedArtist, edit: artistEdit };
  });

  return data({ artist, edit });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
