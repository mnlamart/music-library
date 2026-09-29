/**
 * Party Room tunable limits (ADR-030).
 */

export const ROOM_CODE_LENGTH = 6;

/** Charset aligned with auth OTP — no 0/O/I. */
export const ROOM_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";

export const MAX_QUEUE_TRACKS = 500;
export const MAX_PARTICIPANTS = 50;
export const MAX_ACTIVE_ROOMS_PER_CREATOR = 1;
export const GUEST_DISPLAY_NAME_MIN = 1;
export const GUEST_DISPLAY_NAME_MAX = 24;

export const ADD_TRACK_RATE_PER_MIN = 30;
export const ROOM_SEARCH_RATE_PER_MIN = 60;
export const AUDITION_GRANT_RATE_PER_MIN = 20;

/** Auto-close after this long with zero connected participants. */
export const EMPTY_ROOM_TTL_MS = 45 * 60 * 1000;

/** Host heartbeat grace before another participant may Become host. */
export const HOST_GRACE_MS = 10_000;

export const ROOM_STATUS = {
  open: "open",
  ended: "ended",
} as const;

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];

export const ROOM_ROLE = {
  host: "host",
  dj: "dj",
  listener: "listener",
} as const;

export type RoomRole = (typeof ROOM_ROLE)[keyof typeof ROOM_ROLE];

/** Host-configurable default for new joiners — never host. */
export const DEFAULT_JOIN_ROLE = {
  listener: "listener",
  dj: "dj",
} as const;

export type DefaultJoinRole = (typeof DEFAULT_JOIN_ROLE)[keyof typeof DEFAULT_JOIN_ROLE];

export const ROOM_PLAY_EVENT_TYPES = {
  started: "room_play_started",
  completed: "room_play_completed",
} as const;

export type RoomPlayEventType = (typeof ROOM_PLAY_EVENT_TYPES)[keyof typeof ROOM_PLAY_EVENT_TYPES];

export const RATE_LIMIT_WINDOW_MS = 60_000;
