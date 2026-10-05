/**
 * Server-side functions for Admin Database Quality & Health Monitoring
 */

import { prisma } from "#app/utils/db.server.ts";
import {
  METRIC_WEIGHTS,
  type MetricTarget,
  METRIC_TARGETS,
  formatBytes,
} from "./database-quality.ts";

export function getHealthColor(percentage: number): "green" | "yellow" | "red" {
  if (percentage >= 90) return "green";
  if (percentage >= 70) return "yellow";
  return "red";
}

export function getHealthLabel(percentage: number): string {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 70) return "Needs Work";
  return "Poor";
}

export interface QualityMetrics {
  audio: number;
  covers: number;
  duration: number;
  album: number;
  year: number;
  genre: number;
  lyrics: number;
}

export function calculateHealthScore(metrics: QualityMetrics): number {
  return (
    metrics.audio * METRIC_WEIGHTS.audio +
    metrics.covers * METRIC_WEIGHTS.covers +
    metrics.duration * METRIC_WEIGHTS.duration +
    metrics.album * METRIC_WEIGHTS.album +
    metrics.year * METRIC_WEIGHTS.year +
    metrics.genre * METRIC_WEIGHTS.genre +
    metrics.lyrics * METRIC_WEIGHTS.lyrics
  );
}

export interface MetadataIssues {
  placeholderTitles: number;
  suspiciousDurations: number;
  missingEssentials: number;
  invalidYears: number;
  artistsWithoutGenre: number;
}

const placeholderTitleWhere = {
  OR: [
    { title: { in: ["Unknown", "Track", "Untitled", "N/A", "", "Audio"] } },
    { title: { startsWith: "Track " } },
    { title: { startsWith: "Untitled" } },
  ],
};

const suspiciousDurationWhere = {
  // Track.duration is stored in seconds, not milliseconds.
  OR: [{ duration: { lt: 5 } }, { duration: { gt: 2 * 60 * 60 } }],
};

const missingEssentialsWhere = {
  OR: [{ duration: null }, { coverImageId: null }, { year: null }],
};

function invalidYearWhere(currentYear: number) {
  return {
    AND: [
      { year: { not: null } },
      {
        OR: [{ year: { lt: 1850 } }, { year: { gt: currentYear + 1 } }],
      },
    ],
  };
}

/** Tracks matching any track-level metadata issue. Excludes artist-only rows. */
function trackLevelMetadataIssueWhere(currentYear: number) {
  return {
    OR: [
      placeholderTitleWhere,
      suspiciousDurationWhere,
      missingEssentialsWhere,
      invalidYearWhere(currentYear),
    ],
  };
}

export async function getMetadataIssues(): Promise<MetadataIssues> {
  const currentYear = new Date().getFullYear();

  const [
    placeholderTitles,
    suspiciousDurations,
    missingEssentials,
    invalidYears,
    artistsWithoutGenre,
  ] = await Promise.all([
    prisma.track.count({ where: placeholderTitleWhere }),
    prisma.track.count({ where: suspiciousDurationWhere }),
    prisma.track.count({ where: missingEssentialsWhere }),
    prisma.track.count({ where: invalidYearWhere(currentYear) }),
    prisma.artist.count({
      where: {
        OR: [{ genre: null }, { genre: "" }],
        tracks: {
          some: {},
        },
      },
    }),
  ]);

  return {
    placeholderTitles,
    suspiciousDurations,
    missingEssentials,
    invalidYears,
    artistsWithoutGenre,
  };
}

/** Distinct tracks with at least one track-level metadata issue. */
export async function countTracksWithMetadataIssues(): Promise<number> {
  const currentYear = new Date().getFullYear();
  return prisma.track.count({ where: trackLevelMetadataIssueWhere(currentYear) });
}

export interface StorageStats {
  totalBytes: number;
  totalFiles: number;
  avgFileSize: number;
  uniqueTracks: number;
  formatStats: Array<{
    format: string;
    fileCount: number;
    totalBytes: number;
    avgBytes: number;
    percentOfTotal: number;
  }>;
  dedup: {
    totalRecords: number;
    uniqueFiles: number;
    duplicatesAvoided: number;
    storageSaved: number;
  };
  largestFiles: Array<{
    id: string;
    objectKey: string;
    format: string | null;
    fileSize: number;
    trackId: string;
    trackTitle: string;
    artistName: string;
  }>;
}

