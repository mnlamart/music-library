import { data } from "react-router";
import { z } from "zod";
import { requireCuratorOrAdmin } from "#app/utils/curator.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { normalizeGenreName } from "#app/utils/genre-migration.server.ts";
import { type Route } from "./+types/$id.ts";

const UpdateGenreSchema = z.object({
  name: z.string().min(1, "Genre name is required").max(100),
});

export async function clientAction() {
  throw new Error("This route should only be called on the server");
}

/**
 * PUT /api/genres/:id
 * Update genre name (affects all linked tracks)
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requireCuratorOrAdmin(request);

  const genreId = params.id;

  if (request.method === "PUT") {
    return await handleUpdate(request, genreId);
  } else if (request.method === "DELETE") {
    return await handleDelete(genreId);
  } else {
    throw data({ error: "Method not allowed" }, { status: 405 });
  }
}

async function handleUpdate(request: Request, genreId: string) {
  const body = await request.json();
  const result = UpdateGenreSchema.safeParse(body);

  if (!result.success) {
    throw data(
      {
        error: "Validation failed",
        details: result.error.issues,
      },
      { status: 400 },
    );
  }

  // Check if genre exists
  const existingGenre = await prisma.genre.findUnique({
    where: { id: genreId },
  });

  if (!existingGenre) {
    throw data(
      {
        error: "Genre not found",
      },
      { status: 404 },
    );
  }

  const normalizedName = normalizeGenreName(result.data.name);

  // Check if another genre with this name already exists
  const duplicateGenre = await prisma.genre.findFirst({
    where: {
      normalizedName,
      id: { not: genreId },
    },
  });

  if (duplicateGenre) {
    throw data(
      {
        error: "A genre with this name already exists",
        genre: duplicateGenre,
      },
      { status: 409 },
    );
  }

  // Update genre
  const updatedGenre = await prisma.genre.update({
    where: { id: genreId },
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
      id: updatedGenre.id,
      name: updatedGenre.name,
      trackCount: updatedGenre._count.tracks,
      createdAt: updatedGenre.createdAt,
    },
  });
}

/**
 * DELETE /api/genres/:id
 * Delete genre (unlinks from all tracks but doesn't delete tracks)
 */
async function handleDelete(genreId: string) {
  // Check if genre exists
  const existingGenre = await prisma.genre.findUnique({
    where: { id: genreId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          tracks: true,
        },
      },
    },
  });

  if (!existingGenre) {
    throw data(
      {
        error: "Genre not found",
      },
      { status: 404 },
    );
  }

  // Delete genre (cascade delete will remove join table entries)
  await prisma.genre.delete({
    where: { id: genreId },
  });

  return Response.json({
    success: true,
    message: `Genre "${existingGenre.name}" deleted`,
    tracksAffected: existingGenre._count.tracks,
  });
}
