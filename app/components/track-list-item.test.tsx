/**
 * @vitest-environment jsdom
 *
 * TrackListItem UI tests. Queue action *behavior* (order, queue sheet visibility) lives in
 * audio-player-queue.integration.test.tsx — these tests only cover menu wiring and visibility.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { type FullTrack } from "#app/types/frontend/shared";
import { TrackListItem } from "./track-list-item";

type MockUser = {
  id: string;
  roles: Array<{
    name: string;
    permissions: Array<{ action: string; entity: string; access: string }>;
  }>;
};

const userState = vi.hoisted(() => ({
  current: undefined as MockUser | null | undefined,
}));

vi.mock("#app/utils/user.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#app/utils/user.ts")>();
  return {
    ...actual,
    useOptionalUser: () => userState.current,
  };
});

const mockPlayTrack = vi.fn();
const mockPlayNextTrack = vi.fn();
const mockAddToUpNext = vi.fn();
const mockAddToQueue = vi.fn();
const mockToast = vi.fn();

let mockPlayerState: {
  currentTrack: FullTrack | null;
  currentIndex: number;
  isPlayerVisible: boolean;
} = {
  currentTrack: null,
  currentIndex: 0,
  isPlayerVisible: false,
};

vi.mock("./audio-player-provider", () => ({
  AudioPlayerProvider: ({ children }: { children: ReactNode }) => children,
  useAudioPlayer: () => ({
    currentTrack: mockPlayerState.currentTrack,
    currentIndex: mockPlayerState.currentIndex,
    isPlayerVisible: mockPlayerState.isPlayerVisible,
    playTrack: mockPlayTrack,
    playNextTrack: mockPlayNextTrack,
    addToUpNext: mockAddToUpNext,
    addToQueue: mockAddToQueue,
  }),
}));

vi.mock("#app/components/ui/use-toast.ts", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

let mockIsMobile = false;
vi.mock("#app/utils/use-mobile.ts", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("./add-to-playlist-menu", () => ({
  AddToPlaylistMenu: ({ playlists }: { playlists?: Array<{ id: string; title: string }> }) => (
    <div data-testid="add-to-playlist-menu">
      {playlists?.map((playlist) => (
        <div key={playlist.id}>{playlist.title}</div>
      ))}
    </div>
  ),
}));

// jsdom doesn't implement matchMedia — stub it so useIsMobile() works
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const mockTrack = {
  id: "track-1",
  title: "Test Song",
  artist: { id: "artist-1", name: "Test Artist" },
  duration: 180,
  coverImage: null,
  thumbnailUrl: null,
  serviceUrl: "https://youtube.com/watch?v=test",
  service: { displayName: "YouTube", logoUrl: null },
  audioFiles: [],
  isInUserLibrary: true,
};

const playableTrack = {
  ...mockTrack,
  audioFiles: [{ id: "af-1", format: "mp3", objectKey: "audio/test.mp3" }],
};

const mockUserTrack = {
  createdAt: new Date("2024-01-01").toISOString(),
};

function renderTrackListItem(props: Partial<ComponentProps<typeof TrackListItem>> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <TrackListItem track={mockTrack} userTrack={mockUserTrack} index={0} {...props} />,
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

function userWithRole(name: string): MockUser {
  return { id: `${name}-1`, roles: [{ name, permissions: [] }] };
}

beforeEach(() => {
  userState.current = undefined;
  mockIsMobile = false;
  mockPlayerState = {
    currentTrack: null,
    currentIndex: 0,
    isPlayerVisible: false,
  };
  mockPlayTrack.mockReset();
  mockPlayNextTrack.mockReset();
  mockAddToUpNext.mockReset();
  mockAddToQueue.mockReset();
  mockToast.mockReset();
});

test("renders itemActions render prop when provided", () => {
  renderTrackListItem({
    itemActions: ({ trackId, isInLibrary, isDeleted }) => (
      <span data-testid="custom-action">
        {trackId}-{isInLibrary ? "lib" : "nolib"}-{isDeleted ? "del" : "ok"}
      </span>
    ),
  });

  const el = screen.getByTestId("custom-action");
  expect(el).toBeDefined();
  expect(el.textContent).toBe("track-1-lib-ok");
});

test("itemActions receives correct props when track is deleted", () => {
  let captured: { trackId: string; isInLibrary: boolean; isDeleted: boolean } | null = null;

  renderTrackListItem({
    track: { ...mockTrack, isInUserLibrary: false },
    index: 2,
    isDeleted: true,
    itemActions: (props) => {
      captured = props;
      return <span data-testid="deleted-action">deleted</span>;
    },
  });

  expect(screen.getByTestId("deleted-action")).toBeDefined();
  expect(captured).toEqual({
    trackId: "track-1",
    isInLibrary: false,
    isDeleted: true,
  });
});

test("itemActions receives correct props when isInUserLibrary is undefined", () => {
  let captured: { trackId: string; isInLibrary: boolean; isDeleted: boolean } | null = null;

  renderTrackListItem({
    track: { ...mockTrack, isInUserLibrary: undefined },
    itemActions: (props) => {
      captured = props;
      return <span data-testid="nolib-action">nolib</span>;
    },
  });

  expect(screen.getByTestId("nolib-action")).toBeDefined();
  expect(captured!.isInLibrary).toBe(false);
  expect(captured!.isDeleted).toBe(false);
});

test("does not render itemActions when not provided", () => {
  renderTrackListItem();

  // Track title should still render
  expect(screen.getByText("Test Song")).toBeDefined();
  // No data-testid elements from our render prop
  expect(screen.queryByTestId("custom-action")).toBeNull();
});

test("shows Add to Playlist when playlists is an empty array", async () => {
  const user = userEvent.setup();

  renderTrackListItem({ playlists: [] });

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getByText("Add to Playlist")).toBeDefined();
});

test("hides queue actions when track has no audio files", async () => {
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.queryByText("Play next")).toBeNull();
  expect(screen.queryByText("Add to up next")).toBeNull();
  expect(screen.queryByText("Add to queue")).toBeNull();
});

test("shows queue actions when track has audio files", async () => {
  const user = userEvent.setup();

  renderTrackListItem({ track: playableTrack });

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getByText("Play next")).toBeDefined();
  expect(screen.getByText("Add to up next")).toBeDefined();
  expect(screen.getByText("Add to queue")).toBeDefined();
});

test("mobile more-actions button opens sheet without starting playback", async () => {
  mockIsMobile = true;
  const user = userEvent.setup();

  renderTrackListItem({ track: playableTrack });

  await user.click(screen.getByRole("button", { name: "More actions" }));

  expect(screen.getByText("View track details")).toBeDefined();
  expect(mockPlayTrack).not.toHaveBeenCalled();
});

test("mobile actions sheet Play next does not start row playback", async () => {
  mockIsMobile = true;
  const user = userEvent.setup();

  renderTrackListItem({ track: playableTrack });

  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByText("Play next"));

  expect(mockPlayNextTrack).toHaveBeenCalled();
  expect(mockPlayTrack).not.toHaveBeenCalled();
});

test("mobile actions sheet overlay dismiss does not start playback", async () => {
  mockIsMobile = true;
  const user = userEvent.setup();

  renderTrackListItem({ track: playableTrack });

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getByText("View track details")).toBeDefined();

  // Portaled overlay click must not React-bubble into the row's onClick=play
  // (sheets are siblings of the row for this reason — see track-list-item.tsx).
  const overlay = document.querySelector(".fixed.inset-0.z-53");
  expect(overlay).not.toBeNull();
  await user.click(overlay!);

  expect(screen.queryByText("View track details")).toBeNull();
  expect(mockPlayTrack).not.toHaveBeenCalled();
});

test("compact variant hides track number column", () => {
  renderTrackListItem({ variant: "compact", index: 4 });

  expect(screen.queryByLabelText("Track number 5")).toBeNull();
  expect(screen.getByText("Test Song")).toBeDefined();
});

test("showQuickAddToPlaylist renders add button and opens playlist menu on desktop", async () => {
  const user = userEvent.setup();

  renderTrackListItem({
    showQuickAddToPlaylist: true,
    playlists: [{ id: "pl-1", title: "My Playlist", description: null, _count: { tracks: 1 } }],
  });

  await user.click(screen.getByRole("button", { name: "Add to playlist" }));
  expect(screen.getByText("My Playlist")).toBeDefined();
});

test("hides Flag for review from listeners on the desktop overflow menu", async () => {
  userState.current = userWithRole("user");
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.queryByRole("menuitem", { name: /flag for review/i })).toBeNull();
});

test("hides Flag for review when signed out", async () => {
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.queryByRole("menuitem", { name: /flag for review/i })).toBeNull();
});

test("curator can open Flag for review from the desktop overflow menu", async () => {
  userState.current = userWithRole("curator");
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: /flag for review/i }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Flag for Review" })).toBeDefined();
  expect(within(dialog).getByText(/Test Song/)).toBeDefined();
});

test("admin can open Flag for review from the desktop overflow menu", async () => {
  userState.current = userWithRole("admin");
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.getByRole("menuitem", { name: /flag for review/i })).toBeDefined();
});

test("curator can open Flag for review from the mobile actions sheet", async () => {
  mockIsMobile = true;
  userState.current = userWithRole("curator");
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("button", { name: /flag for review/i }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Flag for Review" })).toBeDefined();
  expect(within(dialog).getByText(/Test Song/)).toBeDefined();
  expect(mockPlayTrack).not.toHaveBeenCalled();
});

test("mobile actions sheet hides Flag for review from listeners", async () => {
  mockIsMobile = true;
  userState.current = userWithRole("user");
  const user = userEvent.setup();

  renderTrackListItem();

  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(screen.queryByRole("button", { name: /flag for review/i })).toBeNull();
});

test("showQuickAddToPlaylist opens playlist sheet directly on mobile", async () => {
  mockIsMobile = true;
  const user = userEvent.setup();

  renderTrackListItem({
    showQuickAddToPlaylist: true,
    playlists: [{ id: "pl-1", title: "My Playlist", description: null, _count: { tracks: 1 } }],
  });

  await user.click(screen.getByRole("button", { name: "Add to playlist" }));
  expect(screen.getByRole("heading", { name: "Add to Playlist" })).toBeDefined();
  expect(screen.getByText("My Playlist")).toBeDefined();
});
