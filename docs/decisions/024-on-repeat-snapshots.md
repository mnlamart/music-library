# ADR-024: On-Repeat Snapshots

## Status

Accepted (product decisions from `/grill-with-docs`; implementation not started)

**Date:** 2026-09-21

## Context

`UsageEvent` already records `play_started` and `play_completed` (with `playId` correlation; ADR-016 / ADR-017). `/history` lists per-play rows. The product wants a durable “what I actually finished lately” artifact — not only a live aggregation — that users can revisit and optionally copy into a normal playlist.

Related shortlist (not decided here): listening-hub **Recently played** strip, **Heavy rotation**, **Weekly wrap**, personal play-boost in search/browse.

## Decision

### Ranking signal

- Include only **`play_completed`** events. Do **not** count `play_started` (skips would inflate the list).
- Window: rolling **30 days** ending at snapshot generation time (`createdAt >= now - 30d`).
- Rank tracks by completed-play count descending; take the top **30**. Tie-break (e.g. most recent `play_completed`, then `trackId`) is an implementation detail and may be fixed in the PRD/impl ADR addendum.

### Persistence model — dated snapshots

- Each generation produces a new **On-Repeat Snapshot** frozen at that moment (track set + per-track counts for that window). Later plays do not rewrite older snapshots.
- Rejected: a single replace-in-place “smart playlist” (loses history the user asked to keep).

### UI

- **Snapshot Shelf** — show the **latest 3** snapshots, plus a control to a page listing **all** snapshots for the user.
- Snapshot detail is **read-only** (no reorder, remove, rename-as-user-playlist, or manual add/remove of members).
- Each track row shows the **number of completed listens** in that snapshot’s window.
- **Promote Snapshot** — primary mutation affordance: add **all** snapshot tracks to a **new or existing UserPlaylist** (reuse existing add-to-playlist / create-playlist flows where practical). The snapshot itself is unchanged.

### Separation from UserPlaylist

- On-Repeat Snapshots are **not** editable **UserPlaylist**s. Mixing them into the normal `/playlists` editable list would fight read-only rules and per-user title uniqueness. Prefer a dedicated model (or clearly flagged system entity) owned by the user; exact schema is left to implementation, as long as Promote copies into a real **UserPlaylist**.

## Non-goals (this ADR)

- Generation cadence (daily cron vs weekly vs on-demand / first visit) — still open.
- Retention/pruning of old snapshots beyond “keep history + shelf of 3”.
- Using `play_started`, windows other than 30 days, or caps other than 30.
- Recently played strip, Heavy rotation, Weekly wrap, or search ranking boosts (sibling ideas).
- Mid-track resume or changing ADR-017 history semantics.

## Consequences

- New glossary terms: **On-Repeat Snapshot**, **Snapshot Shelf**, **Promote Snapshot** (`docs/CONTEXT.md`).
- Needs a generation job or request-time builder, storage for snapshot header + ranked members with counts, shelf + history + detail routes, and Promote actions wired to **UserPlaylist** helpers.
- Empty/partial windows (fewer than 30 qualifying tracks) should still produce a snapshot with whatever qualifies (or skip generation — open).
