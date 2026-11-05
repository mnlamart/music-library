import { ROOM_STATUS } from "#app/features/party-room/constants.ts";
import { hashGuestToken, readGuestToken } from "#app/features/party-room/guest-token.server.ts";
import {
  claimOpenGuestSeatForUser,
  getRoomSnapshot,
} from "#app/features/party-room/party-room.server.ts";
import { resolveActorOptional } from "#app/features/party-room/participant-seat.server.ts";
import { partyRoomErrorResponse } from "#app/features/party-room/request.server.ts";
import { prisma } from "#app/utils/db.server.ts";

/**
 * Open room where this browser still has a seat — signed-in user or guest cookie.
 * 204 when there is no actor or no open seat (leftAt null, room open).
 * A login redirect would look like a room error to the always-on client poll.
 * Logging in on the joining browser claims the guest seat so presence continues,
 * even when a leftover user seat is still open (logout is not Leave).
 */
export async function loader({ request }: { request: Request }) {
  try {
    const actor = await resolveActorOptional(request);
    if (!actor || actor.type === "system") {
      return new Response(null, { status: 204 });
    }

    let seat =
      actor.type === "user"
        ? null
        : await prisma.roomParticipant.findFirst({
            where: {
              guestTokenHash: hashGuestToken(actor.guestToken),
              leftAt: null,
              room: { status: ROOM_STATUS.open },
            },
            orderBy: { lastSeenAt: "desc" },
            select: { roomId: true },
          });

    if (actor.type === "user") {
      const guestToken = await readGuestToken(request);
      if (guestToken) {
        const claimed = await claimOpenGuestSeatForUser({
          userId: actor.userId,
          guestToken,
        });
        if (claimed?.leftAt === null) {
          seat = { roomId: claimed.roomId };
        }
      }
      if (!seat) {
        seat = await prisma.roomParticipant.findFirst({
          where: { userId: actor.userId, leftAt: null, room: { status: ROOM_STATUS.open } },
          orderBy: { createdAt: "desc" },
          select: { roomId: true },
        });
      }
    }

    if (!seat) {
      return new Response(null, { status: 204 });
    }

    const snapshot = await getRoomSnapshot(seat.roomId, actor);
    if (!snapshot || snapshot.status !== ROOM_STATUS.open) {
      return new Response(null, { status: 204 });
    }

    return Response.json(snapshot);
  } catch (error) {
    return partyRoomErrorResponse(error);
  }
}
