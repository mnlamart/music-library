import { listLibraryUserTracks, parseLibrarySort } from "#app/features/listening-insights/index.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { LIBRARY_TRACKS_PAGE_SIZE } from "#app/utils/library-tracks-pagination.ts";
import { parseHasAudioOnlyParam } from "#app/utils/library-user-tracks.server.ts";

export async function loader({ request, url }: { request: Request; url: URL }) {
  try {
    const userId = await requireUserId(request);

    const cursor = url.searchParams.get("cursor");
    const limitParam = url.searchParams.get("limit");
    const limit = parseInt(limitParam || String(LIBRARY_TRACKS_PAGE_SIZE));
    const hasAudioParam = url.searchParams.get("hasAudio");
    const sort = parseLibrarySort(url.searchParams.get("sort"));

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return Response.json({ error: "Invalid limit parameter" }, { status: 400 });
    }

    if (hasAudioParam !== null && hasAudioParam !== "1") {
      return Response.json({ error: "Invalid hasAudio parameter" }, { status: 400 });
    }

    const hasAudioOnly = parseHasAudioOnlyParam(url.searchParams);

    // `fields=minimal` is used by some clients; keep selecting full track shape for
    // Heavy Rotation sorts so list order matches the library page.
    const { userTracks, pagination } = await listLibraryUserTracks({
      userId,
      sort,
      hasAudioOnly,
      cursor,
      limit,
    });

    return Response.json({
      userTracks,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching user tracks:", error);
    return Response.json({ error: "Failed to fetch tracks" }, { status: 500 });
  }
}
