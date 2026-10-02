import { useFetcher, useSubmit } from "react-router";
import { useEffect, useState } from "react";
import { TrackThumbnail } from "#app/components/track-thumbnail";
import { Button } from "#app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#app/components/ui/dialog";
import { Icon } from "#app/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#app/components/ui/tabs";
import { formatDuration } from "#app/utils/format-duration";
import { formatServiceDateAdded } from "#app/utils/service-date.ts";
import { BasicMetadataTab } from "./track-details-dialog/basic-metadata-tab";
import { ExtendedMetadataTab } from "./track-details-dialog/extended-metadata-tab";
import { HistoryTab } from "./track-details-dialog/history-tab";
import { CommentDialog } from "./track-details-dialog/comment-dialog";
import { CuratorNotes } from "./curator-notes";

export interface TrackDetails {
  id: string;
  title: string;
  artist: { id: string; name: string };
  albumRecord: { id: string; name: string } | null;
  duration: number | null;
  createdAt: string;
  releaseDate: string | null;
  originalDate: string | null;
  coverImage: { objectKey: string } | null;
  service: { displayName: string } | null;
  serviceUrl: string | null;
  // Additional metadata
  genre: string | null;
  year: number | null;
  trackNumber: number | null;
  albumArtist: string | null;
  bpm: number | null;
  label: string | null;
  isrc: string | null;
  originalYear: number | null;
  totalTracks: number | null;
  totalDiscs: number | null;
  lyrics: string | null;
}

interface TrackDetailsDialogProps {
  trackId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrackDetailsDialog({ trackId, open, onOpenChange }: TrackDetailsDialogProps) {
  const fetcher = useFetcher<{
    track: TrackDetails;
    isCurator: boolean;
    notesCount: number;
    currentUserId: string;
  }>();
  const [activeTab, setActiveTab] = useState("basic");
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<any>(null);
  const submit = useSubmit();

  useEffect(() => {
    if (open && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/resources/track-details?trackId=${encodeURIComponent(trackId)}`);
    }
  }, [open, trackId, fetcher]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Reload track details after successful edit
      setShowCommentDialog(false);
      setPendingChanges(null);
    }
  }, [fetcher.state, fetcher.data]);

  const track = fetcher.data?.track;
  const isCurator = fetcher.data?.isCurator ?? false;
  const isLoading = fetcher.state !== "idle";

  const serviceDateAdded = track
    ? formatServiceDateAdded({
        releaseDate: track.releaseDate,
        originalDate: track.originalDate,
        createdAt: track.createdAt,
      })
    : null;

  const handleSaveChanges = (changes: any) => {
    setPendingChanges(changes);
    setShowCommentDialog(true);
  };

  const handleSubmitWithComment = (comment: string | null) => {
    if (!pendingChanges) return;

    const formData = new FormData();
    Object.entries(pendingChanges).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, String(value));
      }
    });
    if (comment) {
      formData.append("comment", comment);
    }

    submit(formData, {
      method: "POST",
      action: `/api/metadata/tracks/${trackId}/edit`,
    });

    setShowCommentDialog(false);
    setPendingChanges(null);
  };

  const handleRestore = (editId: string, comment: string | null) => {
    if (!comment) return;

    const formData = new FormData();
    formData.append("comment", comment);

    submit(formData, {
      method: "POST",
      action: `/api/metadata/tracks/${trackId}/restore/${editId}`,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {isLoading ? (
            <>
              <div className="flex items-center justify-center py-12">
                <Icon name="update" className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
              <DialogDescription className="sr-only">Loading track details...</DialogDescription>
            </>
          ) : !track ? (
            <>
              <div className="py-8 text-center text-sm text-muted-foreground">
                Unable to load track details
              </div>
              <DialogDescription className="sr-only">
                Failed to load track details
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">
                  <div className="flex items-center gap-3">
                    <TrackThumbnail coverImage={track.coverImage} alt={track.title} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={track.title}>
                        {track.title}
                      </div>
                      <div
                        className="truncate text-xs text-muted-foreground"
                        title={track.artist.name}
                      >
                        {track.artist.name}
                      </div>
                      {isCurator && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Icon name="pencil-1" className="h-3 w-3" />
                          Curator
                        </div>
                      )}
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {isCurator ? (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="basic">Basic</TabsTrigger>
                    <TabsTrigger value="extended">Extended</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="notes">
                      Notes
                      {fetcher.data?.notesCount ? (
                        <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                          {fetcher.data.notesCount}
                        </span>
                      ) : null}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="mt-4">
                    <BasicMetadataTab track={track} onSave={handleSaveChanges} />
                  </TabsContent>

                  <TabsContent value="extended" className="mt-4">
                    <ExtendedMetadataTab track={track} onSave={handleSaveChanges} />
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <HistoryTab trackId={trackId} onRestore={handleRestore} />
                  </TabsContent>

                  <TabsContent value="notes" className="mt-4">
                    {fetcher.data?.currentUserId && (
                      <CuratorNotes
                        entityType="track"
                        entityId={trackId}
                        currentUserId={fetcher.data.currentUserId}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Track Information</div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>Artist: {track.artist.name}</div>
                      {track.albumRecord && <div>Album: {track.albumRecord.name}</div>}
                      {track.genre && <div>Genre: {track.genre}</div>}
                      {track.year && <div>Year: {track.year}</div>}
                      <div>Duration: {formatDuration(track.duration)}</div>
                      <div>Added: {new Date(track.createdAt).toLocaleDateString()}</div>
                      {track.service?.displayName && <div>Source: {track.service.displayName}</div>}
                      {serviceDateAdded && <div>Date added: {serviceDateAdded}</div>}
                    </div>
                  </div>
                  {track.serviceUrl && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(track.serviceUrl!, "_blank")}
                        className="flex-1"
                      >
                        <Icon name="link-2" className="mr-2 h-4 w-4" />
                        Open on YouTube
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {showCommentDialog && (
        <CommentDialog
          open={showCommentDialog}
          onOpenChange={setShowCommentDialog}
          onSubmit={handleSubmitWithComment}
          title="Edit Comment"
          description="Optionally add a comment explaining why you're making this change."
          required={false}
        />
      )}
    </>
  );
}
