import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";
import { Link } from "react-router";
import { TrackListItem } from "#app/components/track-list-item.tsx";
import { Button } from "#app/components/ui/button.tsx";
import { ScrollArea } from "#app/components/ui/scroll-area";
import { type OfflineTrackSummary } from "#app/features/offline-storage/types.ts";

type OfflineLibraryViewProps = {
  tracks: OfflineTrackSummary[];
};

function toOfflineTrackListItemTrack(track: OfflineTrackSummary) {
  return {
    id: track.trackId,
    title: track.title,
    artist: { id: track.artistId, name: track.artistName },
    duration: track.duration,
    coverImage: track.coverObjectKey ? { objectKey: track.coverObjectKey } : null,
    serviceUrl: null,
    audioFiles: [{ id: track.trackId, format: "mp3" as const, objectKey: "" }],
  };
}

function OfflineLibraryTrackItem({ track, index }: { track: OfflineTrackSummary; index: number }) {
  const trackData = toOfflineTrackListItemTrack(track);

  return (
    <TrackListItem
      track={trackData}
      userTrack={{ createdAt: new Date(track.lastAccessedAt) }}
      index={index}
      playlistContext={{ type: "library" }}
      offlineDownloadTrack={trackData}
    />
  );
}

export function OfflineLibraryView({ tracks }: OfflineLibraryViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () =>
      parentRef.current?.querySelector("[data-radix-scroll-area-viewport]") || null,
    estimateSize: useCallback(() => 64, []),
    overscan: 5,
  });

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-muted-foreground">
          No downloaded tracks available offline. Download music while you still have a connection.
        </p>
        <Button asChild className="mt-4">
          <Link to="/downloads">Open downloads</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[600px] w-full rounded-lg border">
      <ScrollArea className="h-full w-full" ref={parentRef}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const track = tracks[virtualItem.index];
            if (!track) return null;

            return (
              <div
                key={track.trackId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="border-b last:border-b-0"
              >
                <OfflineLibraryTrackItem track={track} index={virtualItem.index} />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
