/**
 * Server-side functions for Admin Database Quality & Health Monitoring
 */

import { prisma } from "#app/utils/db.server.ts";
import { METRIC_WEIGHTS, type MetricTarget, METRIC_TARGETS, formatBytes } from "./database-quality.ts";


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

export async function getMetadataIssues(): Promise<MetadataIssues> {
  const currentYear = new Date().getFullYear();

  const [
    placeholderTitles,
    suspiciousDurations,
    missingEssentials,
    invalidYears,
    artistsWithoutGenre,
  ] = await Promise.all([
    prisma.track.count({
      where: {
        OR: [
          { title: { in: ["Unknown", "Track", "Untitled", "N/A", "", "Audio"] } },
          { title: { startsWith: "Track " } },
          { title: { startsWith: "Untitled" } },
        ],
      },
    }),
    prisma.track.count({
      where: {
        OR: [{ duration: { lt: 5000 } }, { duration: { gt: 7200000 } }],
      },
    }),
    prisma.track.count({
      where: {
        OR: [{ duration: null }, { coverImageId: null }, { year: null }],
      },
    }),
    prisma.track.count({
      where: {
        year: {
          not: null,
          OR: [{ lt: 1850 }, { gt: currentYear + 1 }],
        },
      },
    }),
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
