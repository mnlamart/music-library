import { prisma } from "#app/utils/db.server.ts";
import { type Route } from "./+types/$trackId.history.ts";

interface ChangeDetail {
  from: string | number | null;
  to: string | number | null;
}

interface Changes {
  [key: string]: ChangeDetail;
}

function computeChanges(edit: any, previousEdit: any | null): Changes {
  const changes: Changes = {};
  const fields = [
    "title",
    "artistId",
    "albumId",
    "genre",
    "year",
    "trackNumber",
    "albumArtist",
    "bpm",
    "label",
    "isrc",
    "releaseDate",
    "originalDate",
    "originalYear",
    "totalTracks",
    "totalDiscs",
    "lyrics",
  ];

  for (const field of fields) {
    const currentValue = edit[field];
    const previousValue = previousEdit?.[field];

    if (currentValue !== previousValue) {
      changes[field] = {
        from: previousValue ?? null,
        to: currentValue ?? null,
      };
    }
  }

  return changes;
}

export async function loader({ params }: Route.LoaderArgs) {
  const trackId = params.trackId;

  // Verify track exists
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true },
  });

  if (!track) {
    return Response.json({ error: "Track not found" }, { status: 404 });
  }

  // Fetch all edits for this track, ordered by date (newest first)
  const edits = await prisma.trackEdit.findMany({
    where: { trackId },
    orderBy: { editedAt: "desc" },
    include: {
      editor: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  });

  // Build history with computed changes
  const history = edits.map((edit, index) => {
    const previousEdit = index < edits.length - 1 ? edits[index + 1] : null;
    const changes = computeChanges(edit, previousEdit);

    return {
      id: edit.id,
      editedAt: edit.editedAt.toISOString(),
      editedBy: {
        id: edit.editor.id,
        username: edit.editor.username,
        name: edit.editor.name,
      },
      comment: edit.comment,
      changes,
    };
  });

  return Response.json({ history });
}
