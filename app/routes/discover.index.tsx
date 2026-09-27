import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer, defaultRangeExtractor, type Range } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import { data, useFetcher, useSearchParams } from "react-router";
import { SortDirectionToggle } from "#app/components/sort-direction-toggle.tsx";
import { TrackListItem } from "#app/components/track-list-item";
import { Badge } from "#app/components/ui/badge.tsx";
import { Button } from "#app/components/ui/button.tsx";
import { Icon } from "#app/components/ui/icon.tsx";
import { ScrollArea } from "#app/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#app/components/ui/select.tsx";
import { TrackListSkeleton } from "#app/components/ui/track-list-skeleton";
import { toast } from "#app/components/ui/use-toast.ts";
import { requireUserId } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import {
  DISCOVER_TRACKS_PAGE_SIZE,
  parseDiscoverSort,
  defaultDiscoverSortDirection,
  type DiscoverSortOption,
  type DiscoverTrack,
} from "#app/utils/discover.ts";
import { listDiscoverTracks } from "#app/utils/discover-tracks.server.ts";
import { parseSortDirection, type SortDirection } from "#app/utils/sort-direction.ts";
import { type Route } from "./+types/discover.index.ts";

export async function loader({ request, url }: Route.LoaderArgs) {
  const userId = await requireUserId(request);

  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") || String(DISCOVER_TRACKS_PAGE_SIZE))),
  );
  const sort = parseDiscoverSort(url.searchParams.get("sort"));
  const direction = parseSortDirection(
    url.searchParams.get("dir"),
    defaultDiscoverSortDirection(sort),
  );

  const { tracks, pagination } = await listDiscoverTracks({
    userId,
    sort,
    direction,
    cursor,
    limit,
  });

  const playlists = await prisma.userPlaylist.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      title: true,
      description: true,
      _count: {
        select: { tracks: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return data({
    tracks,
    pagination,
    sort,
    direction,
    playlists,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const trackId = formData.get("trackId");

  if (intent === "addToLibrary" && typeof trackId === "string") {
    const existing = await prisma.userTrack.findUnique({
      where: {
        userId_trackId: {
          userId,
          trackId,
        },
      },
    });

    if (existing) {
      if (!existing.isActive || existing.deletedAt) {
        await prisma.userTrack.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            deletedAt: null,
          },
        });
        return data({ success: true, message: "Track re-added to your library" });
      }
      return data({ success: false, message: "Track is already in your library" });
    }

    await prisma.userTrack.create({
      data: {
        userId,
        trackId,
        isActive: true,
      },
    });

    return data({ success: true, message: "Track added to your library" });
  }

  return data({ success: false, message: "Invalid request" });
}

type DiscoverTrackListItemProps = {
  track: DiscoverTrack;
  index: number;
  playlists: Array<{
    id: string;
    title: string;
    description: string | null;
    _count: { tracks: number };
  }>;
};

function DiscoverTrackListItem({ track, index, playlists }: DiscoverTrackListItemProps) {
  const fetcher = useFetcher();
  const isAddingToLibrary = fetcher.state !== "idle";

  const hasAudioFiles = track.audioFiles && track.audioFiles.length > 0;

  const handleAddToLibrary = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "addToLibrary");
    formData.append("trackId", track.id);
    fetcher.submit(formData, { method: "POST" });
  }, [track.id, fetcher]);

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.data.success) {
        toast({
          title: "Success",
          description: fetcher.data.message,
          variant: "success",
        });
      } else {
        toast({
          title: "Error",
          description: fetcher.data.message,
          variant: "destructive",
        });
      }
    }
  }, [fetcher.data, fetcher.state]);

  const userTrack = {
    createdAt: track.userTrackCreatedAt ?? track.createdAt,
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <TrackListItem
          track={track}
          userTrack={userTrack}
          index={index}
          playlists={track.isInUserLibrary ? playlists : undefined}
          playlistContext={{ type: "music" }}
          showAudioFileDownload={false}
          usePlaybackIndex={false}
        />
      </div>
      {!hasAudioFiles && (
        <Badge variant="secondary" className="shrink-0 mr-2">
          Archiving
        </Badge>
      )}
      {!track.isInUserLibrary && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddToLibrary}
          disabled={isAddingToLibrary}
          className="shrink-0 mr-2"
        >
          {isAddingToLibrary ? (
            <Icon name="update" className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Icon name="plus" className="h-4 w-4 mr-2" />
          )}
          Add to Library
        </Button>
      )}
    </div>
  );
}

