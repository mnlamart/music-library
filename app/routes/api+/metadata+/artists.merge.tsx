import { data } from "react-router";
import { z } from "zod";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { type Route } from "./+types/artists.merge.ts";

const MergeArtistSchema = z.object({
  sourceId: z.string().min(1, "Source artist ID is required"),
  targetId: z.string().min(1, "Target artist ID is required"),
  keepAsAlias: z.boolean(),
  comment: z.string().min(1, "Comment is required to explain merge reason"),
});

export async function action({ request }: Route.ActionArgs) {
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
        message: "You must be a curator or admin to merge artists",
      },
      { status: 403 },
    );
  }

  // Parse and validate request body
  const body = await request.json();
  const result = MergeArtistSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        issues: result.error.issues,
      },
      { status: 400 },
    );
  }

  const { sourceId, targetId, comment } = result.data;

  // Prevent self-merge
  if (sourceId === targetId) {
    throw data(
      {
        error: "Invalid merge",
        message: "Cannot merge an artist into itself",
      },
      { status: 400 },
    );
  }

  // Perform merge in transaction
  const result2 = await prisma.$transaction(async (tx) => {
    // Check both artists exist
    const [sourceArtist, targetArtist] = await Promise.all([
      tx.artist.findUnique({ where: { id: sourceId } }),
      tx.artist.findUnique({ where: { id: targetId } }),
    ]);

    if (!sourceArtist) {
      throw data({ error: "Source artist not found" }, { status: 404 });
    }

    if (!targetArtist) {
      throw data({ error: "Target artist not found" }, { status: 404 });
    }

    // Prevent circular merge - target must not already be merged
    if (targetArtist.mergedIntoId) {
      throw data(
        {
          error: "Invalid merge",
          message: "Target artist is already merged into another artist",
        },
        { status: 400 },
      );
    }

    // Get counts for response
    const trackCount = await tx.track.count({ where: { artistId: sourceId } });
    const albumCount = await tx.album.count({ where: { artistId: sourceId } });

    // Update all tracks
    await tx.track.updateMany({
      where: { artistId: sourceId },
      data: { artistId: targetId },
    });

    // Update all albums
    await tx.album.updateMany({
      where: { artistId: sourceId },
      data: { artistId: targetId },
    });

    // Mark source as merged
    const mergedArtist = await tx.artist.update({
      where: { id: sourceId },
      data: {
        mergedIntoId: targetId,
        mergedAt: new Date(),
        mergedBy: userId,
      },
    });

    // Create artist edit entry for the merge operation
    await tx.artistEdit.create({
      data: {
        artistId: sourceId,
        editedBy: userId,
        comment: `Merged into ${targetArtist.name}: ${comment}`,
        name: mergedArtist.name,
        bio: mergedArtist.bio,
        imageUrl: mergedArtist.imageUrl,
        website: mergedArtist.website,
        genre: mergedArtist.genre,
        country: mergedArtist.country,
      },
    });

    return {
      tracksUpdated: trackCount,
      albumsUpdated: albumCount,
      targetArtist,
    };
  });

  return data({
    success: true,
    tracksUpdated: result2.tracksUpdated,
    albumsUpdated: result2.albumsUpdated,
    targetArtist: result2.targetArtist,
  });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
