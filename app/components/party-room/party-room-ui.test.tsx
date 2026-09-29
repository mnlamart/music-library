/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GotACodeJoin } from "#app/components/party-room/got-a-code-join.tsx";
import { InRoomChip } from "#app/components/party-room/in-room-chip.tsx";
import { HostFailoverControls } from "#app/components/party-room/host-failover-controls.tsx";
import { AddToRoomQueueAction } from "#app/components/party-room/add-to-room-queue-action.tsx";
import { RoomQueuePanel } from "#app/components/party-room/room-queue-panel.tsx";

const join = vi.fn();
const becomeHostNow = vi.fn();
const reclaimHostNow = vi.fn();
const addTrack = vi.fn();
const reorderUpcoming = vi.fn();

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
  reorderUpcoming,
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
      reorderUpcoming,
    };
    join.mockReset();
    becomeHostNow.mockReset();
    reclaimHostNow.mockReset();
    addTrack.mockReset();
    reorderUpcoming.mockReset();
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
});
