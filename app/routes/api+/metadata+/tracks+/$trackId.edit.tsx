import { data } from "react-router";
import { z } from "zod";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/$trackId.edit.ts";

const EditTrackSchema = z.object({
  title: z.string().min(1, "Title is required"),
  artistId: z.string().min(1, "Artist is required"),
  albumId: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  trackNumber: z.number().int().nullable().optional(),
  albumArtist: z.string().nullable().optional(),
  bpm: z.number().int().nullable().optional(),
  label: z.string().nullable().optional(),
  isrc: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  originalDate: z.string().nullable().optional(),
  originalYear: z.number().int().nullable().optional(),
  totalTracks: z.number().int().nullable().optional(),
  totalDiscs: z.number().int().nullable().optional(),
  lyrics: z.string().nullable().optional(),
  comment: z.string().optional(),
});

export async function clientAction() {
  throw new Error("This route should only be called on the server");
}

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireCuratorOrAdmin(request);
  const trackId = params.trackId;

  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const result = EditTrackSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        details: result.error.issues,
      },
      { status: 400 },
    );
  }

  // Verify track exists
  const existingTrack = await prisma.track.findUnique({
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

  if (!existingTrack) {
    throw data({ error: "Track not found" }, { status: 404 });
  }

  // Verify artist exists
  const artist = await prisma.artist.findUnique({
    where: { id: result.data.artistId },
  });

  if (!artist) {
    throw data({ error: "Artist not found" }, { status: 404 });
  }

  // Verify album exists if provided
  if (result.data.albumId) {
    const album = await prisma.album.findUnique({
      where: { id: result.data.albumId },
    });

    if (!album) {
      throw data({ error: "Album not found" }, { status: 404 });
    }
  }

  // Create history entry with current state
  const trackEdit = await prisma.trackEdit.create({
    data: {
      trackId,
      editedBy: userId,
      comment: result.data.comment ?? null,
      // Snapshot current state before update
      title: existingTrack.title,
      artistId: existingTrack.artistId,
      albumId: existingTrack.albumId,
      genre: existingTrack.genre,
      year: existingTrack.year,
      trackNumber: existingTrack.trackNumber,
      albumArtist: existingTrack.albumArtist,
      bpm: existingTrack.bpm,
      label: existingTrack.label,
      isrc: existingTrack.isrc,
      releaseDate: existingTrack.releaseDate,
      originalDate: existingTrack.originalDate,
      originalYear: existingTrack.originalYear,
      totalTracks: existingTrack.totalTracks,
      totalDiscs: existingTrack.totalDiscs,
      lyrics: existingTrack.lyrics,
    },
  });

  // Parse dates if provided
  const parsedReleaseDate = result.data.releaseDate ? new Date(result.data.releaseDate) : null;
  const parsedOriginalDate = result.data.originalDate ? new Date(result.data.originalDate) : null;

  // Update track with new values
  const updatedTrack = await prisma.track.update({
    where: { id: trackId },
    data: {
      title: result.data.title,
      artistId: result.data.artistId,
      albumId: result.data.albumId ?? null,
      genre: result.data.genre ?? null,
      year: result.data.year ?? null,
      trackNumber: result.data.trackNumber ?? null,
      albumArtist: result.data.albumArtist ?? null,
      bpm: result.data.bpm ?? null,
      label: result.data.label ?? null,
      isrc: result.data.isrc ?? null,
      releaseDate: parsedReleaseDate,
      originalDate: parsedOriginalDate,
      originalYear: result.data.originalYear ?? null,
      totalTracks: result.data.totalTracks ?? null,
      totalDiscs: result.data.totalDiscs ?? null,
      lyrics: result.data.lyrics ?? null,
    },
    include: {
      artist: true,
      albumRecord: true,
      coverImage: true,
    },
  });

  return Response.json({
    track: updatedTrack,
    edit: trackEdit,
  });
}
