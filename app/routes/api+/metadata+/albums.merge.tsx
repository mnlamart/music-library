import { data } from "react-router";
import { z } from "zod";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { type Route } from "./+types/albums.merge.ts";

const MergeAlbumSchema = z.object({
  sourceId: z.string().min(1, "Source album ID is required"),
  targetId: z.string().min(1, "Target album ID is required"),
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
        message: "You must be a curator or admin to merge albums",
      },
      { status: 403 },
    );
  }

  // Parse and validate request body
  const body = await request.json();
  const result = MergeAlbumSchema.safeParse(body);

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
        message: "Cannot merge an album into itself",
      },
      { status: 400 },
    );
  }

  // Perform merge in transaction
  const result2 = await prisma.$transaction(async (tx) => {
    // Check both albums exist
    const [sourceAlbum, targetAlbum] = await Promise.all([
      tx.album.findUnique({ where: { id: sourceId } }),
      tx.album.findUnique({ where: { id: targetId } }),
    ]);

    if (!sourceAlbum) {
      throw data({ error: "Source album not found" }, { status: 404 });
    }

    if (!targetAlbum) {
      throw data({ error: "Target album not found" }, { status: 404 });
    }

    // Prevent circular merge - target must not already be merged
    if (targetAlbum.mergedIntoId) {
      throw data(
        {
          error: "Invalid merge",
          message: "Target album is already merged into another album",
        },
        { status: 400 },
      );
    }

    // Get count for response
    const trackCount = await tx.track.count({ where: { albumId: sourceId } });

    // Update all tracks
    await tx.track.updateMany({
      where: { albumId: sourceId },
      data: { albumId: targetId },
    });

    // Mark source as merged
    const mergedAlbum = await tx.album.update({
      where: { id: sourceId },
      data: {
        mergedIntoId: targetId,
        mergedAt: new Date(),
        mergedBy: userId,
      },
    });

    // Create album edit entry for the merge operation
    await tx.albumEdit.create({
      data: {
        albumId: sourceId,
        editedBy: userId,
        comment: `Merged into ${targetAlbum.name}: ${comment}`,
        name: mergedAlbum.name,
        artistId: mergedAlbum.artistId,
        year: mergedAlbum.year,
        coverImageId: mergedAlbum.coverImageId,
      },
    });

    return {
      tracksUpdated: trackCount,
      targetAlbum,
    };
  });

  return data({
    success: true,
    tracksUpdated: result2.tracksUpdated,
    targetAlbum: result2.targetAlbum,
  });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
