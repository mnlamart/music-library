import { sessionKey } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { authSessionStorage } from "#app/utils/session.server.ts";

/**
 * True when the cookie belongs to an active admin session.
 * Used to skip the admin mutation rate limit. A missing, expired, disabled,
 * or non-admin session stays limited.
 */
export async function requestHasActiveAdminSession(cookieHeader: string | null): Promise<boolean> {
  const authSession = await authSessionStorage.getSession(cookieHeader);
  const sessionId = authSession.get(sessionKey);
  if (typeof sessionId !== "string" || sessionId.length === 0) return false;

  const session = await prisma.session.findUnique({
    where: { id: sessionId, expirationDate: { gt: new Date() } },
    select: {
      user: {
        select: {
          disabledAt: true,
          roles: { where: { name: "admin" }, select: { id: true }, take: 1 },
        },
      },
    },
  });

  if (!session || session.user.disabledAt) return false;
  return session.user.roles.length > 0;
}
