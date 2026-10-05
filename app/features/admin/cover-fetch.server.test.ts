import { afterEach, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { countTracksWithoutCovers, getTracksWithoutCovers } from "./cover-fetch.server.ts";

const createdTrackIds: string[] = [];
const createdArtistIds: string[] = [];
const createdPlaylistIds: string[] = [];
const createdUserIds: string[] = [];
const createdCoverIds: string[] = [];

afterEach(async () => {
  if (createdPlaylistIds.length > 0) {
    await prisma.servicePlaylist.deleteMany({ where: { id: { in: createdPlaylistIds } } });
    createdPlaylistIds.length = 0;
  }
  if (createdTrackIds.length > 0) {
    await prisma.track.deleteMany({ where: { id: { in: createdTrackIds } } });
    createdTrackIds.length = 0;
  }
  if (createdCoverIds.length > 0) {
    await prisma.coverImage.deleteMany({ where: { id: { in: createdCoverIds } } });
    createdCoverIds.length = 0;
  }
  if (createdArtistIds.length > 0) {
    await prisma.artist.deleteMany({ where: { id: { in: createdArtistIds } } });
    createdArtistIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

test("lists and counts coverless tracks that have no playlist thumbnail", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const service = await prisma.service.upsert({
    where: { name: "local" },
    update: {},
    create: { name: "local", displayName: "Local Upload", baseUrl: "", isActive: true },
  });
  const owner = await prisma.user.create({
    data: {
      email: `covers-${suffix}@example.com`,
      username: `covers${suffix}`.slice(0, 20),
    },
  });
  createdUserIds.push(owner.id);
  const artist = await prisma.artist.create({
    data: {
      name: `Coverless Artist ${suffix}`,
      normalizedName: `coverless artist ${suffix}`,
    },
  });
  createdArtistIds.push(artist.id);
  const playlist = await prisma.servicePlaylist.create({
    data: {
      serviceId: service.id,
      externalId: `pl-${suffix}`,
      title: `Playlist ${suffix}`,
      itemCount: 2,
      ownerId: owner.id,
    },
  });
  createdPlaylistIds.push(playlist.id);

  const noPlaylistTrack = await prisma.track.create({
    data: {
      title: `No playlist ${suffix}`,
      externalId: `no-pl-${suffix}`,
      artistId: artist.id,
      serviceId: service.id,
    },
  });
  const nullThumbnailTrack = await prisma.track.create({
    data: {
      title: `Null thumbnail ${suffix}`,
      externalId: `null-thumb-${suffix}`,
      artistId: artist.id,
      serviceId: service.id,
      servicePlaylistTracks: {
        create: { playlistId: playlist.id, position: 0, thumbnailUrl: null },
      },
    },
  });
  const thumbnailUrl = `https://example.com/covers/${suffix}.jpg`;
  const thumbnailTrack = await prisma.track.create({
    data: {
      title: `Has thumbnail ${suffix}`,
      externalId: `thumb-${suffix}`,
      artistId: artist.id,
      serviceId: service.id,
      servicePlaylistTracks: {
        create: { playlistId: playlist.id, position: 1, thumbnailUrl },
      },
    },
  });
  const cover = await prisma.coverImage.create({
    data: {
      contentHash: `hash-${suffix}`,
      objectKey: `covers/${suffix}.jpg`,
    },
  });
  createdCoverIds.push(cover.id);
  const coveredTrack = await prisma.track.create({
    data: {
      title: `Has cover ${suffix}`,
      externalId: `covered-${suffix}`,
      artistId: artist.id,
      serviceId: service.id,
      coverImageId: cover.id,
    },
  });
  createdTrackIds.push(
    noPlaylistTrack.id,
    nullThumbnailTrack.id,
    thumbnailTrack.id,
    coveredTrack.id,
  );

  const coverlessCount = await prisma.track.count({ where: { coverImageId: null } });
  const listed = await getTracksWithoutCovers({ limit: coverlessCount });
  const listedById = new Map(listed.map((track) => [track.id, track]));

  expect(await countTracksWithoutCovers()).toBe(coverlessCount);
  expect(listed).toHaveLength(coverlessCount);
  expect(listedById.has(noPlaylistTrack.id)).toBe(true);
  expect(listedById.has(nullThumbnailTrack.id)).toBe(true);
  expect(listedById.has(coveredTrack.id)).toBe(false);
  expect(listedById.get(noPlaylistTrack.id)?.thumbnailUrl).toBeNull();
  expect(listedById.get(nullThumbnailTrack.id)?.thumbnailUrl).toBeNull();
  expect(listedById.get(thumbnailTrack.id)?.thumbnailUrl).toBe(thumbnailUrl);
});
