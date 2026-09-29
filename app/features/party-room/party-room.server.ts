import { prisma } from "#app/utils/db.server.ts";
import { canManageRoom, isRoomRole } from "./capabilities.ts";
import { generateRoomCode, isValidRoomCode } from "./codes.ts";
import {
  DEFAULT_JOIN_ROLE,
  EMPTY_ROOM_TTL_MS,
  GUEST_DISPLAY_NAME_MAX,
  GUEST_DISPLAY_NAME_MIN,
  HOST_GRACE_MS,
  MAX_ACTIVE_ROOMS_PER_CREATOR,
  MAX_PARTICIPANTS,
  ROOM_ROLE,
  ROOM_STATUS,
  type DefaultJoinRole,
  type RoomRole,
} from "./constants.ts";
import { createGuestToken, hashGuestToken } from "./guest-token.server.ts";
import { publishRoomEvent } from "./sse.server.ts";

export type PartyRoomErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "room_ended"
  | "invalid_code"
  | "invalid_display_name"
  | "invalid_role"
  | "room_full"
  | "already_in_room"
  | "creator_has_active_room"
  | "host_still_present"
  | "not_original_host"
  | "rate_limited"
  | "queue_full"
  | "track_no_audio"
  | "invalid_queue_op"
  | "conflict";

export class PartyRoomError extends Error {
  readonly code: PartyRoomErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: PartyRoomErrorCode,
    message: string,
    status: number,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PartyRoomError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isDefaultJoinRole(value: string): value is DefaultJoinRole {
  return value === DEFAULT_JOIN_ROLE.listener || value === DEFAULT_JOIN_ROLE.dj;
}

export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < GUEST_DISPLAY_NAME_MIN || name.length > GUEST_DISPLAY_NAME_MAX) {
    return null;
  }
  return name;
}

async function allocateUniqueCode(maxAttempts = 20): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRoomCode();
    const existing = await prisma.room.findFirst({
      where: { code, status: ROOM_STATUS.open },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new PartyRoomError("conflict", "Could not allocate a unique room code", 503);
}

async function bumpRoomVersion(roomId: string) {
  return prisma.room.update({
    where: { id: roomId },
    data: { roomVersion: { increment: 1 } },
    select: { roomVersion: true },
  });
}

async function emitRoomSnapshot(roomId: string) {
  const snapshot = await getRoomSnapshot(roomId);
  if (snapshot) {
    publishRoomEvent(roomId, { type: "room_snapshot", ...snapshot });
  }
  return snapshot;
}

export async function maybeAutoCloseEmptyRoom(roomId: string, now = new Date()) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, status: true, emptySince: true },
  });
  if (!room || room.status !== ROOM_STATUS.open || !room.emptySince) return null;
  if (now.getTime() - room.emptySince.getTime() < EMPTY_ROOM_TTL_MS) return null;
  return endRoom({ roomId, actor: { type: "system" } });
}

export async function createRoom({
  userId,
  displayName,
  defaultJoinRole = DEFAULT_JOIN_ROLE.listener,
}: {
  userId: string;
  displayName: string;
  defaultJoinRole?: DefaultJoinRole;
}) {
  const name = normalizeDisplayName(displayName);
  if (!name) {
    throw new PartyRoomError(
      "invalid_display_name",
      `Display name must be ${GUEST_DISPLAY_NAME_MIN}–${GUEST_DISPLAY_NAME_MAX} characters`,
      400,
    );
  }
  if (!isDefaultJoinRole(defaultJoinRole)) {
    throw new PartyRoomError("invalid_role", "defaultJoinRole must be listener or dj", 400);
  }

  const activeAsCreator = await prisma.room.count({
    where: { originalHostUserId: userId, status: ROOM_STATUS.open },
  });
  if (activeAsCreator >= MAX_ACTIVE_ROOMS_PER_CREATOR) {
    throw new PartyRoomError("creator_has_active_room", "You already have an active room", 409);
  }

  const activeAsParticipant = await prisma.roomParticipant.findFirst({
    where: {
      userId,
      leftAt: null,
      room: { status: ROOM_STATUS.open },
    },
    select: { id: true, roomId: true },
  });
  if (activeAsParticipant) {
    throw new PartyRoomError(
      "already_in_room",
      "Leave your current room before creating another",
      409,
    );
  }

  const code = await allocateUniqueCode();
  const now = new Date();

  const room = await prisma.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        code,
        status: ROOM_STATUS.open,
        defaultJoinRole,
        currentIndex: 0,
        roomVersion: 1,
        isPlaying: false,
        originalHostUserId: userId,
        updatedAt: now,
      },
    });

    const host = await tx.roomParticipant.create({
      data: {
        roomId: created.id,
        userId,
        displayName: name,
        role: ROOM_ROLE.host,
        lastSeenAt: now,
      },
    });

    return tx.room.update({
      where: { id: created.id },
      data: { currentHostParticipantId: host.id },
      include: {
        participants: { where: { leftAt: null } },
        queueItems: { orderBy: { position: "asc" } },
      },
    });
  });

  await emitRoomSnapshot(room.id);
  return room;
}

