/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GotACodeJoin } from "#app/components/party-room/got-a-code-join.tsx";
import { GuestRoomLivePanel } from "#app/components/party-room/guest-room-live-panel.tsx";
import { InRoomChip } from "#app/components/party-room/in-room-chip.tsx";
import { HostFailoverControls } from "#app/components/party-room/host-failover-controls.tsx";
import { AddToRoomQueueAction } from "#app/components/party-room/add-to-room-queue-action.tsx";
import { RoomQueuePanel } from "#app/components/party-room/room-queue-panel.tsx";
import { RoomsHub } from "#app/components/party-room/rooms-hub.tsx";

const join = vi.fn();
const becomeHostNow = vi.fn();
const reclaimHostNow = vi.fn();
const addTrack = vi.fn();
const addPlaylist = vi.fn();
const reorderUpcoming = vi.fn();
const setRole = vi.fn();
const kick = vi.fn();

const queueItem = (id: string, position: number, title: string) => ({
  id,
  position,
  trackId: `track-${id}`,
  track: {
    id: `track-${id}`,
    title,
    artistName: "Artist",
    duration: 180,
    coverObjectKey: null,
    hasAudio: true,
  },
  addedByParticipantId: "p1",
  addedByDisplayName: "Host",
  createdAt: new Date().toISOString(),
});

const baseParty = {
  room: null as null | Record<string, unknown>,
  loading: false,
  error: null as string | null,
  apiUnavailable: false,
  isHost: false,
  canAddTracks: false,
  canTransport: false,
  canManage: false,
  showBecomeHost: false,
  showReclaimHost: false,
  refresh: vi.fn(),
  create: vi.fn(),
  join,
  leave: vi.fn(),
  end: vi.fn(),
  becomeHostNow,
  reclaimHostNow,
  setDefaultJoinRole: vi.fn(),
  addTrack,
  addPlaylist,
  reorderUpcoming,
  setRole,
  kick,
  transport: vi.fn(),
  clearError: vi.fn(),
};

vi.mock("#app/features/party-room/party-room-provider.tsx", () => ({
  useOptionalPartyRoom: () => mockParty,
  usePartyRoom: () => mockParty,
}));

vi.mock("#app/components/ui/use-toast.ts", () => ({
  toast: vi.fn(),
}));

let mockParty = { ...baseParty };

function renderWithRouter(ui: React.ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: ui }], { initialEntries: ["/"] });
  return render(<RouterProvider router={router} />);
}

