import { data } from "react-router";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/$id.claim";

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireCuratorRole(request);
  const { id } = params;

  try {
    // Check if item exists and is open
    const item = await prisma.reviewQueueItem.findUnique({
      where: { id },
    });

    if (!item) {
      return data({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    if (item.status !== "open") {
      return data(
        { success: false, error: "Queue item is not available for claiming" },
        { status: 400 },
      );
    }

    // Claim the item
    await prisma.reviewQueueItem.update({
      where: { id },
      data: {
        status: "claimed",
        claimedBy: userId,
        claimedAt: new Date(),
      },
    });

    return data({ success: true });
  } catch (error) {
    console.error("Error claiming queue item:", error);
    return data({ success: false, error: "Failed to claim queue item" }, { status: 500 });
  }
}
