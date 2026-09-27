import { data } from "react-router";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserWithRole } from "#app/utils/permissions.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { deleteFile } from "#app/utils/storage.server.ts";
import { type Route } from "./+types/tracks.$trackId.ts";

export async function action({ request, params }: Route.ActionArgs) {
  await requireUserWithRole(request, "admin");

  const { trackId } = params;

  if (request.method !== "DELETE") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!trackId) {
    throw data({ error: "Track ID is required" }, { status: 400 });
  }

  // Get track with all related data
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: {
      audioFiles: true,
      userTracks: true,
      playlists: true,
      servicePlaylistTracks: true,
    },
  });

  if (!track) {
    throw data({ error: "Track not found" }, { status: 404 });
  }

  // Check if any audio files are shared with other tracks
  const audioFilesToConsider = track.audioFiles;
  const objectKeysToDelete: string[] = [];
  const objectKeysPreserved: string[] = [];

  for (const audioFile of audioFilesToConsider) {
    // Check if this objectKey is used by other tracks
    const otherTracksWithSameObject = await prisma.trackAudioFile.count({
      where: {
        objectKey: audioFile.objectKey,
        trackId: { not: trackId },
      },
    });

    // Only delete from S3 if no other tracks reference this object
    if (otherTracksWithSameObject === 0) {
      objectKeysToDelete.push(audioFile.objectKey);
    } else {
      objectKeysPreserved.push(audioFile.objectKey);
      console.log(
        `⚠️ Preserving S3 object (used by ${otherTracksWithSameObject} other track${otherTracksWithSameObject > 1 ? "s" : ""}): ${audioFile.objectKey}`,
      );
    }
  }

  // Delete the track (cascade will handle related records)
  await prisma.track.delete({
    where: { id: trackId },
  });

  // Delete S3 objects that are no longer referenced
  for (const objectKey of objectKeysToDelete) {
    try {
      await deleteFile(objectKey);
      console.log(`✅ Deleted S3 object: ${objectKey}`);
    } catch (error) {
      console.error(`❌ Failed to delete S3 object ${objectKey}:`, error);
      // Continue even if S3 deletion fails - track is already deleted from DB
    }
  }

  // Log summary
  if (objectKeysPreserved.length > 0 && objectKeysToDelete.length > 0) {
    console.log(
      `📊 Track deletion summary: Deleted ${objectKeysToDelete.length} S3 object(s), preserved ${objectKeysPreserved.length} shared object(s)`,
    );
  } else if (objectKeysPreserved.length > 0) {
    console.log(
      `📊 Track deletion summary: All ${objectKeysPreserved.length} S3 object(s) preserved (shared with other tracks)`,
    );
  }

  return data({
    success: true,
    trackId,
    objectsDeleted: objectKeysToDelete.length,
    objectsPreserved: objectKeysPreserved.length,
  });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
