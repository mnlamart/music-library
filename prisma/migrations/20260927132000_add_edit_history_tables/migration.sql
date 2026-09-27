-- Drop FTS triggers that reference Artist and Album tables
-- These will be recreated after table redefinition
DROP TRIGGER IF EXISTS albums_fts_ai;
DROP TRIGGER IF EXISTS albums_fts_au;
DROP TRIGGER IF EXISTS albums_fts_ad;
DROP TRIGGER IF EXISTS artists_fts_ai;
DROP TRIGGER IF EXISTS artists_fts_au;
DROP TRIGGER IF EXISTS artists_fts_ad;
DROP TRIGGER IF EXISTS artist_rename_fts_cascade;
DROP TRIGGER IF EXISTS tracks_fts_ai;
DROP TRIGGER IF EXISTS tracks_fts_au;
DROP TRIGGER IF EXISTS tracks_fts_ad;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Redefine Artist table with merge tracking fields
CREATE TABLE "new_Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "website" TEXT,
    "genre" TEXT,
    "country" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mergedIntoId" TEXT,
    "mergedAt" DATETIME,
    "mergedBy" TEXT,
    CONSTRAINT "Artist_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Artist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Artist" ("id", "name", "normalizedName", "bio", "imageUrl", "website", "genre", "country", "createdAt", "updatedAt") 
SELECT "id", "name", "normalizedName", "bio", "imageUrl", "website", "genre", "country", "createdAt", "updatedAt" FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";
CREATE UNIQUE INDEX "Artist_normalizedName_key" ON "Artist"("normalizedName");
CREATE INDEX "Artist_normalizedName_idx" ON "Artist"("normalizedName");
CREATE INDEX "Artist_name_idx" ON "Artist"("name");
CREATE INDEX "Artist_mergedIntoId_idx" ON "Artist"("mergedIntoId");

-- Redefine Album table with merge tracking fields
CREATE TABLE "new_Album" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "year" INTEGER,
    "coverImageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mergedIntoId" TEXT,
    "mergedAt" DATETIME,
    "mergedBy" TEXT,
    CONSTRAINT "Album_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Album_coverImageId_fkey" FOREIGN KEY ("coverImageId") REFERENCES "CoverImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Album_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Album" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Album" ("id", "name", "artistId", "year", "coverImageId", "createdAt", "updatedAt") 
