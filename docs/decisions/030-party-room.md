# ADR-030: Party Room (shared live queue)

## Status

Accepted (product decisions from `/grill-with-docs`; implementation not started)

**Tracking:** [#284](https://github.com/mnlamart/music-library/issues/284)

**Date:** 2026-09-29

## Context

Playback today is per-user and client-owned: **Queue Spine** + **Up Next** in `AudioPlayerProvider`, with personal **PlayerState** restore (ADR-015 / ADR-017). Audio and hydration require a logged-in user with track access (library / user playlist / service playlist). There is no friend graph, no shared queue, and no player realtime channel (SSE exists only for upload progress; WebSockets were removed in ADR-004).

The product need is an **in-person party**: many people want to queue tracks on one sound system, with live updates, optional walk-up guests, and roles — not Spotify-style sample-accurate listen-together, and not a 10k-track personal library spine shared across phones.

## Decision

### Product shape

- **Party Room** — server-hosted session with a short code, join URL, and QR (URL-encoded).
- **One speaker device** in v1 (the current Host’s device). Path reserved for later **claim speaker**.
- **Flat room queue** (ordered track list + `currentIndex`) — **not** Queue Spine / Up Next. Scale: hundreds of tracks (cap **500**), not 10k+.
- Room starts **empty**. Host may **Add playlist to queue** (bulk append, Host-only). DJ/Host add individual tracks via search / track menus.
- Played rows stay in the list **above** the pointer (history); only **upcoming** rows are reorderable / removable-by-editors.

### Participants and roles

- **RoomParticipant** — seat in a room (linked `userId` **or** guest token + display name) + role. Do not call this “membership.”
- Roles: **Host**, **DJ**, **Listener**.
- Room setting **`defaultJoinRole`**: `listener` | `dj` (never `host`). Host chooses whether walk-ups enter as Listener or DJ.
- Capability matrix:

|                                            | Host | DJ  | Listener |
| ------------------------------------------ | ---- | --- | -------- |
| See queue + now playing                    | ✓    | ✓   | ✓        |
| Add tracks                                 | ✓    | ✓   | ✗        |
| Reorder / remove others’ upcoming rows     | ✓    | ✓   | ✗        |
| **Remove own** row (any role)              | ✓    | ✓   | ✓        |
| Skip / play-pause (transport)              | ✓    | ✗   | ✗        |
| Kick, change roles, end room, set defaults | ✓    | ✗   | ✗        |
| Speaker device (v1)                        | ✓    | ✗   | ✗        |

- Queue rows store **`addedByParticipantId`** so remove-own works after demotion.

### Join, codes, QR

- **6-character** code; charset aligned with auth OTP (`ABCDEFGHJKLMNPQRSTUVWXYZ123456789` — no `0`/`O`/`I`).
- URL embeds the same code (e.g. `/rooms/AB3K9Q`). Join accepts code or pasted URL.
- Host UI: large code, copy link, **QR of the full URL** (reuse existing `qrcode` dependency).
- **Smart join:** logged-in → participant linked to user; logged-out → **guest shell**. No forced guest mode for signed-in users.
- Codes unique among **open** rooms; invalidated when the room ends.

### Guests vs logged-in UX

- **Logged-in:** normal app. While in a room and allowed to add: track `…` menu includes **Add to room queue**. Nav: **`/rooms`**, home **“Got a code?”**, persistent in-room chip. At most **one** open room as participant; creator at most **one** active room.
- **Guests:** minified shell — **Room** tab + **Search** tab (artists / albums / tracks with **audio only**, full archived catalog). **Audition**: play one track at a time on their device to verify the song (not the room speaker).

### Catalog and audio grants

- Room search / add targets **any track that has an audio file** (archived catalog), not only the Host’s library.
- **Speaker grant:** Host speaker may resolve audio for tracks **on the room queue**.
- **Audition grant:** participant-gated, has-audio only, short-lived URL; one active audition per participant; ~**20** audition grants / participant / minute.
- Do not open unauthenticated raw `/resources/audio/:trackId` or ungated global search to strangers without a valid participant seat in an open room.

### Realtime and Host resilience

- Source of truth: **database** (room + queue + pointer + version). Mutations via HTTP; live updates via **SSE** room channel (same family as upload progress). Payloads carry a monotonic **`roomVersion`** for resync.
- Room does **not** die when the Host’s browser disconnects.
- Host **heartbeat** ~2–3s; after **10s** without Host heartbeat, another participant may explicitly **Become host** (prefer DJ). New Host’s device becomes the speaker and may resume from `currentIndex` at **0:00** (no mid-track sync — consistent with ADR-017).
- **Original host** identity is retained; they may **Reclaim host** and demote the replacement (speaker returns to them).

### Lifecycle and player UX

- Host **End room**, plus auto-close after ~**45 minutes** with zero connected participants.
- While a device is the room speaker: personal **PlayerState** is **suspended** (not overwritten). Leaving/ending restores personal queue.
- **Global player:** Host/speaker → room queue with full transport. Other logged-in participants → read-only now-playing bar linking to the room queue. Guests → equivalent in the guest shell.

### Play attribution

- Room speaker plays emit **room-scoped play events** only (e.g. `room_play_started` / `room_play_completed` with room + track + optional `addedByParticipantId`).
- They do **not** write personal `play_started` / `play_completed` **UsageEvent**s and must not inflate `/history`, Heavy Rotation, On-Repeat, Weekly Wrap, or Personal Play Boost.

### v1 limits (tunable constants)

| Limit                          | Value      |
| ------------------------------ | ---------- |
| Max queue tracks               | 500        |
| Max connected participants     | 50         |
| Active rooms per creator       | 1          |
| Guest display name             | 1–24 chars |
| Add-track rate / participant   | ~30/min    |
| Room search rate / participant | ~60/min    |
| Audition grants / participant  | ~20/min    |
| Empty-room TTL                 | ~45 min    |
| Host grace before takeover     | 10s        |

## Alternatives considered

- **Listen-together clock sync** — Rejected for v1; wrong problem for a single party speaker; fights autoplay and ADR-017.
- **Reuse personal Queue Spine + Up Next as the room model** — Rejected; party scale and mental model differ.
- **Host-library-only catalog** — Rejected; Host wants full archived catalog with audio for guest search/add.
- **WebSockets** — Rejected for v1; SSE matches an existing pattern; WS were removed once for complexity.
- **5-minute Host grace** — Rejected in favor of **10s** + explicit Become host (tight heartbeat).
- **Credit personal UsageEvents to Host or adder** — Rejected; room plays are room activity.

## Non-goals (v1)

- Multi-speaker / simultaneous claim-speaker (reserve capability; ship later).
- Sample-accurate sync across listener devices.
- Permanent reusable “house” codes across parties.
- Listener suggestions lane / approval queue.
- YouTube URL ingest during a party.
- Offline rooms (online-only).

## Consequences

- New domain module (suggested `app/features/party-room/`): Room, RoomParticipant, room queue rows, SSE fan-out, join/guest tokens, audition + speaker audio grants.
- Personal player and ADR-017 **PlayerState** remain the solo path; room mode is an overlay on the speaker device.
- Guest shell is a distinct route tree from the full app chrome.
- Upload SSE’s process-local connection map is acceptable on a single Fly machine; multi-node fan-out or version-polling fallback may be needed if the app scales out.
- Glossary: **Party Room** section in `docs/CONTEXT.md`; settled decision #66.

## References

- ADR-015 Queue Spine · ADR-017 PlayerState / no mid-track resume · ADR-004 WS removal · ADR-016 UsageEvent
- Epic: [#284](https://github.com/mnlamart/music-library/issues/284)
