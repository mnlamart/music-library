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
  // Group by artistId and name to find duplicates
  const duplicateGroups = await prisma.album.groupBy({
    by: ["artistId", "name"],
    where: {
      mergedIntoId: null, // Exclude already-merged albums
    },
    having: {
      artistId: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  // For each group, fetch album details with track counts
  const groups = await Promise.all(
    duplicateGroups.map(async (group) => {
      const albums = await prisma.album.findMany({
        where: {
          artistId: group.artistId,
          name: group.name,
          mergedIntoId: null,
        },
        select: {
          id: true,
          name: true,
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

      // Filter by minTracks
      const filteredAlbums = albums.filter((album) => album._count.tracks >= minTracks);

      // Only return groups that have at least one album meeting the threshold
      if (filteredAlbums.length === 0) {
        return null;
      }

      return {
        artistId: group.artistId,
        artistName: albums[0]?.artist.name || "",
        name: group.name,
        albums: filteredAlbums.map((album) => ({
          id: album.id,
          name: album.name,
          year: album.year,
          trackCount: album._count.tracks,
        })),
      };
    }),
  );

  // Filter out null groups and ensure each group still has duplicates after filtering
  const validGroups = groups.filter((g) => g !== null && g.albums.length > 1);

  return data({ groups: validGroups });
}