export async function findOpenRoomByCode(code: string) {
  if (!isValidRoomCode(code)) {
    throw new PartyRoomError("invalid_code", "Invalid room code", 400);
  }
  const room = await prisma.room.findFirst({
    where: { code, status: ROOM_STATUS.open },
  });
  if (!room) {
    throw new PartyRoomError("not_found", "Room not found", 404);
  }
  await maybeAutoCloseEmptyRoom(room.id);
  const refreshed = await prisma.room.findFirst({
    where: { id: room.id, status: ROOM_STATUS.open },
  });
  if (!refreshed) {
    throw new PartyRoomError("room_ended", "Room has ended", 410);
  }
  return refreshed;
}

type JoinActor =
  | { type: "user"; userId: string; displayName?: string }
  | { type: "guest"; displayName: string; guestToken?: string | null };

export async function joinRoom({ code, actor }: { code: string; actor: JoinActor }) {
  const room = await findOpenRoomByCode(code);

  const activeCount = await prisma.roomParticipant.count({
    where: { roomId: room.id, leftAt: null },
  });
  if (activeCount >= MAX_PARTICIPANTS) {
    throw new PartyRoomError("room_full", "Room is full", 409);
  }

  const joinRole =
    room.defaultJoinRole === DEFAULT_JOIN_ROLE.dj ? ROOM_ROLE.dj : ROOM_ROLE.listener;
  const now = new Date();

  if (actor.type === "user") {
    const existingElsewhere = await prisma.roomParticipant.findFirst({
      where: {
        userId: actor.userId,
        leftAt: null,
        room: { status: ROOM_STATUS.open },
        NOT: { roomId: room.id },
      },
      select: { id: true },
    });
    if (existingElsewhere) {
      throw new PartyRoomError(
        "already_in_room",
        "Leave your current room before joining another",
        409,
      );
    }

    const existingHere = await prisma.roomParticipant.findFirst({
      where: { roomId: room.id, userId: actor.userId },
    });

    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, username: true },
    });
    const displayName =
      normalizeDisplayName(actor.displayName ?? "") ??
      normalizeDisplayName(user?.name ?? "") ??
      normalizeDisplayName(user?.username ?? "User") ??
      "User";

    if (existingHere) {
      const participant = await prisma.roomParticipant.update({
        where: { id: existingHere.id },
        data: {
          leftAt: null,
          lastSeenAt: now,
          displayName,
          // Rejoining does not steal host; keep prior role unless they left as host
          // and room already has another host — revive as default join role if was host.
          role:
            existingHere.role === ROOM_ROLE.host &&
            room.currentHostParticipantId !== existingHere.id
              ? joinRole
              : existingHere.leftAt
                ? existingHere.role === ROOM_ROLE.host
                  ? joinRole
                  : existingHere.role
                : existingHere.role,
        },
      });
      await prisma.room.update({
        where: { id: room.id },
        data: { emptySince: null },
      });
      await bumpRoomVersion(room.id);
      await emitRoomSnapshot(room.id);
      return { roomId: room.id, code: room.code, participant, guestToken: null as string | null };
    }

    const participant = await prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId: actor.userId,
        displayName,
        role: joinRole,
        lastSeenAt: now,
      },
    });
    await prisma.room.update({
      where: { id: room.id },
      data: { emptySince: null },
    });
    await bumpRoomVersion(room.id);
    await emitRoomSnapshot(room.id);
    return { roomId: room.id, code: room.code, participant, guestToken: null as string | null };
  }

  // Guest path
  const displayName = normalizeDisplayName(actor.displayName);
  if (!displayName) {
    throw new PartyRoomError(
      "invalid_display_name",
      `Display name must be ${GUEST_DISPLAY_NAME_MIN}–${GUEST_DISPLAY_NAME_MAX} characters`,
      400,
    );
  }

  let token = actor.guestToken ?? null;
  let tokenHash = token ? hashGuestToken(token) : null;

  if (tokenHash) {
    const existing = await prisma.roomParticipant.findFirst({
      where: { roomId: room.id, guestTokenHash: tokenHash },
    });
    if (existing) {
      const elsewhere = await prisma.roomParticipant.findFirst({
        where: {
          guestTokenHash: tokenHash,
          leftAt: null,
          room: { status: ROOM_STATUS.open },
          NOT: { roomId: room.id },
        },
        select: { id: true },
      });
      if (elsewhere) {
        throw new PartyRoomError(
          "already_in_room",
          "Leave your current room before joining another",
          409,
        );
      }
      const participant = await prisma.roomParticipant.update({
        where: { id: existing.id },
        data: {
          leftAt: null,
          lastSeenAt: now,
          displayName,
          role:
            existing.role === ROOM_ROLE.host
              ? joinRole
              : existing.leftAt
                ? joinRole
                : existing.role,
        },
      });
      await prisma.room.update({ where: { id: room.id }, data: { emptySince: null } });
      await bumpRoomVersion(room.id);
      await emitRoomSnapshot(room.id);
      return { roomId: room.id, code: room.code, participant, guestToken: token };
    }
  }

  token = createGuestToken();
  tokenHash = hashGuestToken(token);

  const participant = await prisma.roomParticipant.create({
    data: {
      roomId: room.id,
      guestTokenHash: tokenHash,
      displayName,
      role: joinRole,
      lastSeenAt: now,
    },
  });
  await prisma.room.update({ where: { id: room.id }, data: { emptySince: null } });
  await bumpRoomVersion(room.id);
  await emitRoomSnapshot(room.id);
  return { roomId: room.id, code: room.code, participant, guestToken: token };
}

