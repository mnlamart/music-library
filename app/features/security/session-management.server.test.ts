import { expect, test } from "vitest";
import { getSessionExpirationDate } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { createUser } from "#tests/db-utils.ts";
import {
  forceLogoutSession,
  forceLogoutUserSessions,
  listActiveSessions,
} from "./session-management.server.ts";
import { recordLoginSuccess } from "./track-event.server.ts";

test("force logout ends one session and then every session for a user", async () => {
  const actor = await prisma.user.create({ data: createUser() });
  const user = await prisma.user.create({ data: createUser() });
  const first = await prisma.session.create({
    data: { userId: user.id, expirationDate: getSessionExpirationDate() },
  });
  const second = await prisma.session.create({
    data: { userId: user.id, expirationDate: getSessionExpirationDate() },
  });

  const request = new Request("http://localhost/admin/security-events", {
    headers: { "fly-client-ip": "203.0.113.9", "user-agent": "AdminBrowser/2" },
  });
  await recordLoginSuccess({
    request,
    userId: user.id,
    username: user.username,
    sessionId: first.id,
  });

  const listed = await listActiveSessions();
  const row = listed.find((session) => session.id === first.id);
  expect(row?.username).toBe(user.username);
  expect(row?.ipHash).toMatch(/^[0-9a-f]{16}$/);
  expect(row?.device).toBe("AdminBrowser/2");
  expect(JSON.stringify(row)).not.toContain("203.0.113.9");

  const one = await forceLogoutSession({
    sessionId: first.id,
    actorUserId: actor.id,
    request,
  });
  expect(one.ok).toBe(true);
  expect(await prisma.session.findUnique({ where: { id: first.id } })).toBeNull();
  expect(await prisma.session.findUnique({ where: { id: second.id } })).not.toBeNull();

  const all = await forceLogoutUserSessions({
    userId: user.id,
    actorUserId: actor.id,
    request,
  });
  expect(all.ok).toBe(true);
  if (all.ok) expect(all.count).toBe(1);
  expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
});
