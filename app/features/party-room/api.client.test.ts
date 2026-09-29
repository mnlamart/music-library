/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  addTrackToRoomQueue,
  createRoom,
  fetchCurrentRoom,
  RoomApiError,
  reportRoomPlayEvent,
} from "./api.client.ts";
import { type RoomSnapshot } from "./types.ts";

function sampleRoom(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: "room-1",
    code: "AB3K9Q",
    status: "open",
    defaultJoinRole: "listener",
    roomVersion: 1,
    createdAt: new Date().toISOString(),
    endedAt: null,
    originalHostParticipantId: "host-1",
    currentHostParticipantId: "host-1",
    hostLastHeartbeatAt: new Date().toISOString(),
    hostTakeoverAvailable: false,
    me: {
      id: "host-1",
      displayName: "Kody",
      role: "host",
      userId: "user-1",
      isGuest: false,
      lastHeartbeatAt: new Date().toISOString(),
      isOriginalHost: true,
    },
    participants: [],
    queue: [],
    playback: { isPlaying: false, currentIndex: 0, currentTrackId: null },
    joinUrl: "http://localhost:3000/rooms/AB3K9Q",
    qrDataUrl: null,
    ...overrides,
  };
}

describe("party-room api.client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null for current room 204", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await expect(fetchCurrentRoom()).resolves.toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rooms/current",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a room via POST /api/rooms", async () => {
    const room = sampleRoom();
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(room), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(createRoom({ defaultJoinRole: "dj" })).resolves.toMatchObject({
      code: "AB3K9Q",
      id: "room-1",
    });
  });

  it("throws RoomApiError on failure", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    await expect(addTrackToRoomQueue("room-1", "track-1")).rejects.toBeInstanceOf(RoomApiError);
  });

  it("reportRoomPlayEvent posts room-scoped events without throwing", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    reportRoomPlayEvent("room-1", "room_play_started", "track-1", "play-xyz");
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rooms/room-1/play-event",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "room_play_started",
          trackId: "track-1",
          playId: "play-xyz",
        }),
      }),
    );
  });
});
