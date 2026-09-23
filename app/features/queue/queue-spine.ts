import { type FullTrack, type QueueTrack } from "#app/types/frontend/shared.ts";
import { type LibrarySortOption } from "#app/features/listening-insights/heavy-rotation.ts";
import { type PlaylistTrackSortOption } from "#app/utils/playlist-track-sort.ts";
import { type SortDirection } from "#app/utils/sort-direction.ts";

export class AuthExpiredError extends Error {
  constructor() {
    super("Auth session expired");
    this.name = "AuthExpiredError";
  }
}

export type QueueSpineContext =
  | { type: "library"; sort?: LibrarySortOption; direction?: SortDirection }
  | {
      type: "playlist";
      playlistId: string;
      sort?: PlaylistTrackSortOption;
      direction?: SortDirection;
    }
  | { type: "artist"; artistId: string }
  | { type: "album"; albumId: string }
  | { type: "track"; trackId: string }
  | { type: "onRepeatSnapshot"; snapshotId: string };

export type QueueSpineResponse = {
  tracks: QueueTrack[];
  total: number;
};

export async function fetchQueueSpine(context: QueueSpineContext): Promise<QueueSpineResponse> {
  let url: string;

  if (context.type === "library") {
    const params = new URLSearchParams({
      context: "library",
      hasAudio: "1",
    });
    if (context.sort && context.sort !== "dateAdded") {
      params.set("sort", context.sort);
    }
    if (context.direction && context.direction !== "desc") {
      params.set("dir", context.direction);
    }
    url = `/api/queue-spine?${params.toString()}`;
  } else if (context.type === "playlist") {
    const params = new URLSearchParams({
      context: "playlist",
      playlistId: context.playlistId,
    });
    if (context.sort && context.sort !== "custom") {
      params.set("sort", context.sort);
    }
    if (context.direction) {
      params.set("dir", context.direction);
    }
    url = `/api/queue-spine?${params.toString()}`;
  } else if (context.type === "artist") {
    url = `/api/queue-spine?context=artist&artistId=${encodeURIComponent(context.artistId)}`;
  } else if (context.type === "album") {
    url = `/api/queue-spine?context=album&albumId=${encodeURIComponent(context.albumId)}`;
  } else if (context.type === "onRepeatSnapshot") {
    url = `/api/queue-spine?context=onRepeatSnapshot&snapshotId=${encodeURIComponent(context.snapshotId)}`;
  } else {
    url = `/api/queue-spine?context=track&trackId=${encodeURIComponent(context.trackId)}`;
  }

  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const response = await fetch(`${base}${url}`, { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new AuthExpiredError();
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch queue spine: ${response.status}`);
  }

  return response.json() as Promise<QueueSpineResponse>;
}

export function queueTrackFromFullTrack(track: FullTrack): QueueTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
  };
}

export function fullTrackStubFromQueueTrack(track: QueueTrack): FullTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: null,
    coverImage: null,
    audioFiles: [],
  };
}
