import { listReviewQueue } from "#app/features/curator/review-queue.server.ts";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";

export async function loader({ request }: { request: Request }) {
  const currentUserId = await requireCuratorRole(request);
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const result = await listReviewQueue({
    status: url.searchParams.get("status") ?? "open",
    entityType: url.searchParams.get("entityType") || undefined,
    source: url.searchParams.get("source") || undefined,
    page: Number.isFinite(page) ? page : 1,
  });
  return { ...result, currentUserId };
}
