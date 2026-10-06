import { describe, expect, test, vi, beforeEach } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { action, clientAction } from "./bulk-edit.tsx";

vi.mock("#app/utils/permissions.server.ts", () => ({
  requireCuratorRole: vi.fn(),
}));

vi.mock("#app/utils/db.server.ts", () => ({
  prisma: {
    track: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    artist: {
      findUnique: vi.fn(),
    },
    album: {
      findUnique: vi.fn(),
    },
    trackEdit: {
      create: vi.fn(),
    },
    genre: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

function makeRequest(body: any) {
  return {
    request: new Request("http://localhost/api/metadata/tracks/bulk-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: {},
  };
}

async function expectReturnedError(body: unknown, status: number, error: string) {
  const response = (await action(makeRequest(body) as never)) as {
    type: string;
    data: { error?: string; missingTrackIds?: string[] };
    init: { status?: number } | null;
  };
  expect(response.type).toBe("DataWithResponseInit");
  expect(response.init?.status).toBe(status);
  expect(response.data.error).toBe(error);
  return response;
}

describe("POST /api/metadata/tracks/bulk-edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCuratorRole).mockResolvedValue("user-1");
  });

  test("requires curator or admin role", async () => {
    vi.mocked(requireCuratorRole).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 }),
    );

    const body = {
      trackIds: ["track-1"],
      changes: { title: "New Title" },
      comment: "Test bulk edit",
    };

    await expect(action(makeRequest(body) as never)).rejects.toThrow();

    expect(requireCuratorRole).toHaveBeenCalled();
  });

  test("validates required fields", async () => {
    const response = await expectReturnedError(
      {
        trackIds: [],
        changes: {},
        comment: "",
      },
      400,
      "Validation failed",
    );
    expect(response.data).toHaveProperty("details");
  });

  test("requires at least one track ID", async () => {
    await expectReturnedError(
      {
        trackIds: [],
        changes: { title: "New Title" },
        comment: "Test",
      },
      400,
      "Validation failed",
    );
  });

  test("enforces maximum 500 tracks per request", async () => {
    await expectReturnedError(
      {
        trackIds: Array.from({ length: 501 }, (_, i) => `track-${i}`),
        changes: { title: "New Title" },
        comment: "Test",
      },
      400,
      "Validation failed",
    );
  });

  test("requires at least one field in changes", async () => {
    await expectReturnedError(
      {
        trackIds: ["track-1"],
        changes: {},
        comment: "Test",
      },
      400,
      "Validation failed",
    );
  });

  test("requires comment for bulk operations", async () => {
    await expectReturnedError(
      {
        trackIds: ["track-1"],
        changes: { title: "New Title" },
        comment: "",
      },
      400,
      "Validation failed",
    );
  });

  test("returns invalid JSON as a 400 payload", async () => {
    const response = (await action({
      request: new Request("http://localhost/api/metadata/tracks/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      params: {},
    } as never)) as {
      type: string;
      data: { error?: string };
      init: { status?: number } | null;
    };

    expect(response.type).toBe("DataWithResponseInit");
    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("Invalid JSON body");
  });

  test("validates all tracks exist before updating (all-or-nothing)", async () => {
    vi.mocked(prisma.track.findMany).mockResolvedValue([
      { id: "track-1", title: "Track 1", artistId: "artist-1" },
      { id: "track-2", title: "Track 2", artistId: "artist-1" },
    ] as never);

    const body = {
      trackIds: ["track-1", "track-2", "track-3"], // track-3 doesn't exist
      changes: { title: "New Title" },
      comment: "Test bulk edit",
    };

    const response = await expectReturnedError(body, 404, "Some tracks not found");
    expect(response.data.missingTrackIds).toEqual(["track-3"]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("validates artist exists when changing artistId", async () => {
    vi.mocked(prisma.track.findMany).mockResolvedValue([
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ] as never);
    vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

    const body = {
      trackIds: ["track-1"],
      changes: { artistId: "nonexistent-artist" },
      comment: "Test bulk edit",
    };

    await expectReturnedError(body, 404, "Artist not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("validates album exists when changing albumId", async () => {
    vi.mocked(prisma.track.findMany).mockResolvedValue([
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ] as never);
    vi.mocked(prisma.album.findUnique).mockResolvedValue(null);

    const body = {
      trackIds: ["track-1"],
      changes: { albumId: "nonexistent-album" },
      comment: "Test bulk edit",
    };

    await expectReturnedError(body, 404, "Album not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("allows setting albumId to null", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: "album-1",
        genre: null,
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: vi.fn().mockResolvedValue({}),
        },
        track: {
          update: vi.fn().mockResolvedValue({
            id: "track-1",
            title: "Track 1",
            artistId: "artist-1",
          }),
        },
      });
    });

    const body = {
      trackIds: ["track-1"],
      changes: { albumId: null },
      comment: "Remove album",
    };

    const response: any = await action(makeRequest(body) as never);

    expect(response.data.success).toBe(true);
    expect(response.data.updatedCount).toBe(1);
    expect(response.data.updated).toBe(1);
  });

  test("writes the selected album id onto every track", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        genres: [],
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
      {
        id: "track-2",
        title: "Track 2",
        artistId: "artist-1",
        albumId: "album-old",
        genre: null,
        genres: [],
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);
    vi.mocked(prisma.album.findUnique).mockResolvedValue({ id: "album-2" } as never);

    const mockTrackUpdate = vi
      .fn()
      .mockImplementation(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        title: where.id,
        artistId: "artist-1",
      }));

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: vi.fn().mockResolvedValue({}),
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const response: any = await action(
      makeRequest({
        trackIds: ["track-1", "track-2"],
        changes: { albumId: "album-2" },
        comment: "Assign album",
      }) as never,
    );

    expect(response.data.success).toBe(true);
    expect(response.data.updatedCount).toBe(2);
    expect(mockTrackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "track-1" },
        data: { albumId: "album-2" },
      }),
    );
    expect(mockTrackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "track-2" },
        data: { albumId: "album-2" },
      }),
    );
  });

  test("successfully updates multiple tracks in a transaction", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: "Rock",
        year: 2020,
        trackNumber: 1,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
      {
        id: "track-2",
        title: "Track 2",
        artistId: "artist-1",
        albumId: null,
        genre: "Rock",
        year: 2020,
        trackNumber: 2,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);
    vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: "artist-2" } as never);

    const mockTrackEditCreate = vi.fn().mockResolvedValue({});
    const mockTrackUpdate = vi.fn();
    mockTrackUpdate
      .mockResolvedValueOnce({ id: "track-1", title: "Track 1", artistId: "artist-2" })
      .mockResolvedValueOnce({ id: "track-2", title: "Track 2", artistId: "artist-2" });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: mockTrackEditCreate,
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const body = {
      trackIds: ["track-1", "track-2"],
      changes: { artistId: "artist-2", genre: "Pop" },
      comment: "Bulk update artist and genre",
    };

    const response: any = await action(makeRequest(body) as never);

    expect(response.data.success).toBe(true);
    expect(response.data.updatedCount).toBe(2);
    expect(mockTrackEditCreate).toHaveBeenCalledTimes(2);
    expect(mockTrackUpdate).toHaveBeenCalledTimes(2);
  });

  test("creates edit history entry for each track", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: "Rock",
        genres: [{ id: "genre-rock", name: "Rock" }],
        year: 2020,
        trackNumber: 1,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

    const mockTrackEditCreate = vi.fn().mockResolvedValue({});
    const mockTrackUpdate = vi.fn().mockResolvedValue({
      id: "track-1",
      title: "Updated Track",
      artistId: "artist-1",
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: mockTrackEditCreate,
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const body = {
      trackIds: ["track-1"],
      changes: { title: "Updated Track" },
      comment: "Fixing title",
    };

    await action(makeRequest(body) as never);

    expect(mockTrackEditCreate).toHaveBeenCalledWith({
      data: {
        trackId: "track-1",
        editedBy: "user-1",
        comment: "Fixing title",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: "Rock",
        genreIds: JSON.stringify(["genre-rock"]),
        year: 2020,
        trackNumber: 1,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    });
  });

  test("performance: handles 100+ tracks", async () => {
    const mockTracks = Array.from({ length: 150 }, (_, i) => ({
      id: `track-${i}`,
      title: `Track ${i}`,
      artistId: "artist-1",
      albumId: null,
      genre: "Rock",
      year: 2020,
      trackNumber: i + 1,
      albumArtist: null,
      bpm: null,
      label: null,
      isrc: null,
      releaseDate: null,
      originalDate: null,
      originalYear: null,
      totalTracks: null,
      totalDiscs: null,
      lyrics: null,
    }));

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

    const mockTrackEditCreate = vi.fn().mockResolvedValue({});
    const mockTrackUpdate = vi.fn().mockImplementation((args: any) => {
      return Promise.resolve({
        id: args.where.id,
        title: "Updated Title",
        artistId: "artist-1",
      });
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: mockTrackEditCreate,
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const body = {
      trackIds: mockTracks.map((t) => t.id),
      changes: { title: "Updated Title" },
      comment: "Bulk update 150 tracks",
    };

    const startTime = Date.now();
    const response: any = await action(makeRequest(body) as never);
    const endTime = Date.now();

    expect(response.data.success).toBe(true);
    expect(response.data.updatedCount).toBe(150);
    expect(mockTrackEditCreate).toHaveBeenCalledTimes(150);
    expect(mockTrackUpdate).toHaveBeenCalledTimes(150);

    // Performance assertion: should complete in reasonable time (adjust as needed)
    const duration = endTime - startTime;
    console.log(`Bulk edit of 150 tracks took ${duration}ms`);
    expect(duration).toBeLessThan(5000); // Should complete in less than 5 seconds
  });

  test("only updates fields that are provided in changes", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: "album-1",
        genre: "Rock",
        year: 2020,
        trackNumber: 1,
        albumArtist: "Various Artists",
        bpm: 120,
        label: "Label 1",
        isrc: "ISRC123",
        releaseDate: new Date("2020-01-01"),
        originalDate: null,
        originalYear: null,
        totalTracks: 10,
        totalDiscs: 1,
        lyrics: "Lyrics here",
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

    const mockTrackUpdate = vi.fn().mockResolvedValue({
      id: "track-1",
      title: "Track 1",
      artistId: "artist-1",
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: vi.fn().mockResolvedValue({}),
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const body = {
      trackIds: ["track-1"],
      changes: { genre: "Pop", year: 2021 }, // Only updating genre and year
      comment: "Update genre and year",
    };

    await action(makeRequest(body) as never);

    expect(mockTrackUpdate).toHaveBeenCalledWith({
      where: { id: "track-1" },
      data: {
        genre: "Pop",
        year: 2021,
      },
      select: {
        id: true,
        title: true,
        artistId: true,
      },
    });
  });

  test("handles date parsing correctly", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

    const mockTrackUpdate = vi.fn().mockResolvedValue({
      id: "track-1",
      title: "Track 1",
      artistId: "artist-1",
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: vi.fn().mockResolvedValue({}),
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const body = {
      trackIds: ["track-1"],
      changes: {
        releaseDate: "2020-06-15",
        originalDate: "2019-12-01",
      },
      comment: "Update dates",
    };

    await action(makeRequest(body) as never);

    const updateCall = mockTrackUpdate.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall?.data.releaseDate).toBeInstanceOf(Date);
    expect(updateCall?.data.originalDate).toBeInstanceOf(Date);
    expect(updateCall?.data.releaseDate.toISOString()).toContain("2020-06-15");
    expect(updateCall?.data.originalDate.toISOString()).toContain("2019-12-01");
  });

  test("handles setting date fields to null", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: new Date("2020-01-01"),
        originalDate: new Date("2019-01-01"),
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

    const mockTrackUpdate = vi.fn().mockResolvedValue({
      id: "track-1",
      title: "Track 1",
      artistId: "artist-1",
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: {
          create: vi.fn().mockResolvedValue({}),
        },
        track: {
          update: mockTrackUpdate,
        },
      });
    });

    const body = {
      trackIds: ["track-1"],
      changes: {
        releaseDate: null,
        originalDate: null,
      },
      comment: "Remove dates",
    };

    await action(makeRequest(body) as never);

    const updateCall = mockTrackUpdate.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall?.data.releaseDate).toBeNull();
    expect(updateCall?.data.originalDate).toBeNull();
  });

  test("sets genre ids on the track relation and syncs the legacy genre string", async () => {
    const mockTracks = [
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: "Rock",
        genres: [
          { id: "genre-pop", name: "Pop" },
          { id: "genre-rock", name: "Rock" },
        ],
        year: 2020,
        trackNumber: 1,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
      {
        id: "track-2",
        title: "Track 2",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        genres: [],
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ];

    vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);
    vi.mocked(prisma.genre.findMany).mockResolvedValue([
      { id: "genre-soul", name: "Soul" },
      { id: "genre-jazz", name: "Jazz" },
    ] as never);

    const mockTrackEditCreate = vi.fn().mockResolvedValue({});
    const mockTrackUpdate = vi.fn().mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve({
        id: args.where.id,
        title: "Track",
        artistId: "artist-1",
      }),
    );

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: { create: mockTrackEditCreate },
        track: { update: mockTrackUpdate },
      });
    });

    const response: any = await action(
      makeRequest({
        trackIds: ["track-1", "track-2"],
        changes: { genreIds: ["genre-jazz", "genre-soul"] },
        comment: "Retag selected tracks",
      }) as never,
    );

    expect(response.data.success).toBe(true);
    expect(response.data.updatedCount).toBe(2);
    expect(prisma.genre.findMany).toHaveBeenCalledTimes(1);

    expect(mockTrackUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "track-1" },
      data: {
        genre: "Jazz",
        genres: { set: [{ id: "genre-jazz" }, { id: "genre-soul" }] },
      },
      select: {
        id: true,
        title: true,
        artistId: true,
      },
    });
    expect(mockTrackUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "track-2" },
      data: {
        genre: "Jazz",
        genres: { set: [{ id: "genre-jazz" }, { id: "genre-soul" }] },
      },
      select: {
        id: true,
        title: true,
        artistId: true,
      },
    });

    expect(mockTrackEditCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          genre: "Rock",
          genreIds: JSON.stringify(["genre-rock", "genre-pop"]),
        }),
      }),
    );
    expect(mockTrackEditCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          genre: null,
          genreIds: JSON.stringify([]),
        }),
      }),
    );
  });

  test("clears genre tags when genreIds is an empty array", async () => {
    vi.mocked(prisma.track.findMany).mockResolvedValue([
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: "Rock",
        genres: [{ id: "genre-rock", name: "Rock" }],
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ] as never);

    const mockTrackUpdate = vi.fn().mockResolvedValue({
      id: "track-1",
      title: "Track 1",
      artistId: "artist-1",
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        trackEdit: { create: vi.fn().mockResolvedValue({}) },
        track: { update: mockTrackUpdate },
      });
    });

    await action(
      makeRequest({
        trackIds: ["track-1"],
        changes: { genreIds: [] },
        comment: "Clear genres",
      }) as never,
    );

    expect(prisma.genre.findMany).not.toHaveBeenCalled();
    expect(mockTrackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          genre: null,
          genres: { set: [] },
        },
      }),
    );
  });

  test("rejects unknown genre ids", async () => {
    vi.mocked(prisma.track.findMany).mockResolvedValue([
      {
        id: "track-1",
        title: "Track 1",
        artistId: "artist-1",
        albumId: null,
        genre: null,
        genres: [],
        year: null,
        trackNumber: null,
        albumArtist: null,
        bpm: null,
        label: null,
        isrc: null,
        releaseDate: null,
        originalDate: null,
        originalYear: null,
        totalTracks: null,
        totalDiscs: null,
        lyrics: null,
      },
    ] as never);
    vi.mocked(prisma.genre.findMany).mockResolvedValue([
      { id: "genre-jazz", name: "Jazz" },
    ] as never);

    await expectReturnedError(
      {
        trackIds: ["track-1"],
        changes: { genreIds: ["genre-jazz", "genre-missing"] },
        comment: "Retag",
      },
      404,
      "One or more genres not found",
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("clientAction for POST /api/metadata/tracks/bulk-edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCuratorRole).mockResolvedValue("user-1");
  });

  test("returns validation failures so the fetcher receives data.error", async () => {
    const result = await clientAction({
      ...makeRequest({
        trackIds: Array.from({ length: 501 }, (_, i) => `track-${i}`),
        changes: { title: "New Title" },
        comment: "Too many tracks",
      }),
      serverAction() {
        return action(
          makeRequest({
            trackIds: Array.from({ length: 501 }, (_, i) => `track-${i}`),
            changes: { title: "New Title" },
            comment: "Too many tracks",
          }) as never,
        );
      },
    } as never);

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 400 },
      data: { error: "Validation failed" },
    });
  });

  test("returns missing tracks so the fetcher receives data.error", async () => {
    vi.mocked(prisma.track.findMany).mockResolvedValue([] as never);

    const args = makeRequest({
      trackIds: ["track-missing"],
      changes: { title: "New Title" },
      comment: "Missing track",
    });
    const result = await clientAction({
      ...args,
      serverAction: () => action(args as never),
    } as never);

    expect(result).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 404 },
      data: { error: "Some tracks not found", missingTrackIds: ["track-missing"] },
    });
  });

  test("rethrows unexpected server failures", async () => {
    const failure = new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
    });

    await expect(
      clientAction({
        request: new Request("http://localhost/api/metadata/tracks/bulk-edit", {
          method: "POST",
        }),
        params: {},
        serverAction: () => Promise.reject(failure),
      } as never),
    ).rejects.toBe(failure);
  });
});
