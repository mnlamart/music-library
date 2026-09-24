import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ExtractedAudioMetadata } from "#app/utils/audio-metadata.server";

const mockUploadFile = vi.fn();
const mockBuildAudioObjectKey = vi.fn();

vi.mock("#app/utils/storage.server", () => ({
  uploadFile: mockUploadFile,
  buildAudioObjectKey: mockBuildAudioObjectKey,
}));

const mockCalculateAudioHash = vi.fn();
vi.mock("#app/utils/audio-file-management.server", () => ({
  calculateAudioHash: mockCalculateAudioHash,
}));

const mockBackfillTrackMetadata = vi.fn();
vi.mock("./backfill-track-metadata.server.ts", () => ({
  backfillTrackMetadata: mockBackfillTrackMetadata,
}));

const mockPrisma = {
  trackAudioFile: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("#app/utils/db.server.ts", () => ({
  prisma: mockPrisma,
}));

const sampleMetadata: ExtractedAudioMetadata = {
  format: "mp3",
  mimeType: "audio/mpeg",
  bitrate: 320,
  sampleRate: 44100,
  duration: 180,
  title: "Test Track",
  artist: "Test Artist",
};

const sampleBuffer = Buffer.from("fake-audio-bytes");

describe("persistTrackAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildAudioObjectKey.mockImplementation(
      (serviceName: string, trackId: string, extension: string) =>
        `audio/tracks/${serviceName}/${trackId}.${extension}`,
    );
    mockCalculateAudioHash.mockResolvedValue("abc123hash");
    mockUploadFile.mockResolvedValue("audio/tracks/youtube/track-1.mp3");
    mockPrisma.trackAudioFile.findFirst.mockResolvedValue(null);
    mockPrisma.trackAudioFile.create.mockResolvedValue({
      id: "audio-file-1",
      trackId: "track-1",
      objectKey: "audio/tracks/youtube/track-1.mp3",
    });
    mockBackfillTrackMetadata.mockResolvedValue(undefined);
  });

  it("uploads to storage before creating TrackAudioFile", async () => {
    const callOrder: string[] = [];
    mockUploadFile.mockImplementation(async () => {
      callOrder.push("upload");
      return "audio/tracks/youtube/track-1.mp3";
    });
    mockPrisma.trackAudioFile.create.mockImplementation(async () => {
      callOrder.push("create");
      return { id: "audio-file-1" };
    });

    const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
    await persistTrackAudio({
      trackId: "track-1",
      serviceName: "youtube",
      buffer: sampleBuffer,
      metadata: sampleMetadata,
    });

    expect(callOrder).toEqual(["upload", "create"]);
    expect(mockBuildAudioObjectKey).toHaveBeenCalledWith("youtube", "track-1", "mp3");
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        file: sampleBuffer,
        key: "audio/tracks/youtube/track-1.mp3",
        contentType: "audio/mpeg",
      }),
    );
  });

  it("creates TrackAudioFile via prisma when no transaction is provided", async () => {
    const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
    const result = await persistTrackAudio({
      trackId: "track-1",
      serviceName: "youtube",
      buffer: sampleBuffer,
      metadata: sampleMetadata,
    });

    expect(mockPrisma.trackAudioFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackId: "track-1",
          objectKey: "audio/tracks/youtube/track-1.mp3",
          format: "mp3",
          mimeType: "audio/mpeg",
          fileSize: sampleBuffer.length,
          bitrate: 320,
          sampleRate: 44100,
        }),
      }),
    );
    expect(result.audioFile.id).toBe("audio-file-1");
    expect(result.objectKey).toBe("audio/tracks/youtube/track-1.mp3");
  });

  it("uses the transaction client when tx is provided", async () => {
    const txTrackAudioFile = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "tx-audio-file" }),
    };
    const tx = { trackAudioFile: txTrackAudioFile };

    const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
    await persistTrackAudio({
      trackId: "track-local",
      serviceName: "local",
      buffer: sampleBuffer,
      metadata: sampleMetadata,
      uploadedBy: "user-1",
      serviceId: "service-local",
      fileName: "song.mp3",
      tx: tx as never,
    });

    expect(txTrackAudioFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackId: "track-local",
          serviceId: "service-local",
          uploadedBy: "user-1",
          fileName: "song.mp3",
        }),
      }),
    );
    expect(mockPrisma.trackAudioFile.create).not.toHaveBeenCalled();
    expect(mockBackfillTrackMetadata).not.toHaveBeenCalled();
  });

  it("is idempotent when a TrackAudioFile already exists", async () => {
    const existing = {
      id: "existing-audio",
      trackId: "track-1",
      objectKey: "audio/tracks/youtube/track-1.mp3",
    };
    mockPrisma.trackAudioFile.findFirst.mockResolvedValue(existing);

    const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
    const result = await persistTrackAudio({
      trackId: "track-1",
      serviceName: "youtube",
      buffer: sampleBuffer,
      metadata: sampleMetadata,
    });

    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockPrisma.trackAudioFile.create).not.toHaveBeenCalled();
    expect(result.audioFile).toEqual(existing);
    expect(result.objectKey).toBe(existing.objectKey);
  });

  it("does not throw when metadata backfill fails", async () => {
    const { consoleError } = await import("#tests/setup/setup-test-env.ts");
    consoleError.mockImplementation(() => {});
    mockBackfillTrackMetadata.mockRejectedValue(new Error("backfill failed"));

    const { persistTrackAudio } = await import("./persist-track-audio.server.ts");

    await expect(
      persistTrackAudio({
        trackId: "track-1",
        serviceName: "youtube",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
      }),
    ).resolves.toBeDefined();

    expect(mockPrisma.trackAudioFile.create).toHaveBeenCalled();
  });

  it("backfills track metadata after a successful persist", async () => {
    const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
    await persistTrackAudio({
      trackId: "track-1",
      serviceName: "youtube",
      buffer: sampleBuffer,
      metadata: sampleMetadata,
    });

    expect(mockBackfillTrackMetadata).toHaveBeenCalledWith("track-1", sampleMetadata);
  });

  describe("duplicate detection", () => {
    it("calculates content hash for all uploads", async () => {
      const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
      await persistTrackAudio({
        trackId: "track-1",
        serviceName: "local",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
      });

      expect(mockCalculateAudioHash).toHaveBeenCalledWith(sampleBuffer);
    });

    it("includes contentHash in created TrackAudioFile", async () => {
      mockCalculateAudioHash.mockResolvedValue("test-hash-123");

      const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
      await persistTrackAudio({
        trackId: "track-1",
        serviceName: "local",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
      });

      expect(mockPrisma.trackAudioFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentHash: "test-hash-123",
          }),
        }),
      );
    });

    it("detects duplicate audio by content hash", async () => {
      const { consoleWarn } = await import("#tests/setup/setup-test-env.ts");
      consoleWarn.mockImplementation(() => {});

      const duplicateHash = "duplicate-hash-456";
      mockCalculateAudioHash.mockResolvedValue(duplicateHash);

      // First call returns nothing (no existing by trackId)
      // Second call returns existing audio with same hash
      mockPrisma.trackAudioFile.findFirst
        .mockResolvedValueOnce(null) // No existing by trackId
        .mockResolvedValueOnce({
          // Existing by contentHash
          id: "existing-audio-id",
          trackId: "existing-track-id",
          objectKey: "audio/tracks/local/existing-track-id.mp3",
          track: {
            id: "existing-track-id",
            title: "Existing Song",
            artist: {
              name: "Existing Artist",
            },
          },
        });

      const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
      const result = await persistTrackAudio({
        trackId: "new-track-id",
        serviceName: "local",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
      });

      // Should check for existing by trackId first
      expect(mockPrisma.trackAudioFile.findFirst).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            trackId: "new-track-id",
          }),
        }),
      );

      // Should check for existing by contentHash
      expect(mockPrisma.trackAudioFile.findFirst).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            contentHash: duplicateHash,
          },
        }),
      );

      // Should mark as duplicate
      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateTrack).toEqual({
        id: "existing-track-id",
        title: "Existing Song",
        artist: {
          name: "Existing Artist",
        },
      });
    });

    it("reuses S3 object key when duplicate detected", async () => {
      const { consoleWarn } = await import("#tests/setup/setup-test-env.ts");
      consoleWarn.mockImplementation(() => {});

      const duplicateHash = "duplicate-hash-789";
      const existingObjectKey = "audio/tracks/local/existing.mp3";
      mockCalculateAudioHash.mockResolvedValue(duplicateHash);

      mockPrisma.trackAudioFile.findFirst
        .mockResolvedValueOnce(null) // No existing by trackId
        .mockResolvedValueOnce({
          // Existing by contentHash
          id: "existing-audio-id",
          trackId: "existing-track-id",
          objectKey: existingObjectKey,
          track: {
            id: "existing-track-id",
            title: "Existing Song",
            artist: { name: "Existing Artist" },
          },
        });

      mockPrisma.trackAudioFile.create.mockResolvedValue({
        id: "new-audio-id",
        trackId: "new-track-id",
        objectKey: existingObjectKey, // Reused!
      });

      const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
      await persistTrackAudio({
        trackId: "new-track-id",
        serviceName: "local",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
      });

      // Should NOT upload to S3 (duplicate)
      expect(mockUploadFile).not.toHaveBeenCalled();

      // Should create TrackAudioFile with existing objectKey
      expect(mockPrisma.trackAudioFile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectKey: existingObjectKey,
            contentHash: duplicateHash,
          }),
        }),
      );
    });

    it("uploads to S3 when no duplicate detected", async () => {
      mockCalculateAudioHash.mockResolvedValue("unique-hash-999");
      mockPrisma.trackAudioFile.findFirst.mockResolvedValue(null); // No duplicates

      const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
      await persistTrackAudio({
        trackId: "track-1",
        serviceName: "local",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
      });

      // Should upload to S3 (unique content)
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          file: sampleBuffer,
        }),
      );
    });

    it("calls onProgress immediately for duplicates (no upload needed)", async () => {
      const { consoleWarn } = await import("#tests/setup/setup-test-env.ts");
      consoleWarn.mockImplementation(() => {});

      const onProgress = vi.fn();
      mockCalculateAudioHash.mockResolvedValue("duplicate-hash");

      mockPrisma.trackAudioFile.findFirst
        .mockResolvedValueOnce(null) // No existing by trackId
        .mockResolvedValueOnce({
          // Existing by contentHash
          id: "existing-audio-id",
          trackId: "existing-track-id",
          objectKey: "audio/tracks/local/existing.mp3",
          track: {
            id: "existing-track-id",
            title: "Existing Song",
            artist: { name: "Existing Artist" },
          },
        });

      mockPrisma.trackAudioFile.create.mockResolvedValue({
        id: "new-audio-id",
        trackId: "new-track-id",
        objectKey: "audio/tracks/local/existing.mp3",
      });

      const { persistTrackAudio } = await import("./persist-track-audio.server.ts");
      await persistTrackAudio({
        trackId: "new-track-id",
        serviceName: "local",
        buffer: sampleBuffer,
        metadata: sampleMetadata,
        onProgress,
      });

      // Should report 100% progress immediately (no upload)
      expect(onProgress).toHaveBeenCalledWith({
        loaded: sampleBuffer.length,
        total: sampleBuffer.length,
      });
      expect(mockUploadFile).not.toHaveBeenCalled();
    });
  });
});
