import { data } from "react-router";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/index";

export async function loader({ request }: Route.LoaderArgs) {
  await requireCuratorRole(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  const entityType = url.searchParams.get("entityType") || undefined;
  const source = url.searchParams.get("source") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = 50;

  try {
    const where: any = {};

    if (status !== "all") {
      where.status = status;
    }
    if (entityType) {
      where.entityType = entityType;
    }
    if (source) {
      where.source = source;
    }

    const [items, total] = await Promise.all([
      prisma.reviewQueueItem.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, username: true, name: true },
          },
          claimedByUser: {
            select: { id: true, username: true, name: true },
          },
          resolvedByUser: {
            select: { id: true, username: true, name: true },
          },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.reviewQueueItem.count({ where }),
    ]);

    // Fetch entity details for each item
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        let entityDetails = null;

        switch (item.entityType) {
          case "track":
            const track = await prisma.track.findUnique({
              where: { id: item.entityId },
              select: {
                id: true,
                title: true,
                artist: { select: { name: true } },
              },
            });
            entityDetails = track
              ? { name: `${track.title} - ${track.artist.name}` }
              : { name: "Unknown Track" };
            break;
          case "artist":
            const artist = await prisma.artist.findUnique({
              where: { id: item.entityId },
              select: { id: true, name: true },
            });
            entityDetails = artist ? { name: artist.name } : { name: "Unknown Artist" };
            break;
          case "album":
            const album = await prisma.album.findUnique({
              where: { id: item.entityId },
              select: {
                id: true,
                name: true,
                artist: { select: { name: true } },
              },
            });
            entityDetails = album
              ? { name: `${album.name} - ${album.artist.name}` }
              : { name: "Unknown Album" };
            break;
        }

        return {
          ...item,
          entityDetails,
        };
      }),
    );

    return data({
      items: enrichedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Error fetching review queue:", error);
    return data({ error: "Failed to fetch review queue" }, { status: 500 });
  }
}
