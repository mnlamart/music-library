import { expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import { percentOfTracksAffected } from "./database-quality.ts";
import { countTracksWithMetadataIssues, getMetadataIssues } from "./database-quality.server.ts";

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
      duration: 180000,
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
      // Below the existing suspicious-duration cutoff, and missing cover and year.
      duration: 1000,
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
