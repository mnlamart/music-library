import { describe, expect, test } from "vitest";
import { parsePlaylistTrackSort, sortPlaylistTracks } from "./playlist-track-sort.ts";

const tracks = [
  {
    id: "pt-1",
    position: 1,
    createdAt: "2024-01-02T00:00:00.000Z",
    track: { title: "Zebra", artist: { name: "Beta" }, duration: 200 },
  },
  {
    id: "pt-2",
    position: 0,
    createdAt: "2024-01-03T00:00:00.000Z",
    track: { title: "Apple", artist: { name: "Alpha" }, duration: 100 },
  },
  {
    id: "pt-3",
    position: 2,
    createdAt: "2024-01-01T00:00:00.000Z",
    track: { title: "Mango", artist: { name: "Gamma" }, duration: null },
  },
];

describe("parsePlaylistTrackSort", () => {
  test("defaults to custom for unknown values", () => {
    expect(parsePlaylistTrackSort(null)).toBe("custom");
    expect(parsePlaylistTrackSort("nope")).toBe("custom");
  });

  test("accepts known sort options", () => {
    expect(parsePlaylistTrackSort("title")).toBe("title");
    expect(parsePlaylistTrackSort("dateAdded")).toBe("dateAdded");
  });
});

describe("sortPlaylistTracks", () => {
  test("sorts by playlist position for custom", () => {
    expect(sortPlaylistTracks(tracks, "custom").map((t) => t.id)).toEqual(["pt-2", "pt-1", "pt-3"]);
  });

  test("sorts by title", () => {
    expect(sortPlaylistTracks(tracks, "title").map((t) => t.id)).toEqual(["pt-2", "pt-3", "pt-1"]);
  });

  test("sorts by artist", () => {
    expect(sortPlaylistTracks(tracks, "artist").map((t) => t.id)).toEqual(["pt-2", "pt-1", "pt-3"]);
  });

  test("sorts by duration with nulls last", () => {
    expect(sortPlaylistTracks(tracks, "duration").map((t) => t.id)).toEqual([
      "pt-2",
      "pt-1",
      "pt-3",
    ]);
  });

  test("sorts by date added newest first", () => {
    expect(sortPlaylistTracks(tracks, "dateAdded").map((t) => t.id)).toEqual([
      "pt-2",
      "pt-1",
      "pt-3",
    ]);
  });
});
