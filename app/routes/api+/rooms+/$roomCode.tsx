import {
  findOpenRoomByCode,
  getRoomSnapshot,
  PartyRoomError,
} from "#app/features/party-room/party-room.server.ts";
import { partyRoomErrorResponse } from "#app/features/party-room/request.server.ts";

export async function loader({ params }: { request: Request; params: { roomCode?: string } }) {
  try {
    const code = params.roomCode?.toUpperCase();
    if (!code) {
      return Response.json({ error: "Room code required" }, { status: 400 });
    }
    const room = await findOpenRoomByCode(code);
    const snapshot = await getRoomSnapshot(room.id);
    if (!snapshot) {
      throw new PartyRoomError("not_found", "Room not found", 404);
    }
    return Response.json(snapshot);
  } catch (error) {
    return partyRoomErrorResponse(error);
  }
}
