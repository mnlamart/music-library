import { prisma } from "#app/utils/db.server.ts";
import { type SortDirection } from "#app/utils/sort-direction.ts";
import { getPlayCompletedCountsByTrack } from "#app/features/listening-insights/play-completed-counts.server.ts";

export const DISCOVER_TRACKS_PAGE_SIZE = 50;

export const DISCOVER_SORT_OPTIONS = [
  "recentlyAdded",
  "mostPlayed",
  "mostLiked",
  "titleAZ",
  "artistAZ",
] as const;

export type DiscoverSortOption = (typeof DISCOVER_SORT_OPTIONS)[number];

export const DEFAULT_DISCOVER_SORT: DiscoverSortOption = "recentlyAdded";

export function defaultDiscoverSortDirection(sort: DiscoverSortOption): SortDirection {
  if (sort === "recentlyAdded" || sort === "mostPlayed" || sort === "mostLiked") {
    return "desc";
  }
  return "asc";
}

export function parseDiscoverSort(raw: string | null | undefined): DiscoverSortOption {
  return DISCOVER_SORT_OPTIONS.includes(raw as DiscoverSortOption)
    ? (raw as DiscoverSortOption)
    : DEFAULT_DISCOVER_SORT;
}

const TRACK_SELECT = {
  id: true,
  title: true,
  duration: true,
  serviceUrl: true,
  createdAt: true,
  updatedAt: true,
  releaseDate: true,
  originalDate: true,
  artist: {
    select: {
      id: true,
      name: true,
    },
  },
  coverImage: {
    select: {
      objectKey: true,
    },
  },
  service: {
    select: {
      name: true,
      displayName: true,
      logoUrl: true,
    },
  },
  audioFiles: {
    select: {
      id: true,
      format: true,
      objectKey: true,
    },
  },
} as const;

type TrackWithDetails = {
  id: string;
  title: string;
  duration: number | null;
  serviceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  releaseDate: Date | null;
  originalDate: Date | null;
  artist: {
    id: string;
    name: string;
  };
  coverImage: {
    objectKey: string;
  } | null;
  service: {
    name: string;
    displayName: string;
    logoUrl: string | null;
  } | null;
  audioFiles: Array<{
    id: string;
    format: string | null;
    objectKey: string;
  }>;
};

export type DiscoverTrack = TrackWithDetails & {
  isInUserLibrary: boolean;
  userTrackCreatedAt: Date | null;
};

export type ListDiscoverTracksResult = {
  tracks: DiscoverTrack[];
  pagination: {
    limit: number;
    hasNext: boolean;
    nextCursor: string | null;
  };
};

export async function listDiscoverTracks({
  userId,
  sort,
  direction = defaultDiscoverSortDirection(sort),
  cursor,
  limit = DISCOVER_TRACKS_PAGE_SIZE,
  now = new Date(),
}: {
  userId: string;
  sort: DiscoverSortOption;
  direction?: SortDirection;
  cursor?: string | null;
  limit?: number;
  now?: Date;
}): Promise<ListDiscoverTracksResult> {
  if (sort === "mostPlayed") {
    return listDiscoverTracksByPlayCount({ userId, direction, cursor, limit, now });
  }

  if (sort === "mostLiked") {
    return listDiscoverTracksByUserCount({ userId, direction, cursor, limit });
  }

  const orderBy = getOrderByForSort(sort, direction);

  const tracksRaw = await prisma.track.findMany({
    select: TRACK_SELECT,
    orderBy,
    take: limit,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : undefined,
  });

  const nextCursor =
    tracksRaw.length === limit ? (tracksRaw[tracksRaw.length - 1]?.id ?? null) : null;

  const trackIds = tracksRaw.map((t) => t.id);
  const userTracks = await prisma.userTrack.findMany({
    where: {
      userId,
      trackId: { in: trackIds },
      isActive: true,
      deletedAt: null,
    },
    select: {
      trackId: true,
      createdAt: true,
    },
  });

  const userTrackMap = new Map(userTracks.map((ut) => [ut.trackId, ut.createdAt]));

  const tracks: DiscoverTrack[] = tracksRaw.map((track) => ({
    ...track,
    isInUserLibrary: userTrackMap.has(track.id),
    userTrackCreatedAt: userTrackMap.get(track.id) ?? null,
  }));

  return {
    tracks,
    pagination: {
      limit,
      hasNext: !!nextCursor,
      nextCursor,
    },
  };
}

function getOrderByForSort(
  sort: DiscoverSortOption,
  direction: SortDirection,
): Array<{ [key: string]: string }> {
  switch (sort) {
    case "recentlyAdded":
      return [{ createdAt: direction }, { id: direction }];
    case "titleAZ":
      return [{ title: direction }, { id: direction }];
    case "artistAZ":
      return [{ artist: { name: direction } }, { title: direction }, { id: direction }];
    default:
      return [{ createdAt: direction }, { id: direction }];
  }
}

