import { parseString } from "set-cookie-parser";
import { afterEach, expect, test } from "vitest";
import { getSessionExpirationDate, sessionKey } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { authSessionStorage } from "#app/utils/session.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { requestHasActiveAdminSession } from "./mutation-rate-limit.server.ts";

const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdUserIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdUserIds.length = 0;
});

async function cookieFor(sessionId: string | null) {
  const authSession = await authSessionStorage.getSession();
  if (sessionId) authSession.set(sessionKey, sessionId);
  const setCookieHeader = await authSessionStorage.commitSession(authSession);
  const parsed = parseString(setCookieHeader);
  if (!parsed) throw new Error("Session cookie was not committed");
  return `${parsed.name}=${parsed.value}`;
}

async function createAccount(role: "admin" | "user" | null, options?: { disabled?: boolean }) {
  const user = await prisma.user.create({
    data: {
      ...createUser(),
      disabledAt: options?.disabled ? new Date() : null,
      roles: role
        ? {
            connectOrCreate: {
              where: { name: role },
              create: { name: role },
            },
          }
        : undefined,
    },
  });
  createdUserIds.push(user.id);
  const session = await prisma.session.create({
    data: {
      expirationDate: getSessionExpirationDate(),
      userId: user.id,
    },
  });
  return { user, session };
}

test("a logged-in admin is exempt from the admin rate limit", async () => {
  const { session } = await createAccount("admin");
  await expect(requestHasActiveAdminSession(await cookieFor(session.id))).resolves.toBe(true);
});

test("missing, expired, disabled, and non-admin sessions stay limited", async () => {
  await expect(requestHasActiveAdminSession(null)).resolves.toBe(false);
  await expect(requestHasActiveAdminSession(await cookieFor(null))).resolves.toBe(false);

  const listener = await createAccount("user");
  await expect(requestHasActiveAdminSession(await cookieFor(listener.session.id))).resolves.toBe(
    false,
  );

  const disabled = await createAccount("admin", { disabled: true });
  await expect(requestHasActiveAdminSession(await cookieFor(disabled.session.id))).resolves.toBe(
    false,
  );

  const { session } = await createAccount("admin");
  await prisma.session.update({
    where: { id: session.id },
    data: { expirationDate: new Date(Date.now() - 60_000) },
  });
  await expect(requestHasActiveAdminSession(await cookieFor(session.id))).resolves.toBe(false);
});
