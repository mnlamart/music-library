/**
 * Suspicious duration thresholds are in seconds. Track.duration is stored in
 * seconds (formatDuration treats 185 as about 3:05).
 */
import { afterEach, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { percentOfTracksAffected } from "./database-quality.ts";
import { countTracksWithMetadataIssues, getMetadataIssues } from "./database-quality.server.ts";

const createdTrackIds: string[] = [];
const createdArtistIds: string[] = [];
const createdServiceIds: string[] = [];

afterEach(async () => {
  if (createdTrackIds.length > 0) {
    await prisma.track.deleteMany({ where: { id: { in: createdTrackIds } } });
    createdTrackIds.length = 0;
  }
  if (createdArtistIds.length > 0) {
    await prisma.artist.deleteMany({ where: { id: { in: createdArtistIds } } });
    createdArtistIds.length = 0;
  }
  if (createdServiceIds.length > 0) {
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    createdServiceIds.length = 0;
  }
});

test("getMetadataIssues counts durations under 5 seconds or over 2 hours, not millisecond cutoffs", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const artist = await prisma.artist.create({
    data: {
      name: `Duration Artist ${suffix}`,
      normalizedName: `duration-artist-${suffix}`,
    },
  });
  createdArtistIds.push(artist.id);
  const service = await prisma.service.create({
    data: {
      name: `duration-service-${suffix}`,
      displayName: `Duration Service ${suffix}`,
      baseUrl: "https://example.com",
    },
  });
  createdServiceIds.push(service.id);

  // 185s is a normal song (~3:05). 4999s is 1h 23m, which the millisecond
  // cutoff (duration < 5000) incorrectly treats as suspicious.
  const fixtures = [
    { title: "Lovestory", duration: 185, suspicious: false },
    { title: "Inanimee", duration: 168, suspicious: false },
    { title: "Exactly five seconds", duration: 5, suspicious: false },
    { title: "Exactly two hours", duration: 7200, suspicious: false },
    { title: "Under mistaken millisecond cutoff", duration: 4999, suspicious: false },
    { title: "Three seconds", duration: 3, suspicious: true },
    { title: "Just over two hours", duration: 7201, suspicious: true },
  ];

  const before = await getMetadataIssues();

  const tracks = await Promise.all(
    fixtures.map((fixture, index) =>
      prisma.track.create({
        data: {
          title: `${fixture.title} ${suffix}`,
          artistId: artist.id,
          serviceId: service.id,
          externalId: `duration-${suffix}-${index}`,
          duration: fixture.duration,
        },
      }),
    ),
  );
  createdTrackIds.push(...tracks.map((track) => track.id));

  const after = await getMetadataIssues();
  const expectedAdded = fixtures.filter((fixture) => fixture.suspicious).length;

  expect(
    after.suspiciousDurations - before.suspiciousDurations,
    "only tracks shorter than 5 seconds or longer than 7200 seconds should be added",
  ).toBe(expectedAdded);
});

test("affected track count is a distinct union and excludes artists without genre", async () => {
  const affectedBefore = await countTracksWithMetadataIssues();
  const issuesBefore = await getMetadataIssues();
  const totalTracksBefore = await prisma.track.count();

  const uniqueId = `meta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const service = await prisma.service.create({
    data: {
      name: `meta-service-${uniqueId}`,
      displayName: `Meta Service ${uniqueId}`,
      baseUrl: "https://example.com",
    },
  });
  const artist = await prisma.artist.create({
    data: {
      name: `No Genre ${uniqueId}`,
      normalizedName: `no-genre-${uniqueId}`,
      genre: null,
    },
  });
  const cover = await prisma.coverImage.create({
    data: {
      contentHash: `cover-${uniqueId}`,
      objectKey: `covers/${uniqueId}.jpg`,
      format: "jpeg",
    },
  });

  await prisma.track.create({
    data: {
      title: `Clean ${uniqueId}`,
      artistId: artist.id,
      serviceId: service.id,
      externalId: `clean-${uniqueId}`,
      duration: 180,
      year: 2020,
      coverImageId: cover.id,
    },
  });

  const affectedAfterClean = await countTracksWithMetadataIssues();
  const issuesAfterClean = await getMetadataIssues();
  expect(affectedAfterClean).toBe(affectedBefore);
  expect(issuesAfterClean.artistsWithoutGenre).toBe(issuesBefore.artistsWithoutGenre + 1);

  await prisma.track.create({
    data: {
      title: `Overlap ${uniqueId}`,
      artistId: artist.id,
      serviceId: service.id,
      externalId: `overlap-${uniqueId}`,
      // Shorter than 5 seconds, and missing cover and year.
      duration: 3,
      year: null,
      coverImageId: null,
    },
  });

  const affectedAfterOverlap = await countTracksWithMetadataIssues();
  const issuesAfterOverlap = await getMetadataIssues();
  const totalTracks = await prisma.track.count();

  expect(totalTracks).toBe(totalTracksBefore + 2);
  expect(affectedAfterOverlap).toBe(affectedBefore + 1);
  expect(issuesAfterOverlap.suspiciousDurations).toBe(issuesBefore.suspiciousDurations + 1);
  expect(issuesAfterOverlap.missingEssentials).toBe(issuesBefore.missingEssentials + 1);
  expect(issuesAfterOverlap.artistsWithoutGenre).toBe(issuesBefore.artistsWithoutGenre + 1);

  const bucketSum =
    issuesAfterOverlap.placeholderTitles +
    issuesAfterOverlap.suspiciousDurations +
    issuesAfterOverlap.missingEssentials +
    issuesAfterOverlap.invalidYears +
    issuesAfterOverlap.artistsWithoutGenre;
  const percent = percentOfTracksAffected(affectedAfterOverlap, totalTracks);

  expect(bucketSum).toBeGreaterThan(affectedAfterOverlap);
  expect(percent).toBeGreaterThanOrEqual(0);
  expect(percent).toBeLessThanOrEqual(100);
  expect(percent).toBeCloseTo((affectedAfterOverlap / totalTracks) * 100);
});
