# Party Room (client)

Logged-in UX + speaker player integration for [ADR-030](../../../docs/decisions/030-party-room.md).

## Ownership

This package owns:

- Thin HTTP/SSE **client** helpers (`api.client.ts`)
- Capability / code helpers (ADR matrix)
- `PartyRoomProvider` (current room, heartbeat, live updates)
- Personal `PlayerState` suspend/restore while this device is the room speaker
- Room play-event reporting (`room_play_*` — **not** personal `UsageEvent`)

Server routes and Prisma models are owned by issues **#286–#288**. Rebase onto the backend PR once it merges.

## Expected API contract

| Method           | Path                                | Purpose                                     |
| ---------------- | ----------------------------------- | ------------------------------------------- |
| `POST`           | `/api/rooms`                        | Create room                                 |
| `GET`            | `/api/rooms/current`                | Current open room for user (`204` if none)  |
| `POST`           | `/api/rooms/join`                   | Join by `{ code }` (smart join)             |
| `GET`            | `/api/rooms/:roomId`                | Snapshot                                    |
| `POST`           | `/api/rooms/:roomId/leave`          | Leave                                       |
| `POST`           | `/api/rooms/:roomId/end`            | Host end                                    |
| `POST`           | `/api/rooms/:roomId/heartbeat`      | Host heartbeat (~2–3s)                      |
| `POST`           | `/api/rooms/:roomId/become-host`    | Takeover after 10s grace                    |
| `POST`           | `/api/rooms/:roomId/reclaim-host`   | Original host reclaim                       |
| `PATCH`          | `/api/rooms/:roomId`                | Settings (`defaultJoinRole`)                |
| `POST`           | `/api/rooms/:roomId/queue`          | Add track                                   |
| `POST`           | `/api/rooms/:roomId/queue/playlist` | Host bulk add playlist                      |
| `PATCH`/`DELETE` | `/api/rooms/:roomId/queue/:itemId`  | Reorder / remove                            |
| `POST`           | `/api/rooms/:roomId/transport`      | play / pause / skip / jump                  |
| `GET`            | `/api/rooms/:roomId/events`         | SSE (`roomVersion` + snapshot)              |
| `POST`           | `/api/rooms/:roomId/play-event`     | `room_play_started` / `room_play_completed` |
| `GET`            | `/resources/rooms/audio/:trackId`   | Speaker audio grant                         |

Snapshot shape: see `types.ts` (`RoomSnapshot`).

## UI surfaces

- `/rooms` — create / join / current room (code, copy link, QR when provided)
- `/rooms/:code` — smart join via URL
- Home **Got a code?**
- Header **in-room chip**
- Track `…` → **Add to room queue** (Host/DJ)
- Host: full transport via room queue panel + global player
- Non-host: read-only now-playing bar → room
- **Become host** / **Reclaim host**
