import { randomBytes } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { prisma } from "#app/utils/db.server.ts";
import {
  findExactAlbumDuplicates,
  findExactArtistDuplicates,
} from "./duplicate-detection.server.ts";

const artistIds: string[] = [];

afterEach(async () => {
  if (artistIds.length === 0) return;
  await prisma.album.deleteMany({ where: { artistId: { in: artistIds } } });
  await prisma.artist.updateMany({
    where: { id: { in: artistIds } },
    data: { mergedIntoId: null },
  });
  await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
  artistIds.length = 0;
});

test("exact duplicate detection ignores artists and albums that were already merged", async () => {
  const token = randomBytes(4).toString("hex");
  const kept = await prisma.artist.create({
    data: { name: `Mergecheck ${token}`, normalizedName: `mergecheck ${token}` },
  });
  const merged = await prisma.artist.create({
    data: {
      name: `The Mergecheck ${token}`,
      normalizedName: `mergecheck ${token}`,
      mergedIntoId: kept.id,
    },
  });
  const host = await prisma.artist.create({
    data: { name: `Album Host ${token}`, normalizedName: `album host ${token}` },
  });
  artistIds.push(kept.id, merged.id, host.id);

  const keptAlbum = await prisma.album.create({
    data: { name: `Merge Album ${token}`, artistId: host.id },
  });
  await prisma.album.create({
    data: {
      name: `Merge Album ${token}!`,
      artistId: host.id,
      mergedIntoId: keptAlbum.id,
    },
  });

  const artists = await findExactArtistDuplicates();
  const albums = await findExactAlbumDuplicates();

  expect(artists.some((group) => group.normalizedName === `mergecheck ${token}`)).toBe(false);
  expect(albums.some((group) => group.normalizedName === `merge album ${token}`)).toBe(false);
});
