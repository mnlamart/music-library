import { prisma } from "#app/utils/db.server.ts";
import { QUEUE_STATUS_MINE, type ReviewQueueListItem } from "./review-queue.ts";

const PAGE_SIZE = 20;

export async function listReviewQueue({
  status = "open",
  entityType,
  source,
  page = 1,
  claimedBy,
  reporterId,
}: {
  status?: string;
  entityType?: string;
  source?: string;
  page?: number;
  claimedBy?: string;
  reporterId?: string;
}) {
  const safePage = Math.max(1, page);
  const mine = status === QUEUE_STATUS_MINE;
  if (mine && !claimedBy) {
    return {
      items: [],
      total: 0,
      page: safePage,
      pageSize: PAGE_SIZE,
      totalPages: 1,
    };
  }
  const where = {
    ...(mine ? { status: "claimed", claimedBy } : status && status !== "all" ? { status } : {}),
    ...(entityType ? { entityType } : {}),
    ...(source ? { source } : {}),
    ...(reporterId ? { reporterId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.reviewQueueItem.findMany({
      where,
      include: {
        reporter: { select: { id: true, username: true, name: true } },
        claimedByUser: { select: { id: true, username: true, name: true } },
        resolvedByUser: { select: { id: true, username: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.reviewQueueItem.count({ where }),
  ]);

  const trackIds = items.filter((item) => item.entityType === "track").map((item) => item.entityId);
  const artistIds = items
    .filter((item) => item.entityType === "artist")
    .map((item) => item.entityId);
  const albumIds = items.filter((item) => item.entityType === "album").map((item) => item.entityId);

  const [tracks, artists, albums] = await Promise.all([
    trackIds.length
      ? prisma.track.findMany({
          where: { id: { in: trackIds } },
          select: { id: true, title: true, artist: { select: { name: true } } },
        })
      : [],
    artistIds.length
      ? prisma.artist.findMany({
          where: { id: { in: artistIds } },
          select: { id: true, name: true },
        })
      : [],
    albumIds.length
      ? prisma.album.findMany({
          where: { id: { in: albumIds } },
          select: { id: true, name: true, artist: { select: { name: true } } },
        })
      : [],
  ]);

  const trackNames = new Map(
    tracks.map((track) => [track.id, `${track.title} — ${track.artist.name}`]),
  );
  const artistNames = new Map(artists.map((artist) => [artist.id, artist.name]));
  const albumNames = new Map(
    albums.map((album) => [album.id, `${album.name} — ${album.artist.name}`]),
  );

  const enriched: ReviewQueueListItem[] = items.map((item) => {
    let name = "Unknown";
    if (item.entityType === "track") name = trackNames.get(item.entityId) ?? "Unknown track";
    if (item.entityType === "artist") name = artistNames.get(item.entityId) ?? "Unknown artist";
    if (item.entityType === "album") name = albumNames.get(item.entityId) ?? "Unknown album";
    return {
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      source: item.source,
      issueType: item.issueType,
      description: item.description,
      status: item.status,
      priority: item.priority,
      claimedBy: item.claimedBy,
      resolution: item.resolution,
      resolutionComment: item.resolutionComment,
      createdAt: item.createdAt.toISOString(),
      entityDetails: { name },
      reporter: item.reporter,
      claimedByUser: item.claimedByUser,
      resolvedByUser: item.resolvedByUser,
    };
  });

  return {
    items: enriched,
    total,
    page: safePage,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
