import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addTrackToRoomQueue,
  becomeHost,
  createRoom,
  endRoom,
  fetchCurrentRoom,
  joinRoom,
  leaveRoom,
  reclaimHost,
  RoomApiError,
  ROOM_API,
  sendHostHeartbeat,
  sendRoomTransport,
  updateRoomSettings,
} from "./api.client.ts";
import {
  canAddToRoomQueue,
  canBecomeHost,
  canControlTransport,
  canManageRoom,
  canReclaimHost,
  isCurrentHost,
  parseRoomCodeInput,
} from "./index.ts";
import { ROOM_HOST_HEARTBEAT_INTERVAL_MS, type RoomDefaultJoinRole } from "./constants.ts";
import { type RoomSnapshot, type RoomTransportAction } from "./types.ts";

type PartyRoomContextValue = {
  room: RoomSnapshot | null;
  loading: boolean;
  error: string | null;
  /** Backend APIs not yet available (404 / network). */
  apiUnavailable: boolean;
  isHost: boolean;
  canAddTracks: boolean;
  canTransport: boolean;
  canManage: boolean;
  showBecomeHost: boolean;
  showReclaimHost: boolean;
  refresh: () => Promise<void>;
  create: (defaultJoinRole?: RoomDefaultJoinRole) => Promise<RoomSnapshot>;
  join: (codeOrUrl: string, displayName?: string) => Promise<RoomSnapshot>;
  leave: () => Promise<void>;
  end: () => Promise<void>;
  becomeHostNow: () => Promise<void>;
  reclaimHostNow: () => Promise<void>;
  setDefaultJoinRole: (role: RoomDefaultJoinRole) => Promise<void>;
  addTrack: (trackId: string) => Promise<void>;
  transport: (action: RoomTransportAction) => Promise<void>;
  clearError: () => void;
};

const PartyRoomContext = createContext<PartyRoomContextValue | null>(null);

