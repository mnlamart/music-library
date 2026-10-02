/**
 * GET /api/curator/duplicates/albums
 * Fetch album duplicate groups
 */

import { data } from "react-router";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import {
  findExactAlbumDuplicates,
  findFuzzyAlbumDuplicates,
} from "#app/utils/duplicate-detection.server.ts";
import type { Route } from "./+types/albums.ts";

export async function loader({ request }: Route.LoaderArgs) {
  await requireCuratorOrAdmin(request);

  try {
    const [exactGroups, fuzzyGroups] = await Promise.all([
      findExactAlbumDuplicates(),
      findFuzzyAlbumDuplicates(),
    ]);

    return data({
      exact: exactGroups,
      fuzzy: fuzzyGroups,
      totalExactGroups: exactGroups.length,
      totalFuzzyGroups: fuzzyGroups.length,
    });
  } catch (error) {
    console.error("Error fetching album duplicates:", error);
    throw new Response("Failed to fetch album duplicates", { status: 500 });
  }
}