export type ParticipantActor =
  | { type: "user"; userId: string }
  | { type: "guest"; guestToken: string }
  | { type: "system" };

export async function resolveParticipant(roomId: string, actor: ParticipantActor) {
  if (actor.type === "system") return null;
  if (actor.type === "user") {
    return prisma.roomParticipant.findFirst({
      where: { roomId, userId: actor.userId, leftAt: null },
    });
  }
  const hash = hashGuestToken(actor.guestToken);
  return prisma.roomParticipant.findFirst({
    where: { roomId, guestTokenHash: hash, leftAt: null },
  });
}

export async function requireParticipant(roomId: string, actor: ParticipantActor) {
  const participant = await resolveParticipant(roomId, actor);
  if (!participant) {
    throw new PartyRoomError("unauthorized", "Not a participant in this room", 401);
  }
  return participant;
}

export async function leaveRoom({ roomId, actor }: { roomId: string; actor: ParticipantActor }) {
  const participant = await requireParticipant(roomId, actor);
  const now = new Date();
  const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });

  if (room.status !== ROOM_STATUS.open) {
    throw new PartyRoomError("room_ended", "Room has ended", 410);
  }

  await prisma.roomParticipant.update({
    where: { id: participant.id },
    data: { leftAt: now },
  });

  const remaining = await prisma.roomParticipant.count({
    where: { roomId, leftAt: null },
  });

  const updates: {
    emptySince?: Date | null;
    currentHostParticipantId?: string | null;
    isPlaying?: boolean;
    roomVersion: { increment: number };
  } = { roomVersion: { increment: 1 } };

  if (remaining === 0) {
    updates.emptySince = now;
  }

  if (room.currentHostParticipantId === participant.id) {
    updates.currentHostParticipantId = null;
    updates.isPlaying = false;
  }

  await prisma.room.update({ where: { id: roomId }, data: updates });
  await emitRoomSnapshot(roomId);
  return { left: true, remaining };
}