async function listDiscoverTracksByPlayCount({
  userId,
  direction,
  cursor,
  limit,
  now,
}: {
  userId: string;
  direction: SortDirection;
  cursor: string | null | undefined;
  limit: number;
  now: Date;
}): Promise<ListDiscoverTracksResult> {
  const counts = await getPlayCompletedCountsByTrack({
    userId,
    window: "ever",
    now,
  });

  const allTracks = await prisma.track.findMany({
    select: {
      id: true,
      createdAt: true,
    },
  });

  const sorted = [...allTracks].sort((a, b) => {
    const countA = counts.get(a.id) ?? 0;
    const countB = counts.get(b.id) ?? 0;

    if (countB !== countA) return countB - countA;

    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.id.localeCompare(b.id);
  });

  const ordered = direction === "asc" ? sorted.reverse() : sorted;

  let start = 0;
  if (cursor) {
    const idx = ordered.findIndex((t) => t.id === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }

  const page = ordered.slice(start, start + limit);
  const hasNext = start + limit < ordered.length;
  const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

  if (page.length === 0) {
    return {
      tracks: [],
      pagination: { limit, hasNext: false, nextCursor: null },
    };
  }

  const pageIds = page.map((t) => t.id);
  const tracksRaw = await prisma.track.findMany({
    where: { id: { in: pageIds } },
    select: TRACK_SELECT,
  });

  const userTracks = await prisma.userTrack.findMany({
    where: {
      userId,
      trackId: { in: pageIds },
      isActive: true,
      deletedAt: null,
    },
    select: {
      trackId: true,
      createdAt: true,
    },
  });

  const userTrackMap = new Map(userTracks.map((ut) => [ut.trackId, ut.createdAt]));
  const trackMap = new Map(tracksRaw.map((t) => [t.id, t]));

  const tracks: DiscoverTrack[] = pageIds
    .map((id) => {
      const track = trackMap.get(id);
      if (!track) return null;
      return {
        ...track,
        isInUserLibrary: userTrackMap.has(id),
        userTrackCreatedAt: userTrackMap.get(id) ?? null,
      };
    })
    .filter((t): t is DiscoverTrack => t !== null);

  return {
    tracks,
    pagination: {
      limit,
      hasNext,
      nextCursor,
    },
  };
}

async function listDiscoverTracksByUserCount({
  userId,
  direction,
  cursor,
  limit,
}: {
  userId: string;
  direction: SortDirection;
  cursor: string | null | undefined;
  limit: number;
}): Promise<ListDiscoverTracksResult> {
  const userCounts = await prisma.userTrack.groupBy({
    by: ["trackId"],
    where: {
      isActive: true,
      deletedAt: null,
    },
    _count: {
      userId: true,
    },
  });

  const countMap = new Map(userCounts.map((uc) => [uc.trackId, uc._count.userId]));

  const allTracks = await prisma.track.findMany({
    select: {
      id: true,
      createdAt: true,
    },
  });

  const sorted = [...allTracks].sort((a, b) => {
    const countA = countMap.get(a.id) ?? 0;
    const countB = countMap.get(b.id) ?? 0;

    if (countB !== countA) return countB - countA;

    const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (timeDiff !== 0) return timeDiff;

    return a.id.localeCompare(b.id);
  });

  const ordered = direction === "asc" ? sorted.reverse() : sorted;

  let start = 0;
  if (cursor) {
    const idx = ordered.findIndex((t) => t.id === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }

  const page = ordered.slice(start, start + limit);
  const hasNext = start + limit < ordered.length;
  const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

  if (page.length === 0) {
    return {
      tracks: [],
      pagination: { limit, hasNext: false, nextCursor: null },
    };
  }

  const pageIds = page.map((t) => t.id);
  const tracksRaw = await prisma.track.findMany({
    where: { id: { in: pageIds } },
    select: TRACK_SELECT,
  });

  const userTracks = await prisma.userTrack.findMany({
    where: {
      userId,
      trackId: { in: pageIds },
      isActive: true,
      deletedAt: null,
    },
    select: {
      trackId: true,
      createdAt: true,
    },
  });

  const userTrackMap = new Map(userTracks.map((ut) => [ut.trackId, ut.createdAt]));
  const trackMap = new Map(tracksRaw.map((t) => [t.id, t]));

  const tracks: DiscoverTrack[] = pageIds
    .map((id) => {
      const track = trackMap.get(id);
      if (!track) return null;
      return {
        ...track,
        isInUserLibrary: userTrackMap.has(id),
        userTrackCreatedAt: userTrackMap.get(id) ?? null,
      };
    })
    .filter((t): t is DiscoverTrack => t !== null);

  return {
    tracks,
    pagination: {
      limit,
      hasNext,
      nextCursor,
    },
  };
}
