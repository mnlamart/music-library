import { useLoaderData } from "react-router";
import { useState } from "react";
import { data } from "react-router";
import { Button } from "#app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#app/components/ui/card";
import { Icon } from "#app/components/ui/icon";
import { ArtistMergeDialog, type ArtistOption } from "#app/components/artist-merge-dialog";
import { AlbumMergeDialog, type AlbumOption } from "#app/components/album-merge-dialog";
import { type Route } from "./+types/duplicates";

// This will use the backend API when available
export async function loader({ request }: Route.LoaderArgs) {
  // For now, return empty data structure
  // Once backend is ready, this will fetch from:
  // - GET /api/metadata/artists/duplicates
  // - GET /api/metadata/albums/duplicates

  return data({
    artistGroups: [],
    albumGroups: [],
  });
}

export default function DuplicatesPage() {
  const { artistGroups, albumGroups } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<"both" | "artists" | "albums">("both");
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeType, setMergeType] = useState<"artist" | "album">("artist");
  const [mergeData, setMergeData] = useState<{
    source?: ArtistOption | AlbumOption;
    target?: ArtistOption | AlbumOption;
    artistName?: string;
  }>({});

  const showArtists = filter === "both" || filter === "artists";
  const showAlbums = filter === "both" || filter === "albums";

  const handleMergeArtists = (artists: ArtistOption[]) => {
    if (artists.length < 2) return;
    // Smart defaults: fewer tracks -> more tracks
    const sorted = [...artists].sort((a, b) => a.trackCount - b.trackCount);
    setMergeType("artist");
    setMergeData({
      source: sorted[0],
      target: sorted[sorted.length - 1],
    });
    setMergeDialogOpen(true);
  };

  const handleMergeAlbums = (albums: AlbumOption[], artistName: string) => {
    if (albums.length < 2) return;
    const sorted = [...albums].sort((a, b) => a.trackCount - b.trackCount);
    setMergeType("album");
    setMergeData({
      source: sorted[0],
      target: sorted[sorted.length - 1],
      artistName,
    });
    setMergeDialogOpen(true);
  };

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Duplicate Detection</h1>
        <p className="text-muted-foreground">
          Find and merge duplicate artists and albums to keep your library organized
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        <Button
          variant={filter === "both" ? "default" : "outline"}
          onClick={() => setFilter("both")}
          size="sm"
        >
          Both
        </Button>
        <Button
          variant={filter === "artists" ? "default" : "outline"}
          onClick={() => setFilter("artists")}
          size="sm"
        >
          Artists Only
        </Button>
        <Button
          variant={filter === "albums" ? "default" : "outline"}
          onClick={() => setFilter("albums")}
          size="sm"
        >
          Albums Only
        </Button>
      </div>

      <div className="space-y-8">
        {showArtists && artistGroups.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Potential Duplicate Artists</h2>
            <div className="space-y-4">
              {artistGroups.map((group: any) => (
                <Card key={group.normalizedName}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {group.artists.map((a: any) => a.name).join(" / ")}
                        </CardTitle>
                        <CardDescription>
                          {group.totalTracks} total tracks across {group.artists.length} entries
                        </CardDescription>
                      </div>
                      <Button size="sm" onClick={() => handleMergeArtists(group.artists)}>
                        Merge These →
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.artists.map((artist: any, index: number) => (
                        <div
                          key={artist.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-medium">{artist.name}</div>
                            {index === group.artists.length - 1 && (
                              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {artist.trackCount} tracks, {artist.albumCount} albums
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {showAlbums && albumGroups.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Potential Duplicate Albums</h2>
            <div className="space-y-4">
              {albumGroups.map((group: any) => (
                <Card key={`${group.artistId}-${group.albumName}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {group.albumName} by {group.artistName}
                        </CardTitle>
                        <CardDescription>
                          {group.totalTracks} total tracks across {group.albums.length} entries
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleMergeAlbums(group.albums, group.artistName)}
                      >
                        Merge These →
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.albums.map((album: any, index: number) => (
                        <div
                          key={album.id}
                          className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="font-medium">
                              {album.name}
                              {album.year && ` (${album.year})`}
                            </div>
                            {index === group.albums.length - 1 && (
                              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {album.trackCount} tracks
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {artistGroups.length === 0 && albumGroups.length === 0 && (
          <div className="text-center py-12">
            <Icon name="check-circled" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No duplicates found</h3>
            <p className="text-sm text-muted-foreground">
              Your library is clean! All artists and albums have unique names.
            </p>
          </div>
        )}
      </div>

      {mergeType === "artist" ? (
        <ArtistMergeDialog
          sourceArtist={mergeData.source as ArtistOption | undefined}
          targetArtist={mergeData.target as ArtistOption | undefined}
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          onMerged={() => window.location.reload()}
        />
      ) : (
        <AlbumMergeDialog
          sourceAlbum={mergeData.source as AlbumOption | undefined}
          targetAlbum={mergeData.target as AlbumOption | undefined}
          artistName={mergeData.artistName}
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          onMerged={() => window.location.reload()}
        />
      )}
    </div>
  );
}
