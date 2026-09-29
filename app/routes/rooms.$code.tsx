/**
 * Guest Shell layout — Room + Search tabs (ADR-030 / #291).
 */

import { data, Link, NavLink, Outlet, useLoaderData } from "react-router";
import { canAddTracks } from "#app/features/party-room/capabilities.ts";
import { parseRoomCodeInput } from "#app/features/party-room/codes.ts";
import {
  resolveRoomParticipantByCode,
  type SeatedParticipant,
} from "#app/features/party-room/participant-seat.server.ts";
import { getRoomSnapshotByCode } from "#app/features/party-room/party-room.server.ts";
import { cn } from "#app/utils/misc.tsx";

export const handle = { partyRoomGuestShell: true };

export async function loader({ request, params }: { request: Request; params: { code?: string } }) {
  const code = parseRoomCodeInput(params.code ?? "") ?? (params.code ?? "").toUpperCase();
  let snapshot: Awaited<ReturnType<typeof getRoomSnapshotByCode>> | null = null;
  try {
    snapshot = await getRoomSnapshotByCode(code);
  } catch {
    snapshot = null;
  }

  if (!snapshot) {
    return data({
      code,
      room: null as null,
      ended: false,
      participant: null as SeatedParticipant | null,
      canAddTracks: false,
      queue: [] as Array<unknown>,
    });
  }

  const participant = await resolveRoomParticipantByCode(request, snapshot.code);
  return data({
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
  });
}

export default function GuestRoomShell() {
  const roomShell = useLoaderData<typeof loader>();

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

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Party Room</p>
            <p className="font-mono text-xl font-semibold tracking-widest">{roomShell.code}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{roomShell.participant.displayName}</p>
            <p className="capitalize text-muted-foreground">{roomShell.participant.role}</p>
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
