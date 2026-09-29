import { parseString } from "set-cookie-parser";
import { beforeEach, describe, expect, test } from "vitest";
import { getSessionExpirationDate, sessionKey } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { authSessionStorage } from "#app/utils/session.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { action as createRoomAction } from "#app/routes/api+/rooms+/index.tsx";
import { action as joinRoomAction } from "#app/routes/api+/rooms+/$roomCode.join.tsx";
import { loader as qrLoader } from "#app/routes/api+/rooms+/$roomCode.qr.tsx";
import { loader as snapshotLoader } from "#app/routes/api+/rooms+/$roomCode.tsx";
import { action as endRoomAction } from "#app/routes/api+/rooms+/$roomCode.end.tsx";
import { action as queueAction } from "#app/routes/api+/rooms+/$roomCode.queue.tsx";
import { GUEST_TOKEN_COOKIE_NAME } from "#app/features/party-room/guest-token.server.ts";

async function cleanup() {
  await prisma.roomPlayEvent.deleteMany();
  await prisma.roomQueueItem.deleteMany();
  await prisma.roomParticipant.deleteMany();
  await prisma.room.deleteMany();
  await prisma.trackAudioFile.deleteMany();
  await prisma.track.deleteMany();
  await prisma.artist.deleteMany();
  await prisma.user.deleteMany();
}

async function createUserCookie(name = "Host") {
  const user = await prisma.user.create({
    data: {
      ...createUser(),
      name,
      roles: { connect: { name: "user" } },
    },
  });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expirationDate: getSessionExpirationDate(),
    },
  });
  const authSession = await authSessionStorage.getSession();
  authSession.set(sessionKey, session.id);
  const setCookieHeader = await authSessionStorage.commitSession(authSession);
  const parsedCookie = parseString(setCookieHeader)!;
  return {
    userId: user.id,
    cookie: `${parsedCookie.name}=${parsedCookie.value}`,
  };
}

async function makeTrackWithAudio(title: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const service = await prisma.service.upsert({
    where: { name: "local" },
    update: {},
    create: { name: "local", displayName: "Local Upload", baseUrl: "", isActive: true },
  });
  const track = await prisma.track.create({
    data: {
      title,
      externalId: `ext-${suffix}`,
      service: { connect: { id: service.id } },
      artist: {
        create: { name: `Artist ${suffix}`, normalizedName: `artist ${suffix}` },
      },
    },
  });
  await prisma.trackAudioFile.create({
    data: {
      trackId: track.id,
      objectKey: `audio/tracks/local/${track.id}.mp3`,
      format: "mp3",
    },
  });
  return track;
}

describe("rooms API", () => {
  beforeEach(async () => {
    await cleanup();
  });

  test("create → join guest → snapshot → QR → queue add → end", async () => {
    const { cookie } = await createUserCookie("Host");

    const createRes = await createRoomAction({
      request: new Request("http://localhost/api/rooms", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Host", defaultJoinRole: "listener" }),
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { code: string; roomId: string };
    expect(created.code).toHaveLength(6);

    const joinRes = await joinRoomAction({
      request: new Request(`http://localhost/api/rooms/${created.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Walkup" }),
      }),
      params: { roomCode: created.code },
    });
    expect(joinRes.status).toBe(200);
    const guestCookie = joinRes.headers.get("Set-Cookie");
    expect(guestCookie).toContain(GUEST_TOKEN_COOKIE_NAME);

    const snapRes = await snapshotLoader({
      request: new Request(`http://localhost/api/rooms/${created.code}`),
      params: { roomCode: created.code },
    });
    expect(snapRes.status).toBe(200);
    const snap = (await snapRes.json()) as { participants: unknown[]; queue: unknown[] };
    expect(snap.participants).toHaveLength(2);
    expect(snap.queue).toHaveLength(0);

    const qrRes = await qrLoader({
      request: new Request(`http://localhost/api/rooms/${created.code}/qr`),
      params: { roomCode: created.code },
    });
    expect(qrRes.status).toBe(200);
    const qr = (await qrRes.json()) as { joinUrl: string; qrDataUrl: string };
    expect(qr.joinUrl).toContain(`/rooms/${created.code}`);
    expect(qr.qrDataUrl.startsWith("data:image")).toBe(true);

    const track = await makeTrackWithAudio("Party Track");
    const queueRes = await queueAction({
      request: new Request(`http://localhost/api/rooms/${created.code}/queue`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "add_track", trackId: track.id }),
      }),
      params: { roomCode: created.code },
    });
    expect(queueRes.status).toBe(200);
    const queued = (await queueRes.json()) as { queue: unknown[]; roomVersion: number };
    expect(queued.queue).toHaveLength(1);

    const endRes = await endRoomAction({
      request: new Request(`http://localhost/api/rooms/${created.code}/end`, {
        method: "POST",
        headers: { cookie },
      }),
      params: { roomCode: created.code },
    });
    expect(endRes.status).toBe(200);
    const ended = (await endRes.json()) as { status: string };
    expect(ended.status).toBe("ended");

    const afterEnd = await snapshotLoader({
      request: new Request(`http://localhost/api/rooms/${created.code}`),
      params: { roomCode: created.code },
    });
    expect(afterEnd.status).toBe(404);
  });
});
