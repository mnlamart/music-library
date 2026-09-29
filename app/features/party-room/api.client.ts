/**
 * Thin client helpers for Party Room HTTP APIs (ADR-030).
 *
 * Expected server routes (owned by backend #286–#288):
 *   POST   /api/rooms
 *   GET    /api/rooms/current
 *   POST   /api/rooms/join
 *   GET    /api/rooms/:roomId
 *   POST   /api/rooms/:roomId/leave
 *   POST   /api/rooms/:roomId/end
 *   POST   /api/rooms/:roomId/heartbeat
 *   POST   /api/rooms/:roomId/become-host
 *   POST   /api/rooms/:roomId/reclaim-host
 *   PATCH  /api/rooms/:roomId
 *   POST   /api/rooms/:roomId/queue
 *   POST   /api/rooms/:roomId/queue/playlist
 *   PATCH  /api/rooms/:roomId/queue/:itemId
 *   DELETE /api/rooms/:roomId/queue/:itemId
 *   POST   /api/rooms/:roomId/transport
 *   GET    /api/rooms/:roomId/events  (SSE)
 *   POST   /api/rooms/:roomId/play-event
 *   GET    /resources/rooms/audio/:trackId  (speaker grant)
 */

import {
  type CreateRoomInput,
  type JoinRoomInput,
  type RoomPlayEventType,
  type RoomSnapshot,
  type RoomTransportAction,
} from "./types.ts";
import { type RoomDefaultJoinRole, type RoomRole } from "./constants.ts";

export const ROOM_API = {
  create: "/api/rooms",
  current: "/api/rooms/current",
  join: "/api/rooms/join",
  room: (roomId: string) => `/api/rooms/${roomId}`,
  leave: (roomId: string) => `/api/rooms/${roomId}/leave`,
  end: (roomId: string) => `/api/rooms/${roomId}/end`,
  heartbeat: (roomId: string) => `/api/rooms/${roomId}/heartbeat`,
  becomeHost: (roomId: string) => `/api/rooms/${roomId}/become-host`,
  reclaimHost: (roomId: string) => `/api/rooms/${roomId}/reclaim-host`,
  queue: (roomId: string) => `/api/rooms/${roomId}/queue`,
  queuePlaylist: (roomId: string) => `/api/rooms/${roomId}/queue/playlist`,
  queueItem: (roomId: string, itemId: string) => `/api/rooms/${roomId}/queue/${itemId}`,
  transport: (roomId: string) => `/api/rooms/${roomId}/transport`,
  events: (roomId: string) => `/api/rooms/${roomId}/events`,
  playEvent: (roomId: string) => `/api/rooms/${roomId}/play-event`,
  speakerAudio: (trackId: string) => `/resources/rooms/audio/${trackId}`,
} as const;

export class RoomApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "RoomApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function roomFetch<T>(
  url: string,
  init?: RequestInit,
  options?: { allowNoContent?: boolean },
): Promise<T | null> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    if (options?.allowNoContent) return null;
    return null;
  }

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Room API error (${response.status})`;
    throw new RoomApiError(message, response.status, body);
  }

  return body as T;
}

export async function fetchCurrentRoom(): Promise<RoomSnapshot | null> {
  return roomFetch<RoomSnapshot>(ROOM_API.current, { method: "GET" }, { allowNoContent: true });
}

export async function fetchRoom(roomId: string): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.room(roomId), { method: "GET" });
  if (!room) throw new RoomApiError("Empty room response", 500);
  return room;
}

export async function createRoom(input: CreateRoomInput = {}): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.create, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!room) throw new RoomApiError("Empty create response", 500);
  return room;
}

export async function joinRoom(input: JoinRoomInput): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.join, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!room) throw new RoomApiError("Empty join response", 500);
  return room;
}

export async function leaveRoom(roomId: string): Promise<void> {
  await roomFetch(ROOM_API.leave(roomId), { method: "POST" }, { allowNoContent: true });
}

export async function endRoom(roomId: string): Promise<void> {
  await roomFetch(ROOM_API.end(roomId), { method: "POST" }, { allowNoContent: true });
}

export async function sendHostHeartbeat(roomId: string): Promise<void> {
  await roomFetch(ROOM_API.heartbeat(roomId), { method: "POST" }, { allowNoContent: true });
}

export async function becomeHost(roomId: string): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.becomeHost(roomId), { method: "POST" });
  if (!room) throw new RoomApiError("Empty become-host response", 500);
  return room;
}

export async function reclaimHost(roomId: string): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.reclaimHost(roomId), { method: "POST" });
  if (!room) throw new RoomApiError("Empty reclaim-host response", 500);
  return room;
}

export async function updateRoomSettings(
  roomId: string,
  patch: { defaultJoinRole: RoomDefaultJoinRole },
): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.room(roomId), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!room) throw new RoomApiError("Empty settings response", 500);
  return room;
}

export async function addTrackToRoomQueue(roomId: string, trackId: string): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.queue(roomId), {
    method: "POST",
    body: JSON.stringify({ trackId }),
  });
  if (!room) throw new RoomApiError("Empty queue add response", 500);
  return room;
}

export async function addPlaylistToRoomQueue(
  roomId: string,
  playlistId: string,
): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.queuePlaylist(roomId), {
    method: "POST",
    body: JSON.stringify({ playlistId }),
  });
  if (!room) throw new RoomApiError("Empty playlist queue response", 500);
  return room;
}

export async function removeRoomQueueItem(roomId: string, itemId: string): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.queueItem(roomId, itemId), {
    method: "DELETE",
  });
  if (!room) throw new RoomApiError("Empty queue remove response", 500);
  return room;
}

export async function reorderRoomQueueItem(
  roomId: string,
  itemId: string,
  toPosition: number,
): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.queueItem(roomId, itemId), {
    method: "PATCH",
    body: JSON.stringify({ position: toPosition }),
  });
  if (!room) throw new RoomApiError("Empty queue reorder response", 500);
  return room;
}

export async function sendRoomTransport(
  roomId: string,
  action: RoomTransportAction,
): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(ROOM_API.transport(roomId), {
    method: "POST",
    body: JSON.stringify(action),
  });
  if (!room) throw new RoomApiError("Empty transport response", 500);
  return room;
}

export async function setParticipantRole(
  roomId: string,
  participantId: string,
  role: Exclude<RoomRole, "host">,
): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(
    `${ROOM_API.room(roomId)}/participants/${participantId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
  if (!room) throw new RoomApiError("Empty role response", 500);
  return room;
}

export async function kickParticipant(
  roomId: string,
  participantId: string,
): Promise<RoomSnapshot> {
  const room = await roomFetch<RoomSnapshot>(
    `${ROOM_API.room(roomId)}/participants/${participantId}`,
    { method: "DELETE" },
  );
  if (!room) throw new RoomApiError("Empty kick response", 500);
  return room;
}

/** Fire-and-forget room play events — never personal UsageEvent. */
export function reportRoomPlayEvent(
  roomId: string,
  type: RoomPlayEventType,
  trackId: string,
  playId?: string | null,
): void {
  if (typeof window === "undefined" || !trackId || !roomId) return;

  void fetch(ROOM_API.playEvent(roomId), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ type, trackId, playId: playId ?? undefined }),
  }).catch(() => {
    // Analytics must not break playback
  });
}
