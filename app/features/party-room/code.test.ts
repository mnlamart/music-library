import { describe, expect, it } from "vitest";
import {
  buildRoomJoinPath,
  buildRoomJoinUrl,
  isValidRoomCode,
  normalizeRoomCode,
  parseRoomCodeInput,
} from "./code.ts";
import { ROOM_CODE_LENGTH } from "./constants.ts";
import { canBecomeHost, canReclaimHost, isCurrentHost, splitRoomQueue } from "./index.ts";
import { type RoomQueueItemDto, type RoomSnapshot } from "./types.ts";

function item(position: number, id = `item-${position}`): RoomQueueItemDto {
  return {
    id,
    position,
    trackId: `track-${position}`,
    track: {
      id: `track-${position}`,
      title: `Track ${position}`,
      artistName: "Artist",
      duration: 180,
      coverObjectKey: null,
      hasAudio: true,
    },
    addedByParticipantId: "p1",
    addedByDisplayName: "Host",
    createdAt: new Date().toISOString(),
  };
}

function baseRoom(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
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

describe("room code helpers", () => {
  it("normalizes and validates 6-char OTP charset codes", () => {
    expect(normalizeRoomCode(" ab3k9q ")).toBe("AB3K9Q");
    expect(isValidRoomCode("AB3K9Q")).toBe(true);
    expect(isValidRoomCode("AB3K9")).toBe(false);
    expect(isValidRoomCode("AB0K9Q")).toBe(false); // 0 not in charset
    expect(ROOM_CODE_LENGTH).toBe(6);
  });

  it("parses bare codes and join URLs", () => {
    expect(parseRoomCodeInput("ab3k9q")).toBe("AB3K9Q");
    expect(parseRoomCodeInput("https://example.com/rooms/AB3K9Q")).toBe("AB3K9Q");
    expect(parseRoomCodeInput("https://example.com/rooms/AB3K9Q?x=1")).toBe("AB3K9Q");
    expect(parseRoomCodeInput("!!!!!!")).toBeNull();
    expect(parseRoomCodeInput("SHORT")).toBeNull();
    expect(parseRoomCodeInput("000000")).toBeNull();
  });

  it("builds join paths and URLs", () => {
    expect(buildRoomJoinPath("ab3k9q")).toBe("/rooms/AB3K9Q");
    expect(buildRoomJoinUrl("http://localhost:3000/", "AB3K9Q")).toBe(
      "http://localhost:3000/rooms/AB3K9Q",
    );
  });
});

describe("splitRoomQueue", () => {
  it("keeps history above pointer and upcoming after", () => {
    const room = baseRoom({
      queue: [item(0), item(1), item(2), item(3)],
      playback: { isPlaying: true, currentIndex: 1, currentTrackId: "track-1" },
    });
    const { history, upcoming, nowPlaying } = splitRoomQueue(room);
    expect(history.map((i) => i.position)).toEqual([0]);
    expect(nowPlaying?.position).toBe(1);
    expect(upcoming.map((i) => i.position)).toEqual([2, 3]);
  });

  it("tolerates missing queue or playback without throwing", () => {
    expect(
      splitRoomQueue({
        queue: undefined as unknown as [],
        playback: undefined as unknown as {
          isPlaying: false;
          currentIndex: -1;
          currentTrackId: null;
        },
      }),
    ).toEqual({ history: [], upcoming: [], nowPlaying: null });
  });
});

describe("host failover helpers", () => {
  it("detects current host", () => {
    expect(isCurrentHost(baseRoom())).toBe(true);
    expect(
      isCurrentHost(
        baseRoom({
          me: {
            id: "dj-1",
            displayName: "DJ",
            role: "dj",
            userId: "u2",
            isGuest: false,
            lastHeartbeatAt: null,
            isOriginalHost: false,
          },
        }),
      ),
    ).toBe(false);
  });

  it("allows reclaim for original host who lost the seat", () => {
    expect(canReclaimHost(baseRoom())).toBe(false);
    expect(
      canReclaimHost(
        baseRoom({
          currentHostParticipantId: "dj-1",
          me: {
            id: "host-1",
            displayName: "Kody",
            role: "dj",
            userId: "user-1",
            isGuest: false,
            lastHeartbeatAt: null,
            isOriginalHost: true,
          },
        }),
      ),
    ).toBe(true);
  });

  it("allows become-host when server flags takeover", () => {
    expect(canBecomeHost(baseRoom())).toBe(false);
    expect(
      canBecomeHost(
        baseRoom({
          hostTakeoverAvailable: true,
          currentHostParticipantId: "host-1",
          me: {
            id: "dj-1",
            displayName: "DJ",
            role: "dj",
            userId: "u2",
            isGuest: false,
            lastHeartbeatAt: null,
            isOriginalHost: false,
          },
        }),
      ),
    ).toBe(true);
  });
});
