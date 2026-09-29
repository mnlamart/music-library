import { Button } from "#app/components/ui/button.tsx";
import { Icon } from "#app/components/ui/icon.tsx";
import {
  canEditOthersUpcoming,
  canRemoveOwnQueueItem,
  splitRoomQueue,
} from "#app/features/party-room/index.ts";
import { useOptionalPartyRoom } from "#app/features/party-room/party-room-provider.tsx";
import { type RoomQueueItemDto } from "#app/features/party-room/types.ts";
import { removeRoomQueueItem } from "#app/features/party-room/api.client.ts";
import { formatDuration } from "#app/utils/format-duration.ts";
import { toast } from "#app/components/ui/use-toast.ts";

function QueueRow({
  item,
  label,
  canRemove,
  onRemove,
  isNowPlaying,
}: {
  item: RoomQueueItemDto;
  label?: string;
  canRemove: boolean;
  onRemove: () => void;
  isNowPlaying?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 border-b border-border/60 px-2 py-2 ${
        isNowPlaying ? "bg-primary/10" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {isNowPlaying ? "▶ " : null}
          {item.track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.track.artistName}
          {label ? ` · ${label}` : null}
          {item.track.duration != null ? ` · ${formatDuration(item.track.duration)}` : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">Added by {item.addedByDisplayName}</p>
      </div>
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Remove from queue"
          onClick={onRemove}
        >
          <Icon name="trash" className="h-4 w-4" />
        </Button>
      ) : null}
    </li>
  );
}

export function RoomQueuePanel() {
  const party = useOptionalPartyRoom();
  if (!party?.room) return null;

  const room = party.room;
  const role = room.me?.role;
  const { history, upcoming, nowPlaying } = splitRoomQueue(room);
  const canEditOthers = role ? canEditOthersUpcoming(role) : false;
  const canRemoveOwn = role ? canRemoveOwnQueueItem(role) : false;

  const removeItem = (item: RoomQueueItemDto) => {
    const isOwn = room.me?.id === item.addedByParticipantId;
    if (!canEditOthers && !(canRemoveOwn && isOwn)) return;
    void removeRoomQueueItem(room.id, item.id)
      .then((next) => {
        // Provider will also get SSE; refresh via addTrack path by forcing refresh
        void party.refresh();
        toast({ title: "Removed from queue" });
        void next;
      })
      .catch((err: unknown) => {
        toast({
          title: "Could not remove",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Room queue</h2>
        <span className="text-xs text-muted-foreground">{room.queue.length} tracks</span>
      </div>

      {history.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Played
          </h3>
          <ul className="rounded-md border border-border">
            {history.map((item) => (
              <QueueRow key={item.id} item={item} canRemove={false} onRemove={() => {}} />
            ))}
          </ul>
        </section>
      ) : null}

      {nowPlaying ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Now playing
          </h3>
          <ul className="rounded-md border border-primary/40">
            <QueueRow item={nowPlaying} isNowPlaying canRemove={false} onRemove={() => {}} />
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Queue is empty — add tracks from the library.
        </p>
      )}

      {upcoming.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Up next
          </h3>
          <ul className="rounded-md border border-border">
            {upcoming.map((item) => {
              const isOwn = room.me?.id === item.addedByParticipantId;
              return (
                <QueueRow
                  key={item.id}
                  item={item}
                  canRemove={canEditOthers || (canRemoveOwn && isOwn)}
                  onRemove={() => removeItem(item)}
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {party.isHost && party.canTransport ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void party.transport(
                room.playback.isPlaying ? { action: "pause" } : { action: "play" },
              );
            }}
          >
            <Icon name={room.playback.isPlaying ? "pause" : "play"} className="mr-1 h-4 w-4" />
            {room.playback.isPlaying ? "Pause" : "Play"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void party.transport({ action: "skip" });
            }}
          >
            <Icon name="forward" className="mr-1 h-4 w-4" />
            Skip
          </Button>
        </div>
      ) : null}
    </div>
  );
}
