/**
 * Smart join via `/rooms/:code` (ADR-030).
 * - Logged-in → Party Room hub (client join + RoomsHub)
 * - Logged-out → Guest Shell layout (Room + Search tabs)
 */

import { useEffect, useRef } from "react";
import { data, Link, NavLink, Outlet, useLoaderData, useNavigate, useParams } from "react-router";
import { GeneralErrorBoundary } from "#app/components/error-boundary.tsx";
import { RoomsHub } from "#app/components/party-room/rooms-hub.tsx";
import { canAddTracks } from "#app/features/party-room/capabilities.ts";
import {
  isValidRoomCode,
  normalizeRoomCode,
  parseRoomCodeInput as parseRoomCodeInputClient,
} from "#app/features/party-room/code.ts";
import { parseRoomCodeInput } from "#app/features/party-room/codes.ts";
import {
  resolveRoomParticipantByCode,
  type SeatedParticipant,
} from "#app/features/party-room/participant-seat.server.ts";
import { getRoomSnapshotByCode } from "#app/features/party-room/party-room.server.ts";
import {
  useOptionalPartyRoom,
  usePartyRoom,
} from "#app/features/party-room/party-room-provider.tsx";
import { resolveOptionalUserId } from "#app/features/party-room/request.server.ts";
import { cn } from "#app/utils/misc.tsx";
import { type Route } from "./+types/rooms.$code.ts";

type GuestLoaderData = {
  mode: "guest";
  guestShell: true;
  code: string;
  room: {
    id: string;
    code: string;
    status: string;
    defaultJoinRole: string;
    currentIndex: number;
    roomVersion: number;
    isPlaying: boolean;
  } | null;
  ended: boolean;
  participant: SeatedParticipant | null;
  canAddTracks: boolean;
  queue: Array<{
    id: string;
    position: number;
    track?: { title?: string; artist?: { name?: string } | null } | null;
  }>;
};

type UserLoaderData = {
  mode: "user";
  guestShell: false;
  code: string;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const raw = params.code ?? "";
  const code = parseRoomCodeInput(raw) ?? parseRoomCodeInputClient(raw) ?? raw.toUpperCase();
  const userId = await resolveOptionalUserId(request);

  if (userId) {
    return data({
      mode: "user",
      guestShell: false,
      code,
    } satisfies UserLoaderData);
  }

  let snapshot: Awaited<ReturnType<typeof getRoomSnapshotByCode>> | null = null;
  try {
    snapshot = await getRoomSnapshotByCode(code);
  } catch {
    snapshot = null;
  }

  if (!snapshot) {
    return data({
      mode: "guest",
      guestShell: true,
      code,
      room: null,
      ended: false,
      participant: null,
      canAddTracks: false,
      queue: [],
    } satisfies GuestLoaderData);
  }

  const participant = await resolveRoomParticipantByCode(request, snapshot.code);
  return data({
    mode: "guest",
    guestShell: true,
    code: snapshot.code,
    room: {
      id: snapshot.roomId,
      code: snapshot.code,
      status: snapshot.status,
      defaultJoinRole: snapshot.defaultJoinRole,
      currentIndex: snapshot.currentIndex,
      roomVersion: snapshot.roomVersion,
      isPlaying: snapshot.isPlaying,
    },
    ended: snapshot.status === "ended",
    participant,
    canAddTracks: participant ? canAddTracks(participant.role) : false,
    queue: snapshot.queue,
  } satisfies GuestLoaderData);
}

export default function RoomByCodeRoute() {
  const loaderData = useLoaderData<typeof loader>();

  if (loaderData.mode === "user") {
    return <LoggedInRoomByCode />;
  }

  return <GuestRoomShell roomShell={loaderData} />;
}

function LoggedInRoomByCode() {
  const { code: rawCode } = useParams();
  const party = usePartyRoom();
  const navigate = useNavigate();
  const code = rawCode ? normalizeRoomCode(rawCode) : "";
  const joinAttemptedForCode = useRef<string | null>(null);

  // Reset attempt when the route code changes
  useEffect(() => {
    joinAttemptedForCode.current = null;
  }, [code]);

  useEffect(() => {
    if (!code || !isValidRoomCode(code)) return;
    if (party.loading) return;
    if (party.room?.code === code) return;
    if (party.apiUnavailable) return;
    if (joinAttemptedForCode.current === code) return;

    joinAttemptedForCode.current = code;
    void party
      .join(code)
      .then((room) => {
        if (room.code !== code) {
          void navigate(`/rooms/${room.code}`, { replace: true });
        }
      })
      .catch(() => {
        // Error surfaced via party.error on hub; do not retry-loop.
      });
  }, [code, party.loading, party.room?.code, party.apiUnavailable, party.join, navigate]);

  if (rawCode && !parseRoomCodeInputClient(rawCode)) {
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

function GuestRoomShell({ roomShell }: { roomShell: GuestLoaderData }) {
  const party = useOptionalPartyRoom();

  if (!roomShell.room) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-2xl font-semibold tracking-tight">
          {roomShell.ended ? "This room has ended" : "Room not found"}
        </p>
        <p className="text-sm text-muted-foreground">Ask the host for a new code or join link.</p>
        <Link to="/" className="text-sm underline underline-offset-4">
          Back home
        </Link>
      </div>
    );
  }

  if (!roomShell.participant) return <Outlet />;

  const liveMe = party?.room?.code === roomShell.code ? party.room.me : null;
  const displayName = liveMe?.displayName ?? roomShell.participant.displayName;
  const role = liveMe?.role ?? roomShell.participant.role;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Party Room</p>
            <p className="font-mono text-xl font-semibold tracking-widest">{roomShell.code}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{displayName}</p>
            <p className="capitalize text-muted-foreground">{role}</p>
          </div>
        </div>
        <nav
          className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1"
          aria-label="Guest shell"
        >
          <GuestTab to={`/rooms/${roomShell.code}`} end>
            Room
          </GuestTab>
          <GuestTab to={`/rooms/${roomShell.code}/search`}>Search</GuestTab>
        </nav>
      </header>
      <main className="flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}

function GuestTab({ to, children, end }: { to: string; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-2 text-center text-sm font-medium transition-colors",
          isActive
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
