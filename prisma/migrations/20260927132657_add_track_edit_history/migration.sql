-- CreateTable
CREATE TABLE "TrackEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
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
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackEdit_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrackEdit_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrackEdit_trackId_editedAt_idx" ON "TrackEdit"("trackId", "editedAt");

-- CreateIndex
CREATE INDEX "TrackEdit_editedBy_idx" ON "TrackEdit"("editedBy");
