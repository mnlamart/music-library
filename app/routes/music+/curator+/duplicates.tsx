import { useLoaderData } from "react-router";
import { useState } from "react";
import { data } from "react-router";
import { Button } from "#app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#app/components/ui/card";
import { Icon } from "#app/components/ui/icon";
import { ArtistMergeDialog, type ArtistOption } from "#app/components/artist-merge-dialog";
import { AlbumMergeDialog, type AlbumOption } from "#app/components/album-merge-dialog";
import { type Route } from "./+types/duplicates";

export async function loader({ request }: Route.LoaderArgs) {
  // Fetch duplicate data from APIs
  try {
    const [artistsResponse, albumsResponse] = await Promise.all([
      fetch(new URL("/api/curator/duplicates/artists", request.url).toString(), {
        headers: request.headers,
      }),
      fetch(new URL("/api/curator/duplicates/albums", request.url).toString(), {
        headers: request.headers,
      }),
    ]);

    const artistsData = (await artistsResponse.json()) as {
      exact: any[];
      fuzzy: any[];
    };
    const albumsData = (await albumsResponse.json()) as {
      exact: any[];
      fuzzy: any[];
    };

    // Combine exact and fuzzy groups for display
    const artistGroups = [
      ...artistsData.exact.map((g: any) => ({ ...g, matchType: "exact" as const })),
      ...artistsData.fuzzy.map((g: any) => ({ ...g, matchType: "fuzzy" as const })),
    ];

    const albumGroups = [
      ...albumsData.exact.map((g: any) => ({ ...g, matchType: "exact" as const })),
      ...albumsData.fuzzy.map((g: any) => ({ ...g, matchType: "fuzzy" as const })),
    ];

    return data({
      artistGroups,
      albumGroups,
    });
  } catch (error) {
    console.error("Error loading duplicates:", error);
    return data({
      artistGroups: [],
      albumGroups: [],
    });
  }
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
          <>
            {artistGroups.filter((g: any) => g.matchType === "exact").length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-2">Exact Duplicate Artists</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  These artists have identical normalized names and are very likely duplicates
                </p>
                <div className="space-y-4">
                  {artistGroups
                    .filter((g: any) => g.matchType === "exact")
                    .map((group: any) => (
                      <Card key={`exact-${group.normalizedName}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-base">
                                  {group.artists.map((a: any) => a.name).join(" / ")}
                                </CardTitle>
                                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                  Exact
                                </span>
                              </div>
                              <CardDescription>
                                {group.totalTracks} total tracks across {group.artists.length}{" "}
                                entries
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
                                  {index === 0 && (
                                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                      Most Tracks
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

            {artistGroups.filter((g: any) => g.matchType === "fuzzy").length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-2">Similar Artist Names (Fuzzy)</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  These artists have similar names and may be duplicates. Review carefully before
                  merging.
                </p>
                <div className="space-y-4">
                  {artistGroups
                    .filter((g: any) => g.matchType === "fuzzy")
                    .map((group: any) => (
                      <Card key={`fuzzy-${group.normalizedName}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-base">
                                  {group.artists.map((a: any) => a.name).join(" / ")}
                                </CardTitle>
                                <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                                  Fuzzy
                                </span>
                              </div>
                              <CardDescription>
                                {group.totalTracks} total tracks across {group.artists.length}{" "}
                                entries
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
                                  {index === 0 && (
                                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                      Most Tracks
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
          </>
        )}

        {showAlbums && albumGroups.length > 0 && (
          <>
            {albumGroups.filter((g: any) => g.matchType === "exact").length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-2">Exact Duplicate Albums</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  These albums have identical normalized names and are very likely duplicates
                </p>
                <div className="space-y-4">
                  {albumGroups
                    .filter((g: any) => g.matchType === "exact")
                    .map((group: any) => (
                      <Card key={`exact-${group.artistId}-${group.normalizedName}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-base">
                                  {group.albums[0].name} by {group.artistName}
                                </CardTitle>
                                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                  Exact
                                </span>
                              </div>
                              <CardDescription>
                                {group.totalTracks} total tracks across {group.albums.length}{" "}
                                entries
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
                                  {index === 0 && (
                                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                      Most Tracks
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

            {albumGroups.filter((g: any) => g.matchType === "fuzzy").length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-2">Similar Album Names (Fuzzy)</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  These albums have similar names and may be duplicates. Review carefully before
                  merging.
                </p>
                <div className="space-y-4">
                  {albumGroups
                    .filter((g: any) => g.matchType === "fuzzy")
                    .map((group: any) => (
                      <Card key={`fuzzy-${group.artistId}-${group.normalizedName}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-base">
                                  {group.albums[0].name} by {group.artistName}
                                </CardTitle>
                                <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                                  Fuzzy
                                </span>
                              </div>
                              <CardDescription>
                                {group.totalTracks} total tracks across {group.albums.length}{" "}
                                entries
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
                                  {index === 0 && (
                                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                      Most Tracks
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
          </>
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
