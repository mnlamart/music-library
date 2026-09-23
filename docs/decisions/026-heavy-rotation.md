# ADR-026: Heavy Rotation (Live This Month)

## Status

Accepted (product decisions from `/grill-with-docs`; implementation not started)

**Date:** 2026-09-23

## Context

**On-Repeat Snapshot** (ADR-024) freezes last month’s top completes on the 1st. Users also need a **live** view of what they are finishing **this month so far** — without waiting for month-end or creating another frozen playlist. ADR-017 already noted “most played” as a separate feature from per-play history.

## Decision

### Signal and window

- Source: **`play_completed`** only (same “real listen” signal as ADR-024 / ADR-025).
- Window: **current UTC calendar month** (“this month so far”), not rolling and not lifetime.
- Distinct tracks ranked by completed-play count descending; cap **50**.
- Recomputed on read — **not** persisted as a snapshot.

### Relationship to On-Repeat Snapshot

- **Heavy Rotation** = live current month.
- **On-Repeat Snapshot** = frozen previous month (generated on the 1st).
- They complement; Heavy Rotation is not a second snapshot series.

### Surfaces

1. **Listening-hub strip** on `/` — show when there is ≥1 qualifying track this month; **hide if empty**.
2. **Personal Library sort** on `/library` — a sort option that reorders the library track list by this month’s `play_completed` counts (same signal). Tracks with zero completes this month sort after those with counts (exact tie-break left to implementation).

Home strip placement relative to **Recently Played Strip** / Snapshot Shelf is an implementation/layout detail; both strips may coexist.

## Non-goals

- Persisting Heavy Rotation as dated snapshots.
- Lifetime or rolling-window rankings.
- Changing `/history` semantics.
- Weekly wrap or search play-boost (sibling ideas).

## Consequences

- Glossary: **Heavy Rotation** (`docs/CONTEXT.md` decision #63).
- Shared query helper for “this month `play_completed` counts by trackId” usable by home loader and library sort.
- Library UI needs a new sort value wired through the existing `/library` list controls.
