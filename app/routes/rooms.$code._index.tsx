/**
 * Guest join + Room tab — uses backend joinRoom / queue snapshot.
 */

import { useEffect, useRef } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteLoaderData,
} from "react-router";
import { canAddTracks } from "#app/features/party-room/capabilities.ts";
import { parseRoomCodeInput } from "#app/features/party-room/codes.ts";
import {
  GUEST_DISPLAY_NAME_MAX,
  GUEST_DISPLAY_NAME_MIN,
} from "#app/features/party-room/constants.ts";
import { serializeGuestTokenCookie } from "#app/features/party-room/guest-token.server.ts";
import { resolveRoomParticipantByCode } from "#app/features/party-room/participant-seat.server.ts";
import { joinRoom, PartyRoomError } from "#app/features/party-room/party-room.server.ts";
import { Button } from "#app/components/ui/button.tsx";
import { Input } from "#app/components/ui/input.tsx";
import { Label } from "#app/components/ui/label.tsx";

export const handle = { partyRoomGuestShell: true };

export async function loader({ request, params }: { request: Request; params: { code?: string } }) {
  const code = parseRoomCodeInput(params.code ?? "") ?? (params.code ?? "").toUpperCase();
  const participant = await resolveRoomParticipantByCode(request, code);
  return { code, seated: Boolean(participant), participant };
}

export async function action({ request, params }: { request: Request; params: { code?: string } }) {
  const code = parseRoomCodeInput(params.code ?? "") ?? (params.code ?? "").toUpperCase();
  const formData = await request.formData();
  const displayName = String(formData.get("displayName") ?? "");

  try {
    const result = await joinRoom({
      code,
      actor: { type: "guest", displayName },
    });
    const headers = result.guestToken
      ? { "Set-Cookie": await serializeGuestTokenCookie(result.guestToken) }
      : undefined;
    return redirect(`/rooms/${result.code}`, { headers });
  } catch (error) {
    if (error instanceof PartyRoomError) {
      const message =
        error.code === "invalid_display_name"
          ? `Name must be ${GUEST_DISPLAY_NAME_MIN}–${GUEST_DISPLAY_NAME_MAX} characters`
          : error.code === "not_found"
            ? "Room not found"
            : error.code === "room_ended"
              ? "This room has ended"
              : error.code === "room_full"
                ? "Room is full"
                : error.message;
      return { error: message };
    }
    throw error;
  }
}

export default function GuestJoinOrRoom() {
  const { seated, participant, code } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  const layoutData = useRouteLoaderData("routes/rooms.$code") as
    | {
        queue?: Array<{
          id: string;
          position: number;
          track?: { title?: string; artist?: { name?: string } } | null;
        }>;
        room?: { currentIndex?: number } | null;
      }
    | undefined;

  useEffect(() => {
    if (!seated) inputRef.current?.focus();
  }, [seated]);

  if (seated && participant) {
    const queue = layoutData?.queue ?? [];
    const currentIndex = layoutData?.room?.currentIndex ?? 0;
    const nowPlaying = queue.find((r) => r.position === currentIndex) ?? queue[currentIndex];
    const canAdd = canAddTracks(participant.role);

    return (
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Now playing</h2>
          {nowPlaying?.track ? (
            <div className="rounded-lg border border-border/80 px-4 py-4">
              <p className="font-medium">{nowPlaying.track.title}</p>
              <p className="text-sm text-muted-foreground">
                {nowPlaying.track.artist?.name ?? "Unknown artist"}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
              Queue will appear here when the host starts playing.
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {canAdd
              ? "You can add tracks from Search."
              : "Search & audition only until a DJ/Host promotes you."}
          </p>
        </section>
        {queue.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Queue
            </h3>
            <ul className="divide-y divide-border/60">
              {queue.map((row) => (
                <li
                  key={row.id}
                  className={`py-2 text-sm ${row.position === currentIndex ? "font-medium" : ""}`}
                >
                  <span className="text-muted-foreground">{row.position + 1}.</span>{" "}
                  {row.track?.title ?? "Track"}
                  {row.track?.artist?.name ? (
                    <span className="text-muted-foreground"> — {row.track.artist.name}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="space-y-1 text-sm text-muted-foreground">
          <p>
            Signed in as <span className="text-foreground">{participant.displayName}</span> (
            <span className="capitalize">{participant.role}</span>)
          </p>
          <p>
            Room <span className="font-mono text-foreground">{code}</span>
          </p>
        </section>
      </div>
    );
  }

  const busy = navigation.state !== "idle";
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-4">
      <div className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Join party</p>
        <h1 className="font-mono text-3xl font-semibold tracking-widest">{code}</h1>
        <p className="text-sm text-muted-foreground">
          Pick a display name to enter the guest shell.
        </p>
      </div>
      <Form method="post" action="?index" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            ref={inputRef}
            id="displayName"
            name="displayName"
            maxLength={GUEST_DISPLAY_NAME_MAX}
            autoComplete="nickname"
            placeholder="Your name"
            required
            disabled={busy}
          />
        </div>
        {actionData && "error" in actionData && actionData.error ? (
          <p className="text-sm text-destructive" role="alert">
            {actionData.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Joining…" : "Join room"}
        </Button>
      </Form>
    </div>
  );
}
