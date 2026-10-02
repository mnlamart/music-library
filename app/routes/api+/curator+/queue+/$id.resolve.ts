import { data } from "react-router";
import { z } from "zod";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { sendReviewResolutionEmail } from "#app/utils/queue-notifications.server.ts";
import { type Route } from "./+types/$id.resolve";

const resolveSchema = z.object({
  resolution: z.enum(["fixed", "not_an_issue", "duplicate", "cannot_fix"]),
  resolutionComment: z.string().min(1).max(1000),
});

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireCuratorRole(request);
  const { id } = params;

  try {
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);
    const validatedData = resolveSchema.parse(rawData);

    // Check if item exists and is claimed by this curator
    const item = await prisma.reviewQueueItem.findUnique({
      where: { id },
      include: {
        reporter: {
          select: { id: true, email: true, username: true, name: true },
        },
      },
    });

    if (!item) {
      return data({ success: false, error: "Queue item not found" }, { status: 404 });
    }

    if (item.status !== "claimed") {
      return data(
        { success: false, error: "Queue item must be claimed before resolving" },
        { status: 400 },
      );
    }

    if (item.claimedBy !== userId) {
      return data(
        { success: false, error: "You can only resolve items you have claimed" },
        { status: 403 },
      );
    }

    // Get curator details for notification
    const curator = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true },
    });

    // Resolve the item
    await prisma.reviewQueueItem.update({
      where: { id },
      data: {
        status: "resolved",
        resolution: validatedData.resolution,
        resolutionComment: validatedData.resolutionComment,
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });

    // Send notification to reporter if applicable
    if (item.reporter && item.source === "user_report") {
      await sendReviewResolutionEmail({
        reporter: item.reporter,
        curator: curator || { username: "Unknown", name: null },
        item: {
          entityType: item.entityType,
          entityId: item.entityId,
          issueType: item.issueType,
          description: item.description,
        },
        resolution: validatedData.resolution,
        resolutionComment: validatedData.resolutionComment,
      }).catch((err) => {
        console.error("Failed to send resolution email:", err);
        // Don't fail the resolution if email fails
      });
    }

    return data({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return data({ success: false, error: "Invalid input data" }, { status: 400 });
    }
    console.error("Error resolving queue item:", error);
    return data({ success: false, error: "Failed to resolve queue item" }, { status: 500 });
  }
}