export async function getStorageStats(): Promise<StorageStats> {
  const allFiles = await prisma.trackAudioFile.findMany({
    select: {
      fileSize: true,
      trackId: true,
      contentHash: true,
    },
  });

  const totalBytes = allFiles.reduce((sum, f) => sum + (f.fileSize || 0), 0);
  const totalFiles = allFiles.length;
  const avgFileSize = totalFiles > 0 ? totalBytes / totalFiles : 0;
  const uniqueTracks = new Set(allFiles.map((f) => f.trackId)).size;

  const formatGroups = await prisma.trackAudioFile.groupBy({
    by: ["format"],
    // eslint-disable-next-line no-underscore-dangle
    _sum: { fileSize: true },
    _count: true,
    // eslint-disable-next-line no-underscore-dangle
    _avg: { fileSize: true },
  });

  const formatStats = formatGroups
    .filter((g) => g.format !== null)
    .map((g) => ({
      format: g.format!,
      fileCount: g._count,
      // eslint-disable-next-line no-underscore-dangle
      totalBytes: g._sum.fileSize || 0,
      // eslint-disable-next-line no-underscore-dangle
      avgBytes: g._avg.fileSize || 0,
      // eslint-disable-next-line no-underscore-dangle
      percentOfTotal: totalBytes > 0 ? ((g._sum.fileSize || 0) / totalBytes) * 100 : 0,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes);

  const filesWithHash = allFiles.filter((f) => f.contentHash !== null);
  const uniqueHashes = new Set(filesWithHash.map((f) => f.contentHash)).size;
  const duplicatesAvoided = filesWithHash.length - uniqueHashes;

  const hashGroups = new Map<string, number[]>();
  for (const file of filesWithHash) {
    if (file.contentHash) {
      if (!hashGroups.has(file.contentHash)) {
        hashGroups.set(file.contentHash, []);
      }
      hashGroups.get(file.contentHash)!.push(file.fileSize || 0);
    }
  }

  let storageSaved = 0;
  for (const sizes of hashGroups.values()) {
    if (sizes.length > 1) {
      const size = sizes[0] || 0;
      storageSaved += (sizes.length - 1) * size;
    }
  }

  const largestFilesData = await prisma.trackAudioFile.findMany({
    where: { fileSize: { not: null } },
    orderBy: { fileSize: "desc" },
    take: 10,
    select: {
      id: true,
      objectKey: true,
      format: true,
      fileSize: true,
      trackId: true,
      track: {
        select: {
          title: true,
          artist: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const largestFiles = largestFilesData.map((f) => ({
    id: f.id,
    objectKey: f.objectKey,
    format: f.format,
    fileSize: f.fileSize || 0,
    trackId: f.trackId,
    trackTitle: f.track.title,
    artistName: f.track.artist.name,
  }));

  return {
    totalBytes,
    totalFiles,
    avgFileSize,
    uniqueTracks,
    formatStats,
    dedup: {
      totalRecords: totalFiles,
      uniqueFiles: uniqueHashes,
      duplicatesAvoided,
      storageSaved,
    },
    largestFiles,
  };
}

export async function getDuplicateTracksCount(): Promise<number> {
  const duplicateHashes = await prisma.trackAudioFile.groupBy({
    by: ["contentHash"],
    _count: true,
    having: {
      contentHash: {
        _count: {
          gt: 1,
        },
      },
    },
    where: {
      contentHash: { not: null },
    },
  });

  return duplicateHashes.length;
}

export async function getOrphanedFilesCount(): Promise<number> {
  return 0;
}

/** Score and color for the admin overview. Same weights as the quality page. */
export async function getDatabaseHealthSummary(): Promise<{
  score: number;
  color: "green" | "yellow" | "red";
}> {
  const [
    totalTracks,
    tracksWithAudio,
    tracksWithCovers,
    tracksWithDuration,
    tracksWithAlbum,
    tracksWithYear,
    tracksWithGenre,
    tracksWithLyrics,
  ] = await Promise.all([
    prisma.track.count(),
    prisma.track.count({ where: { audioFiles: { some: {} } } }),
    prisma.track.count({ where: { coverImageId: { not: null } } }),
    prisma.track.count({ where: { duration: { not: null } } }),
    prisma.track.count({ where: { albumId: { not: null } } }),
    prisma.track.count({ where: { year: { not: null } } }),
    prisma.track.count({ where: { genre: { not: null } } }),
    prisma.track.count({ where: { lyrics: { not: null } } }),
  ]);

  const pct = (count: number) => (totalTracks > 0 ? (count / totalTracks) * 100 : 0);
  const score = Math.round(
    calculateHealthScore({
      audio: pct(tracksWithAudio),
      covers: pct(tracksWithCovers),
      duration: pct(tracksWithDuration),
      album: pct(tracksWithAlbum),
      year: pct(tracksWithYear),
      genre: pct(tracksWithGenre),
      lyrics: pct(tracksWithLyrics),
    }),
  );
  return { score, color: getHealthColor(score) };
}
