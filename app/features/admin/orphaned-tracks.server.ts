import { prisma } from "#app/utils/db.server.ts";
import { deleteFile } from "#app/utils/storage.server.ts";
import { scheduleQueueTick } from "#app/features/audio-archive/worker.server.ts";

const MAX_ROWS = 500;

export interface TrackWithoutAudio {
  id: string;
  title: string;
  artistName: string;
  serviceName: string;
  serviceDisplayName: string;
  createdAt: Date;
}

export interface TrackWithFailedJob {
  id: string;
  title: string;
  artistName: string;
  jobStatus: string;
  errorHistory: string;
  retryCount: number;
  lastAttemptAt: Date | null;
  errorCategory: string;
}

export interface OrphanedAudioFile {
  id: string;
  objectKey: string;
  fileSize: number | null;
  format: string | null;
  uploadedAt: Date;
}

export interface UnusedTrack {
  id: string;
  title: string;
  artistName: string;
  serviceName: string;
  serviceDisplayName: string;
  createdAt: Date;
}

export interface OrphanedTrackStats {
  missingAudio: number;
  failedDownloads: number;
  storageOrphans: number;
  unusedTracks: number;
  storageWasteMB: number;
}

function categorizeError(errorHistoryJson: string): string {
  try {
    const errors = JSON.parse(errorHistoryJson);
    if (Array.isArray(errors) && errors.length > 0) {
      const latest = errors[errors.length - 1] as { category?: string };
      return latest.category ?? "UNKNOWN";
    }
  } catch {
    return "UNKNOWN";
  }
  return "UNKNOWN";
}

