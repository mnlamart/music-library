import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { HOST_GRACE_MS, MAX_PARTICIPANTS, ROOM_ROLE } from "./constants.ts";
import { hashGuestToken } from "./guest-token.server.ts";
import {
  becomeHost,
  createRoom,
  endRoom,
  joinRoom,
  leaveRoom,
  PartyRoomError,
  reclaimHost,
  setDefaultJoinRole,
} from "./party-room.server.ts";
import { resetRoomSseConnections } from "./sse.server.ts";

async function cleanup() {
  await prisma.roomPlayEvent.deleteMany();
  await prisma.roomQueueItem.deleteMany();
  await prisma.roomParticipant.deleteMany();
  await prisma.room.deleteMany();
  await prisma.userPlaylistTrack.deleteMany();
  await prisma.userPlaylist.deleteMany();
  await prisma.trackAudioFile.deleteMany();
  await prisma.track.deleteMany();
  await prisma.artist.deleteMany();
  await prisma.user.deleteMany();
  resetRoomSseConnections();
}

async function makeUser(name = "Host User") {
  return prisma.user.create({
    data: {
      ...createUser(),
      name,
      roles: { connect: { name: "user" } },
    },
  });
}

describe("party-room lifecycle", () => {
  beforeEach(async () => {
    await cleanup();
  });

  test("createRoom makes Host + empty queue + unique code", async () => {
    const user = await makeUser("Kody");
    const room = await createRoom({
      userId: user.id,
      displayName: "Kody",
      defaultJoinRole: "dj",
    });

    expect(room.code).toHaveLength(6);
    expect(room.status).toBe("open");
    expect(room.defaultJoinRole).toBe("dj");
    expect(room.currentIndex).toBe(0);
    expect(room.queueItems).toHaveLength(0);
    expect(room.participants).toHaveLength(1);
    expect(room.participants[0]?.role).toBe(ROOM_ROLE.host);
    expect(room.currentHostParticipantId).toBe(room.participants[0]?.id);
  });

  test("creator cannot open a second active room", async () => {
    const user = await makeUser();
    await createRoom({ userId: user.id, displayName: "Host" });
    await expect(createRoom({ userId: user.id, displayName: "Host" })).rejects.toMatchObject({
      code: "creator_has_active_room",
    });
  });

  test("smart join links authenticated users and creates guest seats", async () => {
    const host = await makeUser("Host");
    const room = await createRoom({ userId: host.id, displayName: "Host" });

    const member = await makeUser("Alice");
    const linked = await joinRoom({
      code: room.code,
      actor: { type: "user", userId: member.id, displayName: "Alice" },
    });
    expect(linked.participant.userId).toBe(member.id);
    expect(linked.participant.role).toBe(ROOM_ROLE.listener);
    expect(linked.guestToken).toBeNull();

    const guest = await joinRoom({
      code: room.code,
      actor: { type: "guest", displayName: "Bob" },
    });
    expect(guest.participant.userId).toBeNull();
    expect(guest.participant.guestTokenHash).toBe(hashGuestToken(guest.guestToken!));
    expect(guest.participant.displayName).toBe("Bob");
    expect(guest.participant.role).toBe(ROOM_ROLE.listener);
  });

  test("defaultJoinRole dj promotes new joiners to DJ", async () => {
    const host = await makeUser();
    const room = await createRoom({
      userId: host.id,
      displayName: "Host",
      defaultJoinRole: "dj",
    });
    const guest = await joinRoom({
      code: room.code,
      actor: { type: "guest", displayName: "DJ Walkup" },
    });
    expect(guest.participant.role).toBe(ROOM_ROLE.dj);
  });

  test("rejects invalid guest display names", async () => {
    const host = await makeUser();
    const room = await createRoom({ userId: host.id, displayName: "Host" });
    await expect(
      joinRoom({ code: room.code, actor: { type: "guest", displayName: "" } }),
    ).rejects.toMatchObject({ code: "invalid_display_name" });
    await expect(
      joinRoom({
        code: room.code,
        actor: { type: "guest", displayName: "x".repeat(25) },
      }),
    ).rejects.toMatchObject({ code: "invalid_display_name" });
  });

  test("enforces max participants", async () => {
    const host = await makeUser();
    const room = await createRoom({ userId: host.id, displayName: "Host" });

    // Fill remaining seats (host already counts as 1)
    for (let i = 0; i < MAX_PARTICIPANTS - 1; i++) {
      await joinRoom({
        code: room.code,
        actor: { type: "guest", displayName: `G${String(i).padStart(2, "0")}` },
      });
    }

    await expect(
      joinRoom({ code: room.code, actor: { type: "guest", displayName: "Overflow" } }),
    ).rejects.toMatchObject({ code: "room_full" });
  });

  test("leave and end room; codes stop working for ended rooms", async () => {
    const host = await makeUser();
    const room = await createRoom({ userId: host.id, displayName: "Host" });
    const guest = await joinRoom({
      code: room.code,
      actor: { type: "guest", displayName: "Guest" },
    });

    await leaveRoom({
      roomId: room.id,
      actor: { type: "guest", guestToken: guest.guestToken! },
    });

    const remaining = await prisma.roomParticipant.count({
      where: { roomId: room.id, leftAt: null },
    });
    expect(remaining).toBe(1);

    await endRoom({
      roomId: room.id,
      actor: { type: "user", userId: host.id },
    });

    const ended = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).not.toBeNull();

    await expect(
      joinRoom({ code: room.code, actor: { type: "guest", displayName: "Late" } }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  test("host can set defaultJoinRole", async () => {
    const host = await makeUser();
    const room = await createRoom({ userId: host.id, displayName: "Host" });
    const snapshot = await setDefaultJoinRole({
      roomId: room.id,
      actor: { type: "user", userId: host.id },
      defaultJoinRole: "dj",
    });
    expect(snapshot?.defaultJoinRole).toBe("dj");
  });

  test("becomeHost after grace; reclaimHost for original host", async () => {
    const hostUser = await makeUser("Original");
    const room = await createRoom({ userId: hostUser.id, displayName: "Original" });
    const djJoin = await joinRoom({
      code: room.code,
      actor: { type: "guest", displayName: "StandIn" },
    });

    // Promote guest to dj via join default — change default and re-check become host grace
    await expect(
      becomeHost({
        roomId: room.id,
        actor: { type: "guest", guestToken: djJoin.guestToken! },
      }),
    ).rejects.toMatchObject({ code: "host_still_present" });

    // Age the host heartbeat past grace
    await prisma.roomParticipant.update({
      where: { id: room.currentHostParticipantId! },
      data: { lastSeenAt: new Date(Date.now() - HOST_GRACE_MS - 1000) },
    });

    const after = await becomeHost({
      roomId: room.id,
      actor: { type: "guest", guestToken: djJoin.guestToken! },
      now: new Date(),
    });
    expect(after?.currentHostParticipantId).toBe(djJoin.participant.id);
    expect(after?.participants.find((p) => p.id === djJoin.participant.id)?.role).toBe(
      ROOM_ROLE.host,
    );

    const reclaimed = await reclaimHost({
      roomId: room.id,
      actor: { type: "user", userId: hostUser.id },
    });
    expect(reclaimed?.currentHostParticipantId).toBe(room.participants[0]?.id);
  });

  test("PartyRoomError carries status codes", () => {
    const err = new PartyRoomError("forbidden", "nope", 403);
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
  });
});
