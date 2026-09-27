import { data } from "react-router";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { type Route } from "./+types/artists.duplicates.ts";

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

  // Find artists with duplicate normalized names
  // First, get all normalized names that have more than one artist
  const duplicateGroups = await prisma.artist.groupBy({
    by: ["normalizedName"],
    where: {
      mergedIntoId: null, // Exclude already-merged artists
    },
    having: {
      normalizedName: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  // For each group, fetch artist details with track and album counts
  const groups = await Promise.all(
    duplicateGroups.map(async (group) => {
      const artists = await prisma.artist.findMany({
        where: {
          normalizedName: group.normalizedName,
          mergedIntoId: null,
        },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              tracks: true,
              albums: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      // Filter by minTracks
      const filteredArtists = artists.filter((artist) => artist._count.tracks >= minTracks);

      // Only return groups that have at least one artist meeting the threshold
      if (filteredArtists.length === 0) {
        return null;
      }

      return {
        normalizedName: group.normalizedName,
        artists: filteredArtists.map((artist) => ({
          id: artist.id,
          name: artist.name,
          trackCount: artist._count.tracks,
          albumCount: artist._count.albums,
        })),
      };
    }),
  );

  // Filter out null groups and ensure each group still has duplicates after filtering
  const validGroups = groups.filter((g) => g !== null && g.artists.length > 1);

  return data({ groups: validGroups });
}
