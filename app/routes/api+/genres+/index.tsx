import { data } from "react-router";
import { z } from "zod";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { normalizeGenreName } from "#app/utils/genre-migration.server.ts";
import { type Route } from "./+types/index.ts";

const CreateGenreSchema = z.object({
  name: z.string().min(1, "Genre name is required").max(100),
});

export async function clientLoader() {
  throw new Error("This route should only be called on the server");
}

export async function clientAction() {
  throw new Error("This route should only be called on the server");
}

/**
 * GET /api/genres
 * List all genres with track counts
 */
export async function loader({ request }: Route.LoaderArgs) {
  // Genres are public, no auth required for viewing

  // Get all genres with track counts
  const genres = await prisma.genre.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          tracks: true,
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  // Transform to include trackCount
  const genresWithCounts = genres.map((genre) => ({
    id: genre.id,
    name: genre.name,
    trackCount: genre._count.tracks,
    createdAt: genre.createdAt,
  }));

  return Response.json({ genres: genresWithCounts });
}

/**
 * POST /api/genres
 * Create a new genre
 */
export async function action({ request }: Route.ActionArgs) {
  await requireCuratorOrAdmin(request);

  if (request.method !== "POST") {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const result = CreateGenreSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        details: result.error.issues,
      },
      { status: 400 },
    );
  }

  const normalizedName = normalizeGenreName(result.data.name);

  // Check if genre already exists
  const existingGenre = await prisma.genre.findFirst({
    where: { normalizedName },
  });

  if (existingGenre) {
    throw data(
      {
        error: "Genre already exists",
        genre: existingGenre,
      },
      { status: 409 },
    );
  }

  // Create new genre
  const genre = await prisma.genre.create({
    data: {
      name: result.data.name,
      normalizedName,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          tracks: true,
        },
      },
    },
  });

  return Response.json({
    genre: {
      id: genre.id,
      name: genre.name,
      trackCount: genre._count.tracks,
      createdAt: genre.createdAt,
    },
  });
}
