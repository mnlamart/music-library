import { data } from "react-router";
import { z } from "zod";
import { prisma } from "#app/utils/db.server.ts";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import {
  primaryGenreName,
  resolveOrderedGenres,
  snapshotGenreIds,
  type GenreRef,
} from "#app/utils/track-genres.server.ts";
import { type Route } from "./+types/bulk-edit.ts";

// Validation schema for changes object (all fields optional, but at least one required)
const ChangesSchema = z
  .object({
    title: z.string().min(1, "Title cannot be empty").optional(),
    artistId: z.string().min(1, "Artist ID cannot be empty").optional(),
    albumId: z.string().nullable().optional(),
    genre: z.string().nullable().optional(),
    genreIds: z.array(z.string()).optional(),
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
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided in changes",
  });

// Validation schema for bulk edit request
const BulkEditSchema = z.object({
  trackIds: z
    .array(z.string())
    .min(1, "At least one track ID is required")
    .max(500, "Maximum 500 tracks per request"),
  changes: ChangesSchema,
  comment: z.string().min(1, "Comment is required for bulk operations"),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  const userId = await requireCuratorRole(request);

  // Get and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    throw data({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate request body
  const parseResult = BulkEditSchema.safeParse(body);
  if (!parseResult.success) {
    throw data(
      {
        error: "Validation failed",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { trackIds, changes, comment } = parseResult.data;

  // Validate all tracks exist first (all-or-nothing approach)
  const tracks = await prisma.track.findMany({
    where: { id: { in: trackIds } },
    select: {
      id: true,
      title: true,
      artistId: true,
      albumId: true,
      genre: true,
      genres: {
        select: {
          id: true,
          name: true,
        },
      },
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

  // Check if all tracks exist
  if (tracks.length !== trackIds.length) {
    const foundIds = new Set(tracks.map((t) => t.id));
    const missingIds = trackIds.filter((id) => !foundIds.has(id));
    throw data(
      {
        error: "Some tracks not found",
        missingTrackIds: missingIds,
      },
      { status: 404 },
    );
  }

  // Verify artist exists if artistId is being changed
  if (changes.artistId) {
    const artist = await prisma.artist.findUnique({
      where: { id: changes.artistId },
      select: { id: true },
    });

    if (!artist) {
      throw data({ error: "Artist not found" }, { status: 404 });
    }
  }

  // Verify album exists if albumId is being changed and is not null
  if (changes.albumId !== undefined && changes.albumId !== null) {
    const album = await prisma.album.findUnique({
      where: { id: changes.albumId },
      select: { id: true },
    });

    if (!album) {
      throw data({ error: "Album not found" }, { status: 404 });
    }
  }

  let resolvedGenres: GenreRef[] | undefined;
  if (changes.genreIds !== undefined) {
    const resolved = await resolveOrderedGenres(changes.genreIds);
    if (!resolved.ok) {
      throw data({ error: "One or more genres not found" }, { status: 404 });
    }
    resolvedGenres = resolved.genres;
  }

  // Parse dates if provided
  const releaseDate =
    changes.releaseDate !== undefined
      ? changes.releaseDate
        ? new Date(changes.releaseDate)
        : null
      : undefined;
  const originalDate =
    changes.originalDate !== undefined
      ? changes.originalDate
        ? new Date(changes.originalDate)
        : null
      : undefined;

  // Perform bulk update in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const updatedTracks = [];

    for (const track of tracks) {
      // Create edit history entry with current state (before update)
      await tx.trackEdit.create({
        data: {
          trackId: track.id,
          editedBy: userId,
          comment: comment,
          // Snapshot current state
          title: track.title,
          artistId: track.artistId,
          albumId: track.albumId,
          genre: track.genre,
          genreIds: snapshotGenreIds(track.genres, track.genre),
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
      });

      // Build update data object with only fields that are being changed
      const trackUpdateData: any = {};

      if (changes.title !== undefined) trackUpdateData.title = changes.title;
      if (changes.artistId !== undefined) trackUpdateData.artistId = changes.artistId;
      if (changes.albumId !== undefined) trackUpdateData.albumId = changes.albumId;
      if (resolvedGenres !== undefined) {
        trackUpdateData.genre = primaryGenreName(resolvedGenres);
        trackUpdateData.genres = {
          set: resolvedGenres.map((genre) => ({ id: genre.id })),
        };
      } else if (changes.genre !== undefined) {
        trackUpdateData.genre = changes.genre;
      }
      if (changes.year !== undefined) trackUpdateData.year = changes.year;
      if (changes.trackNumber !== undefined) trackUpdateData.trackNumber = changes.trackNumber;
      if (changes.albumArtist !== undefined) trackUpdateData.albumArtist = changes.albumArtist;
      if (changes.bpm !== undefined) trackUpdateData.bpm = changes.bpm;
      if (changes.label !== undefined) trackUpdateData.label = changes.label;
      if (changes.isrc !== undefined) trackUpdateData.isrc = changes.isrc;
      if (releaseDate !== undefined) trackUpdateData.releaseDate = releaseDate;
      if (originalDate !== undefined) trackUpdateData.originalDate = originalDate;
      if (changes.originalYear !== undefined) trackUpdateData.originalYear = changes.originalYear;
      if (changes.totalTracks !== undefined) trackUpdateData.totalTracks = changes.totalTracks;
      if (changes.totalDiscs !== undefined) trackUpdateData.totalDiscs = changes.totalDiscs;
      if (changes.lyrics !== undefined) trackUpdateData.lyrics = changes.lyrics;

      // Update track
      const updatedTrack = await tx.track.update({
        where: { id: track.id },
        data: trackUpdateData,
        select: {
          id: true,
          title: true,
          artistId: true,
        },
      });

      updatedTracks.push(updatedTrack);
    }

    return updatedTracks;
  });

  return data({
    success: true,
    updatedCount: result.length,
    updated: result.length,
  });
}

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}