export default function DiscoverIndexRoute({ loaderData }: Route.ComponentProps) {
  const {
    tracks,
    pagination,
    sort: loaderSort,
    direction: loaderDirection,
    playlists,
  } = loaderData;

  const pageSize = pagination.limit ?? DISCOVER_TRACKS_PAGE_SIZE;
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseDiscoverSort(searchParams.get("sort") ?? loaderSort);
  const direction = parseSortDirection(
    searchParams.get("dir") ?? loaderDirection,
    defaultDiscoverSortDirection(sort),
  );
  const parentRef = useRef<HTMLDivElement>(null);

  const scrollDiscoverToTop = useCallback(() => {
    const viewport = parentRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (viewport instanceof HTMLElement) {
      viewport.scrollTop = 0;
    }
  }, []);

  const handleSortChange = useCallback(
    (value: string) => {
      const nextSort = parseDiscoverSort(value);
      const nextParams = new URLSearchParams(searchParams);
      if (nextSort === "recentlyAdded") {
        nextParams.delete("sort");
      } else {
        nextParams.set("sort", nextSort);
      }
      nextParams.delete("dir");
      setSearchParams(nextParams, { preventScrollReset: true });
      scrollDiscoverToTop();
    },
    [searchParams, setSearchParams, scrollDiscoverToTop],
  );

  const handleDirectionChange = useCallback(
    (next: SortDirection) => {
      const nextParams = new URLSearchParams(searchParams);
      if (next === defaultDiscoverSortDirection(sort)) {
        nextParams.delete("dir");
      } else {
        nextParams.set("dir", next);
      }
      setSearchParams(nextParams, { preventScrollReset: true });
      scrollDiscoverToTop();
    },
    [searchParams, setSearchParams, scrollDiscoverToTop, sort],
  );

  const {
    data: queryData,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
    status,
  } = useInfiniteQuery({
    queryKey: ["discover-tracks", { pageSize, sort, direction }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      if (pageParam) {
        params.set("cursor", String(pageParam));
      }
      if (sort !== "recentlyAdded") {
        params.set("sort", sort);
      }
      if (direction !== defaultDiscoverSortDirection(sort)) {
        params.set("dir", direction);
      }
      const res = await fetch(`/api/discover-tracks?${params}`);
      const json = (await res.json()) as {
        tracks: DiscoverTrack[];
        pagination: { hasNext: boolean; nextCursor: string | null };
      };
      return json;
    },
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor || undefined,
    initialPageParam: undefined as string | undefined,
    initialData:
      sort === loaderSort && direction === loaderDirection
        ? {
            pages: [
              {
                tracks: tracks || [],
                pagination: {
                  hasNext: pagination?.hasNext || false,
                  nextCursor: pagination?.nextCursor || null,
                },
              },
            ],
            pageParams: [undefined],
          }
        : undefined,
  });

  const allItems = queryData?.pages.flatMap((page) => page.tracks) || [];

  const virtualizer = useVirtualizer({
    count: 1 + allItems.length + (hasNextPage ? 1 : 0),
    getScrollElement: () =>
      parentRef.current?.querySelector("[data-radix-scroll-area-viewport]") || null,
    estimateSize: () => 64,
    overscan: 5,
    rangeExtractor: useCallback((range: Range) => {
      const next = new Set([0, ...defaultRangeExtractor(range)]);
      return [...next].sort((a, b) => a - b);
    }, []),
  });

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();

    if (!lastItem) return;

    if (lastItem.index >= allItems.length && hasNextPage && !isFetchingNextPage) {
      void (async () => {
        try {
          await fetchNextPage();
        } catch (fetchError) {
          console.error("Failed to fetch next page:", fetchError);
        }
      })();
    }
  }, [hasNextPage, fetchNextPage, isFetchingNextPage, virtualItems, allItems.length]);

  if (isPending) {
    return (
      <div className="space-y-4">
        <TrackListSkeleton />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icon name="x-mark" className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Error loading tracks</h3>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error ? error.message : "Something went wrong"}
        </p>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Discover Music</h1>
          <p className="text-muted-foreground mt-1">Browse the global music catalog</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Select value={sort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Sort discover">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recentlyAdded">Recently added</SelectItem>
                <SelectItem value="mostPlayed">Most played</SelectItem>
                <SelectItem value="mostLiked">Most liked</SelectItem>
                <SelectItem value="titleAZ">A-Z by title</SelectItem>
                <SelectItem value="artistAZ">A-Z by artist</SelectItem>
              </SelectContent>
            </Select>
            <SortDirectionToggle
              value={direction}
              onValueChange={handleDirectionChange}
              aria-label="Discover sort direction"
            />
          </div>
        </div>
      </div>

      {allItems.length === 0 && !isFetching ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No tracks found</h3>
          <p className="text-muted-foreground mb-4">
            The music catalog is empty. Upload some tracks to get started.
          </p>
        </div>
      ) : (
        <div className="h-[600px] w-full">
          <ScrollArea className="h-full w-full" ref={parentRef}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const isHeader = virtualItem.index === 0;

                if (isHeader) {
                  return (
                    <div
                      key="header"
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      className="bg-background border-b"
                    >
                      <div className="flex items-center gap-4 px-1 py-3 text-sm font-medium text-muted-foreground sm:px-4">
                        <div className="w-8 flex items-center justify-center min-w-8">#</div>
                        <div className="flex-1 min-w-0">Title</div>
                        <div className="hidden md:flex text-xs text-muted-foreground w-12 text-center">
                          Duration
                        </div>
                        <div className="flex items-center gap-1 w-8">Actions</div>
                      </div>
                    </div>
                  );
                }

                const itemIndex = virtualItem.index - 1;

                if (itemIndex >= allItems.length) {
                  return (
                    <div
                      key="loading"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div className="flex w-full justify-center py-4">
                        {isFetchingNextPage ? (
                          <Icon name="update" className="h-6 w-6 animate-spin" />
                        ) : hasNextPage ? (
                          "Loading more..."
                        ) : (
                          "Nothing more to load"
                        )}
                      </div>
                    </div>
                  );
                }

                const item = allItems[itemIndex];
                if (!item) return null;

                return (
                  <div
                    key={item.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <DiscoverTrackListItem track={item} index={itemIndex} playlists={playlists} />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
