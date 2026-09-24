import { type SEOHandle } from "@nasa-gcn/remix-seo";
import { data, Form, Link, useFetcher, useSearchParams } from "react-router";
import { useState } from "react";
import { GeneralErrorBoundary } from "#app/components/error-boundary";
import { Spacer } from "#app/components/spacer.tsx";
import { Badge } from "#app/components/ui/badge.tsx";
import { Button } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
import { Icon } from "#app/components/ui/icon.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#app/components/ui/alert-dialog.tsx";
import { requireUserWithRole } from "#app/utils/permissions.server.ts";
import { type Route } from "./+types/duplicates.ts";

export const handle: SEOHandle = {
  getSitemapEntries: () => null,
};

const FILTER_OPTIONS = ["all", "exact", "similar"] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

interface DuplicateGroup {
  id: string;
  type: "exact";
  contentHash: string;
  tracks: Array<{
    trackId: string;
    title: string;
    artist: string;
    fileSize: number;
    contentHash: string;
    fileName: string | null;
    format: string | null;
    audioFileId: string;
  }>;
}

interface DuplicateStats {
  storageSaved: number;
  duplicateGroups: number;
  totalDuplicates: number;
}

interface LoaderData {
  stats: DuplicateStats;
  groups: DuplicateGroup[];
  filter: FilterOption;
}

export async function loader({ request, url }: Route.LoaderArgs): Promise<LoaderData> {
  await requireUserWithRole(request, "admin");

  // Fetch data from the API endpoint
  const apiUrl = new URL(url);
  apiUrl.pathname = "/api/admin/duplicates";

  const response = await fetch(apiUrl.toString(), {
    headers: request.headers,
  });

  if (!response.ok) {
    throw data({ error: "Failed to load duplicates" }, { status: response.status });
  }

  const apiData = (await response.json()) as LoaderData;

  return {
    stats: apiData.stats,
    groups: apiData.groups,
    filter: apiData.filter,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const [deleteTrackId, setDeleteTrackId] = useState<string | null>(null);
  const deleteFetcher = useFetcher();

  const handleDelete = (trackId: string) => {
    deleteFetcher.submit(null, {
      method: "DELETE",
      action: `/api/admin/tracks/${trackId}`,
    });
    setDeleteTrackId(null);
  };

  const isDeleting = deleteFetcher.state === "submitting";

  // Filter out deleted tracks
  const visibleTracks = group.tracks.filter(
    (track) =>
      deleteFetcher.formData?.get("trackId") !== track.trackId &&
      deleteFetcher.data?.trackId !== track.trackId,
  );

  // Don't show group if only one track left
  if (visibleTracks.length <= 1) {
    return null;
  }

  const firstTrack = visibleTracks[0];
  const fileSize = firstTrack?.fileSize ?? 0;
  const groupTitle = firstTrack?.title ?? "Unknown Track";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">{groupTitle}</CardTitle>
              <CardDescription className="mt-1">
                {group.type === "exact" ? "Exact matches" : "Similar audio"} •{" "}
                {visibleTracks.length} tracks • {formatBytes(fileSize)} each
              </CardDescription>
            </div>
            <Badge variant="secondary">{group.type}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {visibleTracks.map((track, index) => (
              <div
                key={track.trackId}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {index === 0 && (
                      <Badge variant="outline" className="text-xs">
                        Original
                      </Badge>
                    )}
                    <Link to={`/tracks/${track.trackId}`} className="font-medium hover:underline">
                      {track.title}
                    </Link>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    by {track.artist}
                    {track.format && ` • ${track.format.toUpperCase()}`}
                    {track.fileName && ` • ${track.fileName}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/tracks/${track.trackId}`}>View</Link>
                  </Button>
                  {index > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteTrackId(track.trackId)}
                      disabled={isDeleting}
                    >
                      <Icon name="trash" className="mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteTrackId !== null}
        onOpenChange={(open) => !open && setDeleteTrackId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete track?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the track from the database. The audio file will only be
              deleted from storage if no other tracks reference it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTrackId && handleDelete(deleteTrackId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function DuplicatesRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const { stats, groups, filter } = loaderData;
  const activeFilter = (searchParams.get("filter") ?? "all") as FilterOption;

  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Duplicate Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage duplicate audio files across the library
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin"
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            ← Back to admin
          </Link>
        </div>
      </div>

      <Spacer size="sm" />

      {/* Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Storage Saved</CardDescription>
            <CardTitle className="text-3xl">{formatBytes(stats.storageSaved)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">Through deduplication</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Duplicate Groups</CardDescription>
            <CardTitle className="text-3xl">{stats.duplicateGroups}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Files with identical content
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Duplicates</CardDescription>
            <CardTitle className="text-3xl">{stats.totalDuplicates}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Tracks referencing duplicate audio
          </CardContent>
        </Card>
      </div>

      <Spacer size="sm" />

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {FILTER_OPTIONS.map((option) => (
          <Form key={option} method="get" className="inline">
            {option !== "all" && <input type="hidden" name="filter" value={option} />}
            <Button
              type="submit"
              variant={activeFilter === option ? "default" : "outline"}
              size="sm"
              disabled={option === "similar"} // Disabled until issue #224
            >
              {option === "all" && "All"}
              {option === "exact" && "Exact Hash"}
              {option === "similar" && "Similar Audio"}
              {option === "similar" && (
                <span className="ml-1 text-xs opacity-70">(coming soon)</span>
              )}
            </Button>
          </Form>
        ))}
      </div>

      {/* Duplicate Groups */}
      <div className="space-y-4">
        {groups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Icon name="check-circled" className="text-body-2xl text-muted-foreground mb-4" />
              <h2 className="text-h2 mb-2">No duplicates found</h2>
              <p className="text-muted-foreground text-sm">
                {filter === "all"
                  ? "All audio files are unique"
                  : filter === "exact"
                    ? "No exact duplicate audio files found"
                    : "No similar audio files found"}
              </p>
            </CardContent>
          </Card>
        ) : (
          groups.map((group) => <DuplicateGroupCard key={group.id} group={group} />)
        )}
      </div>

      {groups.length > 0 && (
        <div className="text-muted-foreground mt-6 text-center text-sm">
          Showing up to 100 duplicate groups
        </div>
      )}
    </div>
  );
}

function Duplicates403() {
  return (
    <div className="flex flex-col items-center gap-2 py-12">
      <Icon name="avatar" className="text-body-2xl" />
      <h1 className="text-h1">403</h1>
      <p>You must be an admin to view this page.</p>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary statusHandlers={{ 403: Duplicates403 }} />;
}
