/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { type HomeListeningData } from "#app/utils/home.server.ts";
import { ListeningHome } from "./listening-home.tsx";

const playLibrary = vi.fn();

vi.mock("#app/components/audio-player-provider.tsx", () => ({
  useAudioPlayer: () => ({
    playLibrary,
    isLoadingNext: false,
  }),
}));

vi.mock("#app/hooks/use-pwa-install.ts", () => ({
  usePwaInstall: () => ({
    visible: false,
    dismiss: vi.fn(),
    install: vi.fn(),
    isIos: false,
    isAndroid: false,
    canInstallNatively: false,
  }),
}));

vi.mock("#app/components/home/home-recent-track-row.tsx", () => ({
  HomeRecentTrackRow: () => <div>Recent tracks row</div>,
}));

vi.mock("#app/components/home/home-recent-playlist-row.tsx", () => ({
  HomeRecentPlaylistRow: () => <div>Recent playlists row</div>,
}));

vi.mock("#app/components/home/recently-played-strip.tsx", () => ({
  RecentlyPlayedStrip: ({ tracks }: { tracks: Array<{ track: { title: string } }> }) =>
    tracks.length === 0 ? null : (
      <section>
        <h2>Recently played</h2>
        <div>{tracks.map((t) => t.track.title).join(", ")}</div>
      </section>
    ),
}));

const baseListeningData: HomeListeningData = {
  mode: "listening",
  totalTracks: 4,
  playableTracks: 2,
  archivingCount: 2,
  stats: {
    totalTracks: 4,
    totalPlaylists: 1,
  },
  recentTracks: [],
  recentlyPlayed: [],
  recentPlaylists: [],
  youtubeData: Promise.resolve({
    hasYouTubeConnection: true,
    youtubeStats: {
      totalPlaylists: 1,
      lastSync: new Date("2024-01-01"),
    },
    youtubePlaylists: [],
  }),
};

function renderListening(props: Partial<HomeListeningData> & { showArchivingBanner: boolean }) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Suspense fallback={<div>Loading</div>}>
            <ListeningHome {...baseListeningData} {...props} />
          </Suspense>
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);
}

test("disables Play library in gray mode", async () => {
  renderListening({
    showArchivingBanner: true,
    mode: "gray",
    playableTracks: 0,
    archivingCount: 3,
  });

  expect(await screen.findByRole("button", { name: /play library/i })).toBeDisabled();
});

test("shows archiving banner in gray mode", async () => {
  renderListening({
    showArchivingBanner: true,
    mode: "gray",
    totalTracks: 3,
    playableTracks: 0,
    archivingCount: 3,
  });

  const banner = await screen.findByRole("status");
  expect(banner).toHaveTextContent("3 tracks in your library");
  expect(banner).toHaveTextContent("0 ready to play");
  expect(banner).toHaveTextContent("3 archiving");
});

test("enables Play library when tracks are playable", async () => {
  renderListening({ showArchivingBanner: false });

  await waitFor(async () => {
    expect(await screen.findByRole("button", { name: /play library/i })).toBeEnabled();
  });
});

test("omits Recently played strip when recentlyPlayed is empty", async () => {
  renderListening({ showArchivingBanner: false, recentlyPlayed: [] });

  await screen.findByRole("heading", { name: /^home$/i });
  expect(screen.queryByRole("heading", { name: /recently played/i })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /recent playlists/i })).toBeInTheDocument();
});

test("places Recently played strip above recent playlists when non-empty", async () => {
  renderListening({
    showArchivingBanner: false,
    recentlyPlayed: [
      {
        playedAt: new Date("2026-09-23T12:00:00.000Z"),
        track: {
          id: "track-1",
          title: "Finished Song",
          duration: 180,
          serviceUrl: null,
          artist: { id: "a1", name: "Artist" },
          coverImage: null,
          service: null,
          audioFiles: [{ id: "af-1", format: "mp3", objectKey: "a.mp3" }],
        },
      },
    ],
  });

  const recentlyPlayed = await screen.findByRole("heading", { name: /recently played/i });
  const recentPlaylists = screen.getByRole("heading", { name: /recent playlists/i });
  expect(
    recentlyPlayed.compareDocumentPosition(recentPlaylists) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText("Finished Song")).toBeInTheDocument();
});