function errorMessage(err: unknown): string {
  if (err instanceof RoomApiError) {
    if (err.status === 404) {
      return "Party Room APIs are not available yet. Backend #286–#288 must land first.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export function PartyRoomProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  /** When false (signed out), skip polling. */
  enabled?: boolean;
}) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const roomIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const applyRoom = useCallback((next: RoomSnapshot | null) => {
    setRoom(next);
    roomIdRef.current = next?.id ?? null;
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      applyRoom(null);
      setLoading(false);
      return;
    }
    try {
      const current = await fetchCurrentRoom();
      applyRoom(current);
      setApiUnavailable(false);
      setError(null);
    } catch (err) {
      if (err instanceof RoomApiError && (err.status === 404 || err.status === 501)) {
        setApiUnavailable(true);
        applyRoom(null);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [applyRoom, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // SSE live sync while participating
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId || room.status !== "open") {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    if (eventSourceRef.current) return;

    let cancelled = false;
    const es = new EventSource(ROOM_API.events(roomId));
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          room?: RoomSnapshot;
          roomVersion?: number;
        };
        if (payload.room) {
          applyRoom(payload.room);
        } else if (payload.type === "version") {
          void fetchCurrentRoom()
            .then((current) => {
              if (current) applyRoom(current);
            })
            .catch(() => {});
        }
      } catch {
        // ignore malformed SSE
      }
    };

    es.onerror = () => {
      // Browser will reconnect; if permanently broken, periodic heartbeat/refresh covers it.
    };

    return () => {
      cancelled = true;
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
    };
  }, [applyRoom, room?.id, room?.status]);

  // Host heartbeat ~2–3s
  useEffect(() => {
    if (!room || !isCurrentHost(room) || room.status !== "open") return;

    const tick = () => {
      void sendHostHeartbeat(room.id).catch(() => {
        // Transient network — next tick retries
      });
    };
    tick();
    const id = window.setInterval(tick, ROOM_HOST_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [room]);

  const create = useCallback(
    async (defaultJoinRole: RoomDefaultJoinRole = "listener") => {
      setError(null);
      try {
        const next = await createRoom({ defaultJoinRole });
        applyRoom(next);
        setApiUnavailable(false);
        return next;
      } catch (err) {
        const msg = errorMessage(err);
        setError(msg);
        if (err instanceof RoomApiError && (err.status === 404 || err.status === 501)) {
          setApiUnavailable(true);
        }
        throw err;
      }
    },
    [applyRoom],
  );

  const join = useCallback(
    async (codeOrUrl: string, displayName?: string) => {
      const code = parseRoomCodeInput(codeOrUrl);
      if (!code) {
        const msg = "Enter a valid 6-character room code or join link";
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      try {
        const next = await joinRoom({ code, displayName });
        applyRoom(next);
        setApiUnavailable(false);
        return next;
      } catch (err) {
        const msg = errorMessage(err);
        setError(msg);
        if (err instanceof RoomApiError && (err.status === 404 || err.status === 501)) {
          setApiUnavailable(true);
        }
        throw err;
      }
    },
    [applyRoom],
  );

  const leave = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    setError(null);
    try {
      await leaveRoom(id);
      applyRoom(null);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, [applyRoom]);

  const end = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    setError(null);
    try {
      await endRoom(id);
      applyRoom(null);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, [applyRoom]);

  const becomeHostNow = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    const next = await becomeHost(id);
    applyRoom(next);
  }, [applyRoom]);

  const reclaimHostNow = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    const next = await reclaimHost(id);
    applyRoom(next);
  }, [applyRoom]);

  const setDefaultJoinRole = useCallback(
    async (role: RoomDefaultJoinRole) => {
      const id = roomIdRef.current;
      if (!id) return;
      const next = await updateRoomSettings(id, { defaultJoinRole: role });
      applyRoom(next);
    },
    [applyRoom],
  );

  const addTrack = useCallback(
    async (trackId: string) => {
      const id = roomIdRef.current;
      if (!id) throw new Error("Not in a room");
      const next = await addTrackToRoomQueue(id, trackId);
      applyRoom(next);
    },
    [applyRoom],
  );

  const transport = useCallback(
    async (action: RoomTransportAction) => {
      const id = roomIdRef.current;
      if (!id) return;
      const next = await sendRoomTransport(id, action);
      applyRoom(next);
    },
    [applyRoom],
  );

  const value = useMemo<PartyRoomContextValue>(() => {
    const role = room?.me?.role;
    return {
      room,
      loading,
      error,
      apiUnavailable,
      isHost: room ? isCurrentHost(room) : false,
      canAddTracks: role ? canAddToRoomQueue(role) : false,
      canTransport: role ? canControlTransport(role) : false,
      canManage: role ? canManageRoom(role) : false,
      showBecomeHost: room ? canBecomeHost(room) : false,
      showReclaimHost: room ? canReclaimHost(room) : false,
      refresh,
      create,
      join,
      leave,
      end,
      becomeHostNow,
      reclaimHostNow,
      setDefaultJoinRole,
      addTrack,
      transport,
      clearError: () => setError(null),
    };
  }, [
    room,
    loading,
    error,
    apiUnavailable,
    refresh,
    create,
    join,
    leave,
    end,
    becomeHostNow,
    reclaimHostNow,
    setDefaultJoinRole,
    addTrack,
    transport,
  ]);

  return <PartyRoomContext.Provider value={value}>{children}</PartyRoomContext.Provider>;
}

export function usePartyRoom(): PartyRoomContextValue {
  const ctx = useContext(PartyRoomContext);
  if (!ctx) {
    throw new Error("usePartyRoom must be used within a PartyRoomProvider");
  }
  return ctx;
}

/** Safe when provider may be absent (e.g. tests / marketing). */
export function useOptionalPartyRoom(): PartyRoomContextValue | null {
  return useContext(PartyRoomContext);
}