export async function endRoom({ roomId, actor }: { roomId: string; actor: ParticipantActor }) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) throw new PartyRoomError("not_found", "Room not found", 404);
  if (room.status !== ROOM_STATUS.open) {
    return room;
  }

  if (actor.type !== "system") {
    const participant = await requireParticipant(roomId, actor);
    if (!canManageRoom(participant.role as RoomRole)) {
      throw new PartyRoomError("forbidden", "Only the Host can end the room", 403);
    }
  }

  const now = new Date();
  const ended = await prisma.$transaction(async (tx) => {
    await tx.roomParticipant.updateMany({
      where: { roomId, leftAt: null },
      data: { leftAt: now },
    });
    return tx.room.update({
      where: { id: roomId },
      data: {
        status: ROOM_STATUS.ended,
        endedAt: now,
        currentHostParticipantId: null,
        isPlaying: false,
        emptySince: null,
        roomVersion: { increment: 1 },
      },
    });
  });

  publishRoomEvent(roomId, {
    type: "room_ended",
    roomId,
    roomVersion: ended.roomVersion,
  });
  return ended;
}

export async function setDefaultJoinRole({
  roomId,
  actor,
  defaultJoinRole,
}: {
  roomId: string;
  actor: ParticipantActor;
  defaultJoinRole: string;
}) {
  if (!isDefaultJoinRole(defaultJoinRole)) {
    throw new PartyRoomError("invalid_role", "defaultJoinRole must be listener or dj", 400);
  }
  const participant = await requireParticipant(roomId, actor);
  if (!canManageRoom(participant.role as RoomRole)) {
    throw new PartyRoomError("forbidden", "Only the Host can change join defaults", 403);
  }
  await prisma.room.update({
    where: { id: roomId },
    data: { defaultJoinRole, roomVersion: { increment: 1 } },
  });
  return emitRoomSnapshot(roomId);
}

export async function changeParticipantRole({
  roomId,
  actor,
  targetParticipantId,
  role,
}: {
  roomId: string;
  actor: ParticipantActor;
  targetParticipantId: string;
  role: string;
}) {
  if (!isRoomRole(role) || role === ROOM_ROLE.host) {
    throw new PartyRoomError(
      "invalid_role",
      "Role must be dj or listener (use become-host / reclaim-host for Host)",
      400,
    );
  }
  const actorParticipant = await requireParticipant(roomId, actor);
  if (!canManageRoom(actorParticipant.role as RoomRole)) {
    throw new PartyRoomError("forbidden", "Only the Host can change roles", 403);
  }
  const target = await prisma.roomParticipant.findFirst({
    where: { id: targetParticipantId, roomId, leftAt: null },
  });
  if (!target) throw new PartyRoomError("not_found", "Participant not found", 404);
  if (target.role === ROOM_ROLE.host) {
    throw new PartyRoomError("forbidden", "Cannot demote Host via role change", 403);
  }

  await prisma.roomParticipant.update({
    where: { id: target.id },
    data: { role },
  });
  await bumpRoomVersion(roomId);
  return emitRoomSnapshot(roomId);
}

export async function kickParticipant({
  roomId,
  actor,
  targetParticipantId,
}: {
  roomId: string;
  actor: ParticipantActor;
  targetParticipantId: string;
}) {
  const actorParticipant = await requireParticipant(roomId, actor);
  if (!canManageRoom(actorParticipant.role as RoomRole)) {
    throw new PartyRoomError("forbidden", "Only the Host can kick participants", 403);
  }
  if (actorParticipant.id === targetParticipantId) {
    throw new PartyRoomError("forbidden", "Host cannot kick themselves", 400);
  }
  const target = await prisma.roomParticipant.findFirst({
    where: { id: targetParticipantId, roomId, leftAt: null },
  });
  if (!target) throw new PartyRoomError("not_found", "Participant not found", 404);

  const now = new Date();
  await prisma.roomParticipant.update({
    where: { id: target.id },
    data: { leftAt: now },
  });
  await bumpRoomVersion(roomId);
  return emitRoomSnapshot(roomId);
}

export async function heartbeat({ roomId, actor }: { roomId: string; actor: ParticipantActor }) {
  const participant = await requireParticipant(roomId, actor);
  const now = new Date();
  await prisma.roomParticipant.update({
    where: { id: participant.id },
    data: { lastSeenAt: now },
  });
  return { ok: true as const, lastSeenAt: now.toISOString() };
}

