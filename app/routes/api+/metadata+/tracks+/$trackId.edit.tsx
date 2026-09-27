import { data } from "react-router";
import { z } from "zod";
import { prisma } from "#app/utils/db.server.ts";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { type Route } from "./+types/$trackId.edit.ts";

// Validation schema for track edit
const EditTrackSchema = z.object({
  title: z.string().min(1, "Title is required"),
  artistId: z.string().min(1, "Artist ID is required"),
  albumId: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  trackNumber: z.number().int().nullable().optional(),
  albumArtist: z.string().nullable().optional(),
  bpm: z.number().int().nullable().optional(),
  label: z.string().nullable().optional(),
  isrc: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(), // ISO date string
  originalDate: z.string().nullable().optional(),
  originalYear: z.number().int().nullable().optional(),
  totalTracks: z.number().int().nullable().optional(),
  totalDiscs: z.number().int().nullable().optional(),
  lyrics: z.string().nullable().optional(),
  comment: z.string().optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  const userId = await requireCuratorRole(request);
  const { trackId } = params;

  if (!trackId) {
    throw data({ error: "Track ID is required" }, { status: 400 });
  }

  // Get and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    throw data({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request body
  const parseResult = EditTrackSchema.safeParse(body);
  if (!parseResult.success) {
    throw data(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const editData = parseResult.data;

  // Verify track exists
  const track = await prisma.track.findUnique({
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

  if (!track) {
    throw data({ error: "Track not found" }, { status: 404 });
  }

  // Verify artist exists
  const artist = await prisma.artist.findUnique({
    where: { id: editData.artistId },
    select: { id: true },
  });

  if (!artist) {
    throw data({ error: "Artist not found" }, { status: 404 });
  }

  // Verify album exists if provided
  if (editData.albumId) {
    const album = await prisma.album.findUnique({
      where: { id: editData.albumId },
      select: { id: true },
    });

    if (!album) {
      throw data({ error: "Album not found" }, { status: 404 });
    }
  }

  // Parse dates
  const releaseDate = editData.releaseDate ? new Date(editData.releaseDate) : null;
  const originalDate = editData.originalDate ? new Date(editData.originalDate) : null;

  // Perform update and create history entry in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create history entry with current state (before update)
    const editEntry = await tx.trackEdit.create({
      data: {
        trackId: track.id,
        editedBy: userId,
        comment: editData.comment || null,
        // Snapshot current state
        title: track.title,
        artistId: track.artistId,
        albumId: track.albumId,
        genre: track.genre,
        year: track.year,
        trackNumber: track.trackNumber,
        albumArtist: track.albumArtist,
        bpm: track.bpm,
        label: track.label,
        isrc: track.isrc,
        releaseDate: track.releaseDate,
        originalDate: track.originalDate,
        originalYear: track.originalYear,
        totalTracks: track.totalTracks,
        totalDiscs: track.totalDiscs,
        lyrics: track.lyrics,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
      },
    });

    // Update track with new data
    const updatedTrack = await tx.track.update({
      where: { id: trackId },
      data: {
        title: editData.title,
        artistId: editData.artistId,
        albumId: editData.albumId === undefined ? track.albumId : editData.albumId,
        genre: editData.genre === undefined ? track.genre : editData.genre,
        year: editData.year === undefined ? track.year : editData.year,
        trackNumber: editData.trackNumber === undefined ? track.trackNumber : editData.trackNumber,
        albumArtist: editData.albumArtist === undefined ? track.albumArtist : editData.albumArtist,
        bpm: editData.bpm === undefined ? track.bpm : editData.bpm,
        label: editData.label === undefined ? track.label : editData.label,
        isrc: editData.isrc === undefined ? track.isrc : editData.isrc,
        releaseDate: editData.releaseDate === undefined ? track.releaseDate : releaseDate,
        originalDate: editData.originalDate === undefined ? track.originalDate : originalDate,
        originalYear:
          editData.originalYear === undefined ? track.originalYear : editData.originalYear,
        totalTracks: editData.totalTracks === undefined ? track.totalTracks : editData.totalTracks,
        totalDiscs: editData.totalDiscs === undefined ? track.totalDiscs : editData.totalDiscs,
        lyrics: editData.lyrics === undefined ? track.lyrics : editData.lyrics,
      },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
          },
        },
        albumRecord: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      track: updatedTrack,
      edit: editEntry,
    };
  });

  return data(result);
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
