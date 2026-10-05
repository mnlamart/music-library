import { expect, test } from "vitest";
import {
  addSuccessfulTrack,
  getUploadProgress,
  initUploadProgress,
  serializeSuccessfulTrack,
} from "./upload-progress.$uploadId.tsx";

test("successful track payload keeps the real storage saved byte count", () => {
  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  initUploadProgress(uploadId, ["song.mp3"]);
  addSuccessfulTrack(uploadId, {
    trackId: "track-1",
    fileName: "song.mp3",
    title: "Song",
    artist: "Artist",
    storageSavedBytes: 2 * 1024 * 1024,
    exactDuplicate: {
      trackId: "track-0",
      title: "Song",
      artist: "Artist",
      confidence: 100,
    },
  });

  const stored = getUploadProgress(uploadId)?.successfulTracks?.[0];
  expect(stored?.storageSavedBytes).toBe(2 * 1024 * 1024);

  const payload = serializeSuccessfulTrack(stored!);
  expect(payload.storageSavedBytes).toBe(2 * 1024 * 1024);
  const serialized = JSON.parse(JSON.stringify(payload)) as { storageSavedBytes?: number };
  expect(serialized.storageSavedBytes).toBe(2 * 1024 * 1024);
});

test("omits storage saved bytes from the payload when the size is unknown", () => {
  const track = serializeSuccessfulTrack({
    trackId: "track-1",
    fileName: "song.mp3",
    title: "Song",
    artist: "Artist",
  });

  expect(track.storageSavedBytes).toBeUndefined();
  expect(JSON.parse(JSON.stringify(track))).not.toHaveProperty("storageSavedBytes");
});
