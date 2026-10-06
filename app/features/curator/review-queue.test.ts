import { expect, test } from "vitest";
import { QUEUE_STATUS_MINE, entityPath, entityTypeLabel, queueMatter } from "./review-queue.ts";

test("matter is the report description", () => {
  expect(
    queueMatter({ issueType: "wrong_metadata", description: "  Artist is Miles, not Bill  " }),
  ).toBe("Artist is Miles, not Bill");
});

test("matter explains the issue type when the report has no description", () => {
  expect(queueMatter({ issueType: "missing_info", description: "   " })).toBe(
    "No extra detail was given. The report is marked as Missing info.",
  );
});

test("matter keeps an unknown issue type readable", () => {
  expect(queueMatter({ issueType: "import_error", description: null })).toBe(
    "No extra detail was given. The report is marked as import_error.",
  );
});

test("entity path uses the library, artist, or album page", () => {
  expect(entityPath("track", "track-1")).toBe("/library/track-1");
  expect(entityPath("artist", "artist-1")).toBe("/artists/artist-1");
  expect(entityPath("album", "album-1")).toBe("/albums/album-1");
  expect(entityPath("playlist", "playlist-1")).toBeNull();
});

test("entity type label is a name, not a raw id", () => {
  expect(entityTypeLabel("track")).toBe("Track");
  expect(entityTypeLabel("artist")).toBe("Artist");
  expect(entityTypeLabel("album")).toBe("Album");
  expect(QUEUE_STATUS_MINE).toBe("mine");
});
