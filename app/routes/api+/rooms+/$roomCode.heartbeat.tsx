import { findOpenRoomByCode, heartbeat } from "#app/features/party-room/party-room.server.ts";
import { partyRoomErrorResponse, resolveActor } from "#app/features/party-room/request.server.ts";

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { roomCode?: string };
}) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const code = params.roomCode?.toUpperCase();
    if (!code) {
      return Response.json({ error: "Room code required" }, { status: 400 });
    }
    const room = await findOpenRoomByCode(code);
    const actor = await resolveActor(request);
    const result = await heartbeat({ roomId: room.id, actor });
    return Response.json(result);
  } catch (error) {
    return partyRoomErrorResponse(error);
  }
}
