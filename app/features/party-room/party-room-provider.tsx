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
  addPlaylistToRoomQueue,
  addTrackToRoomQueue,
  becomeHost,
  createRoom,
  endRoom,
  fetchCurrentRoom,
  fetchRoomQrDataUrl,
  joinRoom,
  kickParticipant,
  leaveRoom,
  reclaimHost,
  reorderRoomQueue,
  RoomApiError,
  ROOM_API,
  sendHostHeartbeat,
  sendRoomTransport,
  setParticipantRole,
  updateRoomSettings,
  writeActiveRoomCode,
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
import {
  ROOM_HOST_HEARTBEAT_INTERVAL_MS,
  type RoomDefaultJoinRole,
  type RoomRole,
} from "./constants.ts";
import { type RoomSnapshot, type RoomTransportAction } from "./types.ts";
import { useOptionalUser } from "#app/utils/user.ts";

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
  addPlaylist: (playlistId: string) => Promise<void>;
  reorderUpcoming: (orderedUpcomingIds: string[]) => Promise<void>;
  setRole: (participantId: string, role: Exclude<RoomRole, "host">) => Promise<void>;
  kick: (participantId: string) => Promise<void>;
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
  const user = useOptionalUser();
  const meUserId = user?.id ?? null;
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const roomCodeRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const applyRoom = useCallback((next: RoomSnapshot | null) => {
    setRoom(next);
    roomCodeRef.current = next?.code ?? null;
    if (next?.code) writeActiveRoomCode(next.code);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      applyRoom(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const current = await fetchCurrentRoom(meUserId);
      applyRoom(current);
      setApiUnavailable(false);
      setError(null);
      if (current && !current.qrDataUrl) {
        const qr = await fetchRoomQrDataUrl(current.code);
        if (qr) applyRoom({ ...current, qrDataUrl: qr });
      }
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
  }, [applyRoom, enabled, meUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // SSE live sync while participating
  useEffect(() => {
    const code = room?.code;
    if (!code || room.status !== "open") {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    if (eventSourceRef.current) return;

    let cancelled = false;
    const es = new EventSource(ROOM_API.events(code));
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (cancelled) return;
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        const type = typeof payload.type === "string" ? payload.type : null;

        // Handshake / non-snapshot events must not be treated as RoomSnapshots
        // (`connected` carries roomId; `room_ended` would wipe queue into "open").
        if (type === "connected") return;
        if (type === "room_ended") {
          applyRoom(null);
          writeActiveRoomCode(null);
          return;
        }
        if (type === "version") {
          void refresh();
          return;
        }

        const isSnapshot =
          type === "room_snapshot" ||
          type === "snapshot" ||
          (type == null && (payload.queue != null || payload.participants != null));
        if (!isSnapshot) return;

        const raw = (payload.room as Record<string, unknown> | undefined) ?? payload;
        void import("./api.client.ts").then(({ normalizeRoomSnapshot }) => {
          applyRoom(normalizeRoomSnapshot(raw, meUserId));
        });
      } catch {
        // ignore malformed SSE
      }
    };

    es.onerror = () => {
      // Browser reconnects; refresh covers permanent failure.
    };

    return () => {
      cancelled = true;
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
    };
  }, [applyRoom, meUserId, refresh, room?.code, room?.status]);

  // Host heartbeat ~2–3s
  useEffect(() => {
    if (!room || !isCurrentHost(room) || room.status !== "open") return;

    const tick = () => {
      void sendHostHeartbeat(room.code).catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, ROOM_HOST_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [room]);

  const create = useCallback(
    async (defaultJoinRole: RoomDefaultJoinRole = "listener") => {
      setError(null);
      try {
        const next = await createRoom({ defaultJoinRole }, meUserId);
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
    [applyRoom, meUserId],
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
        const next = await joinRoom({ code, displayName }, meUserId);
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
    [applyRoom, meUserId],
  );

  const leave = useCallback(async () => {
    const code = roomCodeRef.current;
    if (!code) return;
    setError(null);
    try {
      await leaveRoom(code);
      applyRoom(null);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, [applyRoom]);

  const end = useCallback(async () => {
    const code = roomCodeRef.current;
    if (!code) return;
    setError(null);
    try {
      await endRoom(code);
      applyRoom(null);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, [applyRoom]);

  const becomeHostNow = useCallback(async () => {
    const code = roomCodeRef.current;
    if (!code) return;
    const next = await becomeHost(code, meUserId);
    applyRoom(next);
  }, [applyRoom, meUserId]);

  const reclaimHostNow = useCallback(async () => {
    const code = roomCodeRef.current;
    if (!code) return;
    const next = await reclaimHost(code, meUserId);
    applyRoom(next);
  }, [applyRoom, meUserId]);

  const setDefaultJoinRole = useCallback(
    async (role: RoomDefaultJoinRole) => {
      const code = roomCodeRef.current;
      if (!code) return;
      const next = await updateRoomSettings(code, { defaultJoinRole: role }, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
  );

  const addTrack = useCallback(
    async (trackId: string) => {
      const code = roomCodeRef.current;
      if (!code) throw new Error("Not in a room");
      const next = await addTrackToRoomQueue(code, trackId, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
  );

  const addPlaylist = useCallback(
    async (playlistId: string) => {
      const code = roomCodeRef.current;
      if (!code) throw new Error("Not in a room");
      const next = await addPlaylistToRoomQueue(code, playlistId, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
  );

  const reorderUpcoming = useCallback(
    async (orderedUpcomingIds: string[]) => {
      const code = roomCodeRef.current;
      if (!code) throw new Error("Not in a room");
      const next = await reorderRoomQueue(code, orderedUpcomingIds, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
  );

  const setRole = useCallback(
    async (participantId: string, role: Exclude<RoomRole, "host">) => {
      const code = roomCodeRef.current;
      if (!code) throw new Error("Not in a room");
      const next = await setParticipantRole(code, participantId, role, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
  );

  const kick = useCallback(
    async (participantId: string) => {
      const code = roomCodeRef.current;
      if (!code) throw new Error("Not in a room");
      const next = await kickParticipant(code, participantId, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
  );

  const transport = useCallback(
    async (action: RoomTransportAction) => {
      const code = roomCodeRef.current;
      if (!code) return;
      const next = await sendRoomTransport(code, action, meUserId);
      applyRoom(next);
    },
    [applyRoom, meUserId],
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
      addPlaylist,
      reorderUpcoming,
      setRole,
      kick,
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
    addPlaylist,
    reorderUpcoming,
    setRole,
    kick,
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