describe("Party Room UI affordances", () => {
  beforeEach(() => {
    mockParty = {
      ...baseParty,
      room: null,
      join,
      becomeHostNow,
      reclaimHostNow,
      addTrack,
      addPlaylist,
      reorderUpcoming,
      setRole,
      kick,
    };
    join.mockReset();
    becomeHostNow.mockReset();
    reclaimHostNow.mockReset();
    addTrack.mockReset();
    addPlaylist.mockReset();
    reorderUpcoming.mockReset();
    setRole.mockReset();
    kick.mockReset();
  });

  it("renders Got a code? join form when not in a room", () => {
    renderWithRouter(<GotACodeJoin />);
    expect(screen.getByRole("heading", { name: /got a code/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/room code or join link/i)).toBeInTheDocument();
  });

  it("joins with a normalized code from the home form", async () => {
    join.mockResolvedValue({ code: "AB3K9Q" });
    renderWithRouter(<GotACodeJoin />);
    fireEvent.change(screen.getByLabelText(/room code or join link/i), {
      target: { value: "ab3k9q" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join room/i }));
    await waitFor(() => expect(join).toHaveBeenCalledWith("AB3K9Q"));
  });

  it("shows in-room chip with code when participating", () => {
    mockParty = {
      ...mockParty,
      isHost: true,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        me: { id: "p1", role: "host" },
      },
    };
    renderWithRouter(<InRoomChip />);
    expect(screen.getByLabelText(/in room AB3K9Q/i)).toBeInTheDocument();
    expect(screen.getByText("Host")).toBeInTheDocument();
  });

  it("shows Become host when takeover is available", () => {
    mockParty = {
      ...mockParty,
      showBecomeHost: true,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        me: { id: "p2", role: "dj" },
      },
    };
    renderWithRouter(<HostFailoverControls />);
    expect(screen.getByRole("button", { name: /become host/i })).toBeInTheDocument();
  });

  it("shows Reclaim host for original host who lost the seat", () => {
    mockParty = {
      ...mockParty,
      showReclaimHost: true,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        me: { id: "p1", role: "dj" },
      },
    };
    renderWithRouter(<HostFailoverControls />);
    expect(screen.getByRole("button", { name: /reclaim host/i })).toBeInTheDocument();
  });

  it("shows Add to room queue only when role can add", async () => {
    mockParty = {
      ...mockParty,
      canAddTracks: true,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        me: { id: "p1", role: "dj" },
      },
    };
    addTrack.mockResolvedValue(undefined);
    renderWithRouter(<AddToRoomQueueAction trackId="track-1" />);
    fireEvent.click(screen.getByRole("button", { name: /add to room queue/i }));
    await waitFor(() => expect(addTrack).toHaveBeenCalledWith("track-1"));
  });

  it("hides Add to room queue for listeners", () => {
    mockParty = {
      ...mockParty,
      canAddTracks: false,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        me: { id: "p1", role: "listener" },
      },
    };
    const { container } = renderWithRouter(<AddToRoomQueueAction trackId="track-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows drag handles for Host/DJ upcoming tracks", () => {
    mockParty = {
      ...mockParty,
      isHost: true,
      canTransport: true,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        roomVersion: 1,
        me: { id: "p1", role: "host", userId: "u1" },
        queue: [
          queueItem("q0", 0, "Now"),
          queueItem("q1", 1, "Next A"),
          queueItem("q2", 2, "Next B"),
        ],
        playback: { isPlaying: false, currentIndex: 0, currentTrackId: "track-q0" },
      },
    };
    renderWithRouter(<RoomQueuePanel />);
    expect(screen.getByText(/drag to reorder/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/drag to reorder next a/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/drag to reorder next b/i)).toBeInTheDocument();
  });

  it("hides drag handles for listeners", () => {
    mockParty = {
      ...mockParty,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        roomVersion: 1,
        me: { id: "p2", role: "listener", userId: "u2" },
        queue: [queueItem("q0", 0, "Now"), queueItem("q1", 1, "Next A")],
        playback: { isPlaying: false, currentIndex: 0, currentTrackId: "track-q0" },
      },
    };
    renderWithRouter(<RoomQueuePanel />);
    expect(screen.queryByText(/drag to reorder/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/drag to reorder/i)).not.toBeInTheDocument();
  });

  it("guest Room tab shows live queue reorder, Become host, and Leave", () => {
    mockParty = {
      ...mockParty,
      showBecomeHost: true,
      refresh: vi.fn(),
      leave: vi.fn(),
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        roomVersion: 2,
        me: { id: "g1", role: "dj", userId: null, isGuest: true, displayName: "Walkup" },
        queue: [
          queueItem("q0", 0, "Now"),
          queueItem("q1", 1, "Guest Next"),
          queueItem("q2", 2, "Guest Next B"),
        ],
        playback: { isPlaying: true, currentIndex: 0, currentTrackId: "track-q0" },
      },
    };
    renderWithRouter(<GuestRoomLivePanel code="AB3K9Q" role="dj" displayName="Walkup" />);
    expect(screen.getByRole("button", { name: /become host/i })).toBeInTheDocument();
    expect(screen.getByText(/drag to reorder/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/drag to reorder guest next\./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/drag to reorder guest next b/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leave room/i })).toBeInTheDocument();
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText("Walkup")).toBeInTheDocument();
  });

  it("guest Leave room posts using the known join code even before snapshot sync", async () => {
    const leave = vi.fn().mockResolvedValue(undefined);
    mockParty = {
      ...mockParty,
      room: null,
      loading: true,
      refresh: vi.fn(),
      leave,
    };
    renderWithRouter(<GuestRoomLivePanel code="AB3K9Q" role="listener" displayName="Walkup" />);
    fireEvent.click(screen.getByRole("button", { name: /leave room/i }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith("AB3K9Q"));
  });

  it("guest Room tab reflects live host role after takeover", () => {
    mockParty = {
      ...mockParty,
      isHost: true,
      canTransport: true,
      showBecomeHost: false,
      refresh: vi.fn(),
      leave: vi.fn(),
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        roomVersion: 3,
        me: { id: "g1", role: "host", userId: null, isGuest: true, displayName: "Walkup" },
        queue: [queueItem("q0", 0, "Now")],
        playback: { isPlaying: false, currentIndex: 0, currentTrackId: "track-q0" },
      },
    };
    renderWithRouter(<GuestRoomLivePanel code="AB3K9Q" role="dj" displayName="Walkup" />);
    expect(screen.getByText(/signed in as/i).textContent).toMatch(/host/i);
    expect(screen.queryByRole("button", { name: /become host/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
  });

  it("lets Host promote and kick other participants", async () => {
    setRole.mockResolvedValue(undefined);
    kick.mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ playlists: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockParty = {
      ...mockParty,
      canManage: true,
      isHost: true,
      room: {
        id: "r1",
        code: "AB3K9Q",
        status: "open",
        roomVersion: 1,
        defaultJoinRole: "listener",
        me: { id: "p1", role: "host", userId: "u1" },
        participants: [
          {
            id: "p1",
            displayName: "Kody",
            role: "host",
            userId: "u1",
            isGuest: false,
            lastHeartbeatAt: null,
            isOriginalHost: true,
          },
          {
            id: "p2",
            displayName: "Alex",
            role: "listener",
            userId: "u2",
            isGuest: false,
            lastHeartbeatAt: null,
            isOriginalHost: false,
          },
        ],
        queue: [],
        playback: { isPlaying: false, currentIndex: 0, currentTrackId: null },
        joinUrl: "/rooms/AB3K9Q",
        qrDataUrl: null,
      },
    };
    renderWithRouter(<RoomsHub />);
    fireEvent.click(screen.getByRole("button", { name: /make dj/i }));
    await waitFor(() => expect(setRole).toHaveBeenCalledWith("p2", "dj"));
    fireEvent.click(screen.getByRole("button", { name: /kick/i }));
    await waitFor(() => expect(kick).toHaveBeenCalledWith("p2"));
    expect(screen.getByText(/add playlist to queue/i)).toBeInTheDocument();
    vi.mocked(globalThis.fetch).mockRestore();
  });
});
