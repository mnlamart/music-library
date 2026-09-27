import { data } from "react-router";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { type Route } from "./+types/albums.duplicates.ts";

export async function loader({ request }: Route.LoaderArgs) {
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
        message: "You must be a curator or admin to view duplicates",
      },
      { status: 403 },
    );
  }

  // Parse query parameters
  const url = new URL(request.url);
  const minTracks = parseInt(url.searchParams.get("minTracks") || "2", 10);

  // Find albums with duplicate artist+name combinations
  // Get all non-merged albums with track counts
  const allAlbums = await prisma.album.findMany({
    where: {
      mergedIntoId: null,
    },
    select: {
      id: true,
      name: true,
      artistId: true,
      year: true,
      artist: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          tracks: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Group by artistId+name in JavaScript
  const albumsByKey = new Map<string, typeof allAlbums>();
  for (const album of allAlbums) {
    const key = `${album.artistId}:${album.name}`;
    const existing = albumsByKey.get(key) || [];
    existing.push(album);
    albumsByKey.set(key, existing);
  }

  // Filter groups to only include duplicates with albums meeting minTracks threshold
  const validGroups = Array.from(albumsByKey.entries())
    .filter(([_, albums]) => albums.length > 1) // Only groups with duplicates
    .map(([_, albums]) => {
      // Filter by minTracks
      const filteredAlbums = albums.filter((album) => album._count.tracks >= minTracks);

      // Only return if at least one album meets threshold
      if (filteredAlbums.length === 0) {
        return null;
      }

      return {
        artistId: albums[0]!.artistId,
        artistName: albums[0]!.artist.name,
        name: albums[0]!.name,
        albums: filteredAlbums.map((album) => ({
          id: album.id,
          name: album.name,
          year: album.year,
          trackCount: album._count.tracks,
        })),
      };
    })
    .filter((g) => g !== null && g.albums.length > 1); // Ensure still duplicates after filtering

  return data({ groups: validGroups });
}
