import { data } from "react-router";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/$id.unclaim";

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireCuratorRole(request);
  const { id } = params;

  try {
    // Check if item exists and is claimed by this curator
    const item = await prisma.reviewQueueItem.findUnique({
      where: { id },
    });

    if (!item) {
      return data({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    if (item.status !== "claimed") {
      return data({ success: false, error: "Queue item is not claimed" }, { status: 400 });
    }

    if (item.claimedBy !== userId) {
      return data(
        { success: false, error: "You can only unclaim items you have claimed" },
        { status: 403 },
      );
    }

    // Unclaim the item
    await prisma.reviewQueueItem.update({
      where: { id },
      data: {
        status: "open",
        claimedBy: null,
        claimedAt: null,
      },
    });

    return data({ success: true });
  } catch (error) {
    console.error("Error unclaiming queue item:", error);
    return data({ success: false, error: "Failed to unclaim queue item" }, { status: 500 });
  }
}
