/**
 * GET /api/curator/duplicates/artists
 * Fetch artist duplicate groups
 */

import { data } from "react-router";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import {
  findExactArtistDuplicates,
  findFuzzyArtistDuplicates,
} from "#app/utils/duplicate-detection.server.ts";
import type { Route } from "./+types/artists.ts";

export async function loader({ request }: Route.LoaderArgs) {
  await requireCuratorOrAdmin(request);

  try {
    const [exactGroups, fuzzyGroups] = await Promise.all([
      findExactArtistDuplicates(),
      findFuzzyArtistDuplicates(),
    ]);

    return data({
      exact: exactGroups,
      fuzzy: fuzzyGroups,
      totalExactGroups: exactGroups.length,
      totalFuzzyGroups: fuzzyGroups.length,
    });
  } catch (error) {
    console.error("Error fetching artist duplicates:", error);
    throw new Response("Failed to fetch artist duplicates", { status: 500 });
  }
}
