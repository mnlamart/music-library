import { data } from "react-router";
import { z } from "zod";
import { requireUserId } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { proxyClientActionToServer } from "#app/utils/server-proxy-client-action.ts";
import { type Route } from "./+types/report";

export async function clientAction(args: Route.ClientActionArgs) {
  return proxyClientActionToServer(args);
}

const reportSchema = z.object({
  trackId: z.string().min(1),
  issueType: z.enum(["wrong_metadata", "missing_info", "low_quality", "duplicate", "other"]),
  description: z.string().min(1).max(1000),
});

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);

  try {
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);
    const validatedData = reportSchema.parse(rawData);

    // Verify track exists
    const track = await prisma.track.findUnique({
      where: { id: validatedData.trackId },
      select: { id: true, title: true },
    });

    if (!track) {
      return data({ success: false, error: "Track not found" }, { status: 404 });
    }

    // Create review queue item
    await prisma.reviewQueueItem.create({
      data: {
        entityType: "track",
        entityId: validatedData.trackId,
        source: "user_report",
        issueType: validatedData.issueType,
        description: validatedData.description,
        reporterId: userId,
        status: "open",
        priority: 1,
      },
    });

    return data({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return data({ success: false, error: "Invalid input data" }, { status: 400 });
    }
    console.error("Error creating review queue item:", error);
    return data({ success: false, error: "Failed to submit report" }, { status: 500 });
  }
}
