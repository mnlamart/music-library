import { data } from "react-router";
import { z } from "zod";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/$trackId.restore.$editId.ts";

const RestoreSchema = z.object({
  comment: z.string().min(1, "Comment is required for restore"),
});

export async function clientAction() {
  throw new Error("This route should only be called on the server");
}

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireCuratorOrAdmin(request);
  const { trackId, editId } = params;

  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const result = RestoreSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        details: result.error.issues,
      },
      { status: 400 },
    );
  }

  // Verify track exists and get current state
  const currentTrack = await prisma.track.findUnique({
    where: { id: trackId },
    select: {
      id: true,
      title: true,
      artistId: true,
      albumId: true,
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

  if (!currentTrack) {
    throw data({ error: "Track not found" }, { status: 404 });
  }

  // Verify edit exists and get the state to restore to
  const editToRestore = await prisma.trackEdit.findUnique({
    where: { id: editId },
  });

  if (!editToRestore || editToRestore.trackId !== trackId) {
    throw data({ error: "Edit not found" }, { status: 404 });
  }

  // Create history entry with current state
  const trackEdit = await prisma.trackEdit.create({
    data: {
      trackId,
      editedBy: userId,
      comment: result.data.comment,
      // Snapshot current state before restore
      title: currentTrack.title,
      artistId: currentTrack.artistId,
      albumId: currentTrack.albumId,
      genre: currentTrack.genre,
      year: currentTrack.year,
      trackNumber: currentTrack.trackNumber,
      albumArtist: currentTrack.albumArtist,
      bpm: currentTrack.bpm,
      label: currentTrack.label,
      isrc: currentTrack.isrc,
      releaseDate: currentTrack.releaseDate,
      originalDate: currentTrack.originalDate,
      originalYear: currentTrack.originalYear,
      totalTracks: currentTrack.totalTracks,
      totalDiscs: currentTrack.totalDiscs,
      lyrics: currentTrack.lyrics,
    },
  });

  // Restore track to the previous state
  const restoredTrack = await prisma.track.update({
    where: { id: trackId },
    data: {
      title: editToRestore.title,
      artistId: editToRestore.artistId,
      albumId: editToRestore.albumId,
      genre: editToRestore.genre,
      year: editToRestore.year,
      trackNumber: editToRestore.trackNumber,
      albumArtist: editToRestore.albumArtist,
      bpm: editToRestore.bpm,
      label: editToRestore.label,
      isrc: editToRestore.isrc,
      releaseDate: editToRestore.releaseDate,
      originalDate: editToRestore.originalDate,
      originalYear: editToRestore.originalYear,
      totalTracks: editToRestore.totalTracks,
      totalDiscs: editToRestore.totalDiscs,
      lyrics: editToRestore.lyrics,
    },
    include: {
      artist: true,
      albumRecord: true,
      coverImage: true,
    },
  });

  return Response.json({
    track: restoredTrack,
    edit: trackEdit,
  });
}
