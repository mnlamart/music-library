import { data } from "react-router";
import { prisma } from "#app/utils/db.server.ts";
import { requireUserWithRole } from "#app/utils/permissions.server.ts";
import { type Route } from "./+types/duplicates.ts";

const PAGE_SIZE = 100;

interface DuplicateGroup {
  id: string;
  type: "exact";
  contentHash: string;
  tracks: Array<{
    trackId: string;
    title: string;
    artist: string;
    fileSize: number;
    contentHash: string;
    fileName: string | null;
    format: string | null;
    audioFileId: string;
  }>;
}

interface DuplicateStats {
  storageSaved: number;
  duplicateGroups: number;
  totalDuplicates: number;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  await requireUserWithRole(request, "admin");

  const filterParam = url.searchParams.get("filter") ?? "all";
  const filter: "all" | "exact" | "similar" = ["all", "exact", "similar"].includes(filterParam)
    ? (filterParam as "all" | "exact" | "similar")
    : "all";

  // Find all groups of duplicate audio files (same contentHash)
  const duplicateHashes = await prisma.$queryRaw<Array<{ contentHash: string; count: number }>>`
    SELECT contentHash, COUNT(*) as count
    FROM TrackAudioFile
    WHERE contentHash IS NOT NULL
    GROUP BY contentHash
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT ${PAGE_SIZE}
  `;

  // Get detailed info for each duplicate group
  const groups: DuplicateGroup[] = [];

  for (const { contentHash } of duplicateHashes) {
    const audioFiles = await prisma.trackAudioFile.findMany({
      where: { contentHash },
      include: {
        track: {
          select: {
            id: true,
            title: true,
            artist: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (audioFiles.length > 1) {
      groups.push({
        id: contentHash,
        type: "exact",
        contentHash,
        tracks: audioFiles.map((af) => ({
          trackId: af.track.id,
          title: af.track.title,
          artist: af.track.artist.name,
          fileSize: af.fileSize ?? 0,
          contentHash: af.contentHash ?? "",
          fileName: af.fileName,
          format: af.format,
          audioFileId: af.id,
        })),
      });
    }
  }

  // Apply filter
  const filteredGroups =
    filter === "similar"
      ? [] // No similar audio groups yet (waiting for issue #224)
      : groups;

  // Calculate statistics
  let totalDuplicates = 0;
  let storageSaved = 0;

  for (const group of filteredGroups) {
    const duplicateCount = group.tracks.length - 1; // All but the first one are duplicates
    totalDuplicates += duplicateCount;

    // Storage saved = file size × number of duplicates
    // (We only store one copy but have multiple references)
    const fileSize = group.tracks[0]?.fileSize ?? 0;
    storageSaved += fileSize * duplicateCount;
  }

  const stats: DuplicateStats = {
    storageSaved,
    duplicateGroups: filteredGroups.length,
    totalDuplicates,
  };

  return data({
    stats,
    groups: filteredGroups,
    filter,
  });
}
