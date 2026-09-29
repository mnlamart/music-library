import {
  findOpenRoomByCode,
  getRoomSnapshot,
  requireParticipant,
} from "#app/features/party-room/party-room.server.ts";
import { partyRoomErrorResponse, resolveActor } from "#app/features/party-room/request.server.ts";
import {
  encodeSseComment,
  encodeSseData,
  subscribeRoomEvents,
} from "#app/features/party-room/sse.server.ts";

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { roomCode?: string };
}) {
  try {
    const code = params.roomCode?.toUpperCase();
    if (!code) {
      return Response.json({ error: "Room code required" }, { status: 400 });
    }
    const room = await findOpenRoomByCode(code);
    const actor = await resolveActor(request);
    await requireParticipant(room.id, actor);

    const snapshot = await getRoomSnapshot(room.id);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseData({ type: "connected", roomId: room.id }));
        if (snapshot) {
          controller.enqueue(encodeSseData({ type: "room_snapshot", ...snapshot }));
        }

        const unsubscribe = subscribeRoomEvents(room.id, controller);

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encodeSseComment("heartbeat"));
          } catch {
            clearInterval(heartbeat);
            unsubscribe();
          }
        }, 15_000);

        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        // abort handler cleans up
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return partyRoomErrorResponse(error);
  }
}