export async function getOrphanedTrackStats(
  unusedTracksAgeDays: number | null = 30,
): Promise<OrphanedTrackStats> {
  const missingAudio = await prisma.track.count({
    where: { audioFiles: { none: {} } },
  });

  const failedDownloads = await prisma.archiveJob.count({
    where: { status: "failed" },
  });

  const storageOrphansResult = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count
    FROM TrackAudioFile taf
    LEFT JOIN Track t ON taf.trackId = t.id
    WHERE t.id IS NULL
  `;
  const storageOrphans = Number(storageOrphansResult[0]?.count ?? 0);

  const orphanedFilesSize = await prisma.$queryRaw<Array<{ totalSize: bigint | null }>>`
    SELECT SUM(taf.fileSize) as totalSize
    FROM TrackAudioFile taf
    LEFT JOIN Track t ON taf.trackId = t.id
    WHERE t.id IS NULL
  `;
  const storageWasteBytes = Number(orphanedFilesSize[0]?.totalSize ?? 0);
  const storageWasteMB = Math.round(storageWasteBytes / (1024 * 1024));

  const ageFilter =
    unusedTracksAgeDays !== null
      ? new Date(Date.now() - unusedTracksAgeDays * 24 * 60 * 60 * 1000)
      : new Date(0);

  const unusedTracks = await prisma.track.count({
    where: {
      userTracks: { none: {} },
      playlists: { none: {} },
      createdAt: { lt: ageFilter },
    },
  });

  return {
    missingAudio,
    failedDownloads,
    storageOrphans,
    unusedTracks,
    storageWasteMB,
  };
}

export async function getTracksWithoutAudio(
  serviceFilter: string | null = null,
): Promise<TrackWithoutAudio[]> {
  const where = {
    audioFiles: { none: {} },
    ...(serviceFilter && serviceFilter !== "all"
      ? { service: { name: serviceFilter } }
      : {}),
  };

  const tracks = await prisma.track.findMany({
    where,
    take: MAX_ROWS,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      artist: { select: { name: true } },
      service: { select: { name: true, displayName: true } },
    },
  });

  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artistName: track.artist.name,
    serviceName: track.service.name,
    serviceDisplayName: track.service.displayName,
    createdAt: track.createdAt,
  }));
}

export async function getTracksWithFailedJobs(
  errorCategoryFilter: string | null = null,
): Promise<TrackWithFailedJob[]> {
  const jobs = await prisma.archiveJob.findMany({
    where: { status: "failed" },
    take: MAX_ROWS,
    orderBy: { lastAttemptAt: "desc" },
    select: {
      status: true,
      errorHistory: true,
      retryCount: true,
      lastAttemptAt: true,
      track: {
        select: {
          id: true,
          title: true,
          artist: { select: { name: true } },
        },
      },
    },
  });

  const result = jobs.map((job) => ({
    id: job.track.id,
    title: job.track.title,
    artistName: job.track.artist.name,
    jobStatus: job.status,
    errorHistory: job.errorHistory,
    retryCount: job.retryCount,
    lastAttemptAt: job.lastAttemptAt,
    errorCategory: categorizeError(job.errorHistory),
  }));

  if (errorCategoryFilter && errorCategoryFilter !== "all") {
    return result.filter((track) => track.errorCategory === errorCategoryFilter);
  }

  return result;
}

export async function getOrphanedAudioFiles(): Promise<OrphanedAudioFile[]> {
  const orphaned = await prisma.$queryRaw<Array<{
    id: string;
    objectKey: string;
    fileSize: number | null;
    format: string | null;
    uploadedAt: Date;
  }>>`
    SELECT taf.id, taf.objectKey, taf.fileSize, taf.format, taf.uploadedAt
    FROM TrackAudioFile taf
    LEFT JOIN Track t ON taf.trackId = t.id
    WHERE t.id IS NULL
    ORDER BY taf.uploadedAt DESC
    LIMIT ${MAX_ROWS}
  `;
  
  return orphaned;
}

export async function getUnusedTracks(
  ageDays: number | null = 30,
): Promise<UnusedTrack[]> {
  const ageFilter =
    ageDays !== null
      ? new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000)
      : new Date(0);

  const tracks = await prisma.track.findMany({
    where: {
      userTracks: { none: {} },
      playlists: { none: {} },
      createdAt: { lt: ageFilter },
    },
    take: MAX_ROWS,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      artist: { select: { name: true } },
      service: { select: { name: true, displayName: true } },
    },
  });

  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artistName: track.artist.name,
    serviceName: track.service.name,
    serviceDisplayName: track.service.displayName,
    createdAt: track.createdAt,
  }));
}

export async function queueTrackForDownload(trackId: string): Promise<void> {
  await prisma.archiveJob.upsert({
    where: { trackId },
    create: { trackId, status: "pending", priority: true },
    update: { status: "pending", priority: true, retryCount: 0, errorHistory: "[]" },
  });
  scheduleQueueTick();
}

export async function queueTracksForDownload(trackIds: string[]): Promise<number> {
  let queued = 0;
  for (const trackId of trackIds) {
    await queueTrackForDownload(trackId);
    queued++;
  }
  return queued;
}

export interface DeleteImpact {
  trackCount: number;
  audioFilesCount: number;
  storageMB: number;
  userTracksCount: number;
  playlistReferencesCount: number;
}

export async function getDeleteImpact(trackIds: string[]): Promise<DeleteImpact> {
  if (trackIds.length === 0) {
    return {
      trackCount: 0,
      audioFilesCount: 0,
      storageMB: 0,
      userTracksCount: 0,
      playlistReferencesCount: 0,
    };
  }

  const [audioFiles, userTracks, playlistRefs] = await Promise.all([
    prisma.trackAudioFile.findMany({
      where: { trackId: { in: trackIds } },
      select: { fileSize: true },
    }),
    prisma.userTrack.count({
      where: { trackId: { in: trackIds } },
    }),
    prisma.userPlaylistTrack.count({
      where: { trackId: { in: trackIds } },
    }),
  ]);

  const storageBytes = audioFiles.reduce((sum, file) => sum + (file.fileSize ?? 0), 0);
  const storageMB = Math.round(storageBytes / (1024 * 1024));

  return {
    trackCount: trackIds.length,
    audioFilesCount: audioFiles.length,
    storageMB,
    userTracksCount: userTracks,
    playlistReferencesCount: playlistRefs,
  };
}

export async function deleteTracks(trackIds: string[]): Promise<{ deleted: number }> {
  if (trackIds.length === 0) {
    return { deleted: 0 };
  }

  const audioFiles = await prisma.trackAudioFile.findMany({
    where: { trackId: { in: trackIds } },
    select: { objectKey: true },
  });

  const result = await prisma.track.deleteMany({
    where: { id: { in: trackIds } },
  });

  for (const file of audioFiles) {
    try {
      await deleteFile(file.objectKey);
    } catch (error) {
      console.error(`Failed to delete file ${file.objectKey}:`, error);
    }
  }

  return { deleted: result.count };
}

export async function cleanupOrphanedAudioFiles(fileIds: string[]): Promise<{ deleted: number }> {
  if (fileIds.length === 0) {
    return { deleted: 0 };
  }

  const allFiles = await prisma.trackAudioFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, objectKey: true, trackId: true },
  });

  const trackIds = [...new Set(allFiles.map(f => f.trackId))];
  const existingTracks = await prisma.track.findMany({
    where: { id: { in: trackIds } },
    select: { id: true },
  });

  const existingTrackIds = new Set(existingTracks.map(t => t.id));
  const orphanedFiles = allFiles.filter(f => !existingTrackIds.has(f.trackId));

  let deleted = 0;

  for (const file of orphanedFiles) {
    try {
      await deleteFile(file.objectKey);
      await prisma.trackAudioFile.delete({ where: { id: file.id } });
      deleted++;
    } catch (error) {
      console.error(`Failed to cleanup orphaned file ${file.objectKey}:`, error);
    }
  }

  return { deleted };
}
