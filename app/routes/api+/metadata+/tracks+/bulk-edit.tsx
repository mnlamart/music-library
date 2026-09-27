import { data } from "react-router";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/bulk-edit";

interface BulkEditRequest {
  trackIds: string[];
  changes: {
    artistId?: string;
    albumName?: string;
    genre?: string;
    year?: number;
    albumArtist?: string;
    trackNumber?: number;
    bpm?: number;
    label?: string;
  };
  comment: string;
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireCuratorOrAdmin(request);

  const formData = await request.formData();
  const trackIdsJson = formData.get("trackIds");
  const changesJson = formData.get("changes");
  const comment = formData.get("comment");

  if (
    typeof trackIdsJson !== "string" ||
    typeof changesJson !== "string" ||
    typeof comment !== "string"
  ) {
    return data({ success: false, error: "Invalid request data" }, { status: 400 });
  }

  const trackIds = JSON.parse(trackIdsJson) as string[];
  const changes = JSON.parse(changesJson) as BulkEditRequest["changes"];

  if (!trackIds || trackIds.length === 0) {
    return data({ success: false, error: "No tracks selected" }, { status: 400 });
  }

  if (!comment.trim()) {
    return data({ success: false, error: "Comment is required" }, { status: 400 });
  }

  const errors: Array<{ trackId: string; error: string }> = [];
  let updated = 0;

  try {
    // Process each track
    for (const trackId of trackIds) {
      try {
        const track = await prisma.track.findUnique({
          where: { id: trackId },
          select: {
            id: true,
            title: true,
            artistId: true,
            albumRecordId: true,
            genre: true,
            year: true,
          },
        });

        if (!track) {
          errors.push({ trackId, error: "Track not found" });
          continue;
        }

        // Build the update data
        const updateData: any = {};

        if (changes.artistId) {
          updateData.artistId = changes.artistId;
        }

        if (changes.genre !== undefined) {
          updateData.genre = changes.genre;
        }

        if (changes.year !== undefined) {
          updateData.year = changes.year;
        }

        // Only update if there are changes
        if (Object.keys(updateData).length > 0) {
          // Get the updated track to create a snapshot
          const updatedTrack = await prisma.track.update({
            where: { id: trackId },
            data: updateData,
            select: {
              id: true,
              title: true,
              artistId: true,
              albumRecordId: true,
              genre: true,
              year: true,
              trackNumber: true,
              albumArtist: true,
              bpm: true,
              label: true,
              isrc: true,
              releaseDate: true,
              originalDate: true,
              originalYear: true,
              totalTracks: true,
              totalDiscs: true,
              lyrics: true,
            },
          });

          // Create edit history record with full snapshot
          await prisma.trackEdit.create({
            data: {
              trackId,
              editedBy: userId,
              comment,
              title: updatedTrack.title,
              artistId: updatedTrack.artistId,
              albumId: updatedTrack.albumRecordId,
              genre: updatedTrack.genre,
              year: updatedTrack.year,
              trackNumber: updatedTrack.trackNumber,
              albumArtist: updatedTrack.albumArtist,
              bpm: updatedTrack.bpm,
              label: updatedTrack.label,
              isrc: updatedTrack.isrc,
              releaseDate: updatedTrack.releaseDate,
              originalDate: updatedTrack.originalDate,
              originalYear: updatedTrack.originalYear,
              totalTracks: updatedTrack.totalTracks,
              totalDiscs: updatedTrack.totalDiscs,
              lyrics: updatedTrack.lyrics,
            },
          });

          updated++;
        }
      } catch (error) {
        console.error(`Error updating track ${trackId}:`, error);
        errors.push({
          trackId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return data({
      success: true,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Bulk edit error:", error);
    return data(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update tracks",
      },
      { status: 500 },
    );
  }
}
