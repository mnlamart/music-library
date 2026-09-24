// @context7: Vitest
import { describe, it, expect } from "vitest";
import { calculateAudioHash } from "./audio-file-management.server";

describe("calculateAudioHash", () => {
  it("should calculate SHA-256 hash of audio buffer", async () => {
    const buffer = Buffer.from("test audio content");
    const hash = await calculateAudioHash(buffer);

    // SHA-256 hash should be 64 characters (hex)
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should return same hash for identical content", async () => {
    const buffer1 = Buffer.from("test audio content");
    const buffer2 = Buffer.from("test audio content");

    const hash1 = await calculateAudioHash(buffer1);
    const hash2 = await calculateAudioHash(buffer2);

    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different content", async () => {
    const buffer1 = Buffer.from("test audio content 1");
    const buffer2 = Buffer.from("test audio content 2");

    const hash1 = await calculateAudioHash(buffer1);
    const hash2 = await calculateAudioHash(buffer2);

    expect(hash1).not.toBe(hash2);
  });

  it("should handle empty buffer", async () => {
    const buffer = Buffer.from("");
    const hash = await calculateAudioHash(buffer);

    // Should still return valid SHA-256 hash
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should handle large buffers", async () => {
    // Simulate a 10MB file
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024, "a");
    const hash = await calculateAudioHash(largeBuffer);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