SELECT "id", "name", "artistId", "year", "coverImageId", "createdAt", "updatedAt" FROM "Album";
DROP TABLE "Album";
ALTER TABLE "new_Album" RENAME TO "Album";
CREATE INDEX "Album_artistId_name_idx" ON "Album"("artistId", "name");
CREATE INDEX "Album_artistId_idx" ON "Album"("artistId");
CREATE UNIQUE INDEX "Album_artistId_name_key" ON "Album"("artistId", "name");
CREATE INDEX "Album_mergedIntoId_idx" ON "Album"("mergedIntoId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "TrackEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "title" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "albumId" TEXT,
    "genre" TEXT,
    "year" INTEGER,
    "trackNumber" INTEGER,
    "albumArtist" TEXT,
    "bpm" INTEGER,
    "label" TEXT,
    "isrc" TEXT,
    "releaseDate" DATETIME,
    "originalDate" DATETIME,
    "originalYear" INTEGER,
    "totalTracks" INTEGER,
    "totalDiscs" INTEGER,
    "lyrics" TEXT,
    CONSTRAINT "TrackEdit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackEdit_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtistEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artistId" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "website" TEXT,
    "genre" TEXT,
    "country" TEXT,
    CONSTRAINT "ArtistEdit_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArtistEdit_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlbumEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "albumId" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "name" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "year" INTEGER,
    "coverImageId" TEXT,
    CONSTRAINT "AlbumEdit_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlbumEdit_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrackEdit_trackId_editedAt_idx" ON "TrackEdit"("trackId", "editedAt");
CREATE INDEX "TrackEdit_editedBy_idx" ON "TrackEdit"("editedBy");

-- CreateIndex
CREATE INDEX "ArtistEdit_artistId_editedAt_idx" ON "ArtistEdit"("artistId", "editedAt");
CREATE INDEX "ArtistEdit_editedBy_idx" ON "ArtistEdit"("editedBy");

-- CreateIndex
CREATE INDEX "AlbumEdit_albumId_editedAt_idx" ON "AlbumEdit"("albumId", "editedAt");
CREATE INDEX "AlbumEdit_editedBy_idx" ON "AlbumEdit"("editedBy");

-- Recreate FTS triggers
-- Track triggers
CREATE TRIGGER tracks_fts_ai AFTER INSERT ON Track BEGIN
  INSERT INTO tracks_fts(track_id, title, artist_name, album_name)
  SELECT 
    t.id,
    t.title,
    a.name,
    COALESCE(alb.name, '')
  FROM Track t
  JOIN Artist a ON t.artistId = a.id
  LEFT JOIN Album alb ON t.albumId = alb.id
  WHERE t.id = NEW.id;
END;

CREATE TRIGGER tracks_fts_au AFTER UPDATE ON Track BEGIN
  DELETE FROM tracks_fts WHERE track_id = OLD.id;
  INSERT INTO tracks_fts(track_id, title, artist_name, album_name)
  SELECT 
    t.id,
    t.title,
    a.name,
    COALESCE(alb.name, '')
  FROM Track t
  JOIN Artist a ON t.artistId = a.id
  LEFT JOIN Album alb ON t.albumId = alb.id
  WHERE t.id = NEW.id;
END;

CREATE TRIGGER tracks_fts_ad AFTER DELETE ON Track BEGIN
  DELETE FROM tracks_fts WHERE track_id = OLD.id;
END;

-- Album triggers
CREATE TRIGGER albums_fts_ai AFTER INSERT ON Album BEGIN
  INSERT INTO albums_fts(album_id, name, artist_name)
  SELECT 
    alb.id,
    alb.name,
    a.name
  FROM Album alb
  JOIN Artist a ON alb.artistId = a.id
  WHERE alb.id = NEW.id;
END;

CREATE TRIGGER albums_fts_au AFTER UPDATE ON Album BEGIN
  DELETE FROM albums_fts WHERE album_id = OLD.id;
  INSERT INTO albums_fts(album_id, name, artist_name)
  SELECT 
    alb.id,
    alb.name,
    a.name
  FROM Album alb
  JOIN Artist a ON alb.artistId = a.id
  WHERE alb.id = NEW.id;
END;

CREATE TRIGGER albums_fts_ad AFTER DELETE ON Album BEGIN
  DELETE FROM albums_fts WHERE album_id = OLD.id;
END;

-- Artist triggers
CREATE TRIGGER artists_fts_ai AFTER INSERT ON Artist BEGIN
  INSERT INTO artists_fts(artist_id, name, genre)
  VALUES (NEW.id, NEW.name, COALESCE(NEW.genre, ''));
END;

CREATE TRIGGER artists_fts_au AFTER UPDATE ON Artist BEGIN
  DELETE FROM artists_fts WHERE artist_id = OLD.id;
  INSERT INTO artists_fts(artist_id, name, genre)
  VALUES (NEW.id, NEW.name, COALESCE(NEW.genre, ''));
END;

CREATE TRIGGER artists_fts_ad AFTER DELETE ON Artist BEGIN
  DELETE FROM artists_fts WHERE artist_id = OLD.id;
END;

-- Artist rename cascade trigger
CREATE TRIGGER artist_rename_fts_cascade AFTER UPDATE ON Artist
WHEN OLD.name != NEW.name
BEGIN
  -- Refresh tracks_fts for all tracks of the renamed artist
  DELETE FROM tracks_fts WHERE track_id IN (
    SELECT id FROM Track WHERE artistId = NEW.id
  );

  INSERT INTO tracks_fts(track_id, title, artist_name, album_name)
  SELECT
    t.id,
    t.title,
    a.name,
    COALESCE(alb.name, '')
  FROM Track t
  JOIN Artist a ON t.artistId = a.id
  LEFT JOIN Album alb ON t.albumId = alb.id
  WHERE t.artistId = NEW.id;

  -- Refresh albums_fts for all albums of the renamed artist
  DELETE FROM albums_fts WHERE album_id IN (
    SELECT id FROM Album WHERE artistId = NEW.id
  );

  INSERT INTO albums_fts(album_id, name, artist_name)
  SELECT
    alb.id,
    alb.name,
    a.name
  FROM Album alb
  JOIN Artist a ON alb.artistId = a.id
  WHERE alb.artistId = NEW.id;
END;

-- Backfill FTS tables with current data
DELETE FROM tracks_fts;
DELETE FROM albums_fts;
DELETE FROM artists_fts;

INSERT INTO tracks_fts(track_id, title, artist_name, album_name)
SELECT t.id, t.title, a.name, COALESCE(alb.name, '')
FROM Track t
JOIN Artist a ON t.artistId = a.id
LEFT JOIN Album alb ON t.albumId = alb.id;

INSERT INTO albums_fts(album_id, name, artist_name)
SELECT alb.id, alb.name, a.name
FROM Album alb
JOIN Artist a ON alb.artistId = a.id;

INSERT INTO artists_fts(artist_id, name, genre)
SELECT id, name, COALESCE(genre, '')
FROM Artist;
