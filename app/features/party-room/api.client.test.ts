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
  writeActiveRoomCode,
  ACTIVE_ROOM_CODE_KEY,
} from "./api.client.ts";

describe("party-room api.client (backend #294 contract)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null for current room when no active code stored", async () => {
    await expect(fetchCurrentRoom()).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fetches current room via GET /api/rooms/:code from sessionStorage", async () => {
    writeActiveRoomCode("AB3K9Q");
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "room-1",
          code: "AB3K9Q",
          status: "open",
          defaultJoinRole: "listener",
          roomVersion: 1,
          currentIndex: 0,
          isPlaying: false,
          currentHostParticipantId: "host-1",
          originalHostUserId: "user-1",
          participants: [
            {
              id: "host-1",
              userId: "user-1",
              displayName: "Kody",
              role: "host",
              lastSeenAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
          queue: [],
          createdAt: new Date().toISOString(),
          endedAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const room = await fetchCurrentRoom("user-1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rooms/AB3K9Q",
      expect.objectContaining({ method: "GET" }),
    );
    expect(room?.code).toBe("AB3K9Q");
    expect(room?.me?.role).toBe("host");
  });

  it("creates a room via POST /api/rooms and stores code", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ roomId: "room-1", code: "AB3K9Q", status: "open" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            roomId: "room-1",
            code: "AB3K9Q",
            status: "open",
            defaultJoinRole: "dj",
            roomVersion: 1,
            currentIndex: 0,
            isPlaying: false,
            currentHostParticipantId: "host-1",
            participants: [],
            queue: [],
            createdAt: new Date().toISOString(),
            endedAt: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const room = await createRoom({ defaultJoinRole: "dj" });
    expect(sessionStorage.getItem(ACTIVE_ROOM_CODE_KEY)).toBe("AB3K9Q");
    expect(room.code).toBe("AB3K9Q");
  });

  it("adds tracks with intent add_track", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId: "room-1",
          code: "AB3K9Q",
          status: "open",
          defaultJoinRole: "listener",
          roomVersion: 2,
          currentIndex: 0,
          isPlaying: false,
          currentHostParticipantId: "host-1",
          participants: [],
          queue: [],
          createdAt: new Date().toISOString(),
          endedAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await addTrackToRoomQueue("AB3K9Q", "track-1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rooms/AB3K9Q/queue",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ intent: "add_track", trackId: "track-1" }),
      }),
    );
  });

  it("throws RoomApiError on failure", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );
    await expect(addTrackToRoomQueue("AB3K9Q", "track-1")).rejects.toBeInstanceOf(RoomApiError);
  });

  it("reportRoomPlayEvent posts to play-events", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    reportRoomPlayEvent("AB3K9Q", "room_play_started", "track-1", "play-xyz");
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/rooms/AB3K9Q/play-events",
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
