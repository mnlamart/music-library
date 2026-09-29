import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { RoomsHub } from "#app/components/party-room/rooms-hub.tsx";
import {
  isValidRoomCode,
  normalizeRoomCode,
  parseRoomCodeInput,
} from "#app/features/party-room/code.ts";
import { usePartyRoom } from "#app/features/party-room/party-room-provider.tsx";
import { requireUserId } from "#app/utils/auth.server.ts";
import { type Route } from "./+types/rooms.$code.ts";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUserId(request);
  return {};
}

/**
 * Smart join via URL: `/rooms/AB3K9Q`.
 * If not already in that room, attempts join then shows hub.
 */
export default function RoomByCodeRoute() {
  const { code: rawCode } = useParams();
  const party = usePartyRoom();
  const navigate = useNavigate();
  const code = rawCode ? normalizeRoomCode(rawCode) : "";

  useEffect(() => {
    if (!code || !isValidRoomCode(code)) return;
    if (party.loading) return;
    if (party.room?.code === code) return;
    if (party.apiUnavailable) return;

    void party
      .join(code)
      .then((room) => {
        if (room.code !== code) {
          void navigate(`/rooms/${room.code}`, { replace: true });
        }
      })
      .catch(() => {
        // Error surfaced via party.error on hub
      });
  }, [code, party, navigate]);

  if (rawCode && !parseRoomCodeInput(rawCode)) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Invalid room code</h1>
        <p className="text-sm text-muted-foreground">
          Codes are 6 characters from A–Z / 1–9 (no 0, O, or I).
        </p>
      </div>
    );
  }

  return <RoomsHub />;
}