export async function becomeHost({
  roomId,
  actor,
  now = new Date(),
}: {
  roomId: string;
  actor: ParticipantActor;
  now?: Date;
}) {
  const participant = await requireParticipant(roomId, actor);

  await prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || room.status !== ROOM_STATUS.open) {
      throw new PartyRoomError("not_found", "Room not found", 404);
    }

    // Another concurrent becomeHost may have already claimed the seat.
    if (room.currentHostParticipantId === participant.id) {
      return;
    }

    if (room.currentHostParticipantId) {
      const currentHost = await tx.roomParticipant.findUnique({
        where: { id: room.currentHostParticipantId },
      });
      if (currentHost && !currentHost.leftAt) {
        const silentFor = now.getTime() - currentHost.lastSeenAt.getTime();
        if (silentFor < HOST_GRACE_MS) {
          throw new PartyRoomError("host_still_present", "Current Host is still connected", 409);
        }
        await tx.roomParticipant.update({
          where: { id: currentHost.id },
          data: { role: ROOM_ROLE.dj },
        });
      }
    }

    await tx.roomParticipant.update({
      where: { id: participant.id },
      data: { role: ROOM_ROLE.host, lastSeenAt: now },
    });
    await tx.room.update({
      where: { id: roomId },
      data: {
        currentHostParticipantId: participant.id,
        isPlaying: false,
        roomVersion: { increment: 1 },
      },
    });
  });

  return emitRoomSnapshot(roomId);
}

export async function reclaimHost({ roomId, actor }: { roomId: string; actor: ParticipantActor }) {
  if (actor.type !== "user") {
    throw new PartyRoomError("forbidden", "Only the original host user can reclaim", 403);
  }
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status !== ROOM_STATUS.open) {
    throw new PartyRoomError("not_found", "Room not found", 404);
  }
  if (room.originalHostUserId !== actor.userId) {
    throw new PartyRoomError("not_original_host", "Only the original host can reclaim", 403);
  }

  const participant = await requireParticipant(roomId, actor);
  const now = new Date();

  if (room.currentHostParticipantId && room.currentHostParticipantId !== participant.id) {
    await prisma.roomParticipant.update({
      where: { id: room.currentHostParticipantId },
      data: { role: ROOM_ROLE.dj },
    });
  }

  await prisma.$transaction([
    prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { role: ROOM_ROLE.host, lastSeenAt: now },
    }),
    prisma.room.update({
      where: { id: roomId },
      data: {
        currentHostParticipantId: participant.id,
        isPlaying: false,
        roomVersion: { increment: 1 },
      },
    }),
  ]);

  return emitRoomSnapshot(roomId);
}

export async function getRoomSnapshot(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: {
        where: { leftAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          role: true,
          lastSeenAt: true,
          createdAt: true,
        },
      },
      queueItems: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          trackId: true,
          position: true,
          addedByParticipantId: true,
          createdAt: true,
          track: {
            select: {
              id: true,
              title: true,
              duration: true,
              artist: { select: { id: true, name: true } },
              coverImage: { select: { objectKey: true } },
            },
          },
        },
      },
    },
  });
  if (!room) return null;

  return {
    roomId: room.id,
    code: room.code,
    status: room.status,
    defaultJoinRole: room.defaultJoinRole,
    currentIndex: room.currentIndex,
    roomVersion: room.roomVersion,
    isPlaying: room.isPlaying,
    originalHostUserId: room.originalHostUserId,
    currentHostParticipantId: room.currentHostParticipantId,
    emptySince: room.emptySince?.toISOString() ?? null,
    endedAt: room.endedAt?.toISOString() ?? null,
    createdAt: room.createdAt.toISOString(),
    participants: room.participants.map((p) => ({
      ...p,
      lastSeenAt: p.lastSeenAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
    queue: room.queueItems.map((item) => ({
      id: item.id,
      trackId: item.trackId,
      position: item.position,
      addedByParticipantId: item.addedByParticipantId,
      createdAt: item.createdAt.toISOString(),
      track: item.track,
    })),
  };
}

export async function getRoomSnapshotByCode(code: string) {
  const room = await findOpenRoomByCode(code);
  return getRoomSnapshot(room.id);
}
