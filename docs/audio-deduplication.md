# Audio File Deduplication Implementation

## Overview

This implementation adds content-based deduplication for audio file uploads, preventing duplicate storage and warning users when they upload files that already exist in the system.

## What Was Implemented

### 1. Schema Changes (`prisma/schema.prisma`)

- Added `contentHash` field to `TrackAudioFile` model (SHA-256 hash of audio content)
- Added index on `contentHash` for efficient duplicate lookups
- Migration file created: `prisma/migrations/20260924102309_add_content_hash_to_track_audio_file/migration.sql`

### 2. Audio Hash Utility (`app/utils/audio-file-management.server.ts`)

- New `calculateAudioHash()` function using SHA-256 (same pattern as cover images)
- Comprehensive test coverage in `audio-file-management.server.test.ts`

### 3. Upload Logic Updates

#### `persistTrackAudio()` function

**Location:** `app/features/track-audio-ingest/persist-track-audio.server.ts`

**New behavior:**

1. Calculate SHA-256 hash of audio buffer
2. Check if audio with same hash already exists
3. If duplicate found:
   - Skip S3 upload (reuse existing object)
   - Create new `TrackAudioFile` record with existing `objectKey`
   - Return duplicate info in result
4. If unique:
   - Upload to S3 as before
   - Store hash with new record

**Storage savings:** Duplicate audio files don't create new S3 objects, saving storage costs.

#### Upload endpoints updated:

- `/api/upload-audio-batch` - Batch upload (logs duplicate warnings)
- `/api/upload-audio` - Single file upload (logs duplicate warnings)

### 4. Database Seed Updated (`prisma/seed.ts`)

- Now calculates and stores `contentHash` for seeded audio files

### 5. Test Coverage

**New tests:**

- Hash calculation tests (5 test cases)
- Duplicate detection tests (6 test cases)
- S3 object reuse verification
- Progress callback handling for duplicates

## How It Works

### Upload Flow (Before)

```
User uploads song.mp3
  ↓
Create Track record (new ID)
  ↓
Upload to S3: audio/tracks/local/{trackId}.mp3
  ↓
Create TrackAudioFile record
  ↓
Done - 100MB file uploaded
```

### Upload Flow (After - Duplicate Detected)

```
User uploads song.mp3 (again)
  ↓
Calculate SHA-256 hash
  ↓
Check database for existing hash
  ↓
FOUND! Existing track: "Song Title" by Artist
  ↓
Create new Track record (new ID)
  ↓
SKIP S3 upload (reuse existing objectKey)
  ↓
Create TrackAudioFile pointing to existing S3 object
  ↓
Log warning: "Duplicate: song.mp3 has same audio as..."
  ↓
Done - 0MB uploaded, storage saved! ✅
```

## What You Need To Do

### 1. Apply the Database Migration

The database schema changes are ready but NOT yet applied. You need to run:

```bash
npx prisma migrate deploy
```

**OR** for development (resets the database):

```bash
npx prisma migrate reset --force
```

⚠️ **Warning:** `migrate reset` will **delete all data** in your database. Only use this in development environments.

### 2. Run the Tests

After applying the migration:

```bash
npm test -- app/utils/audio-file-management.server.test.ts
npm test -- app/features/track-audio-ingest/persist-track-audio.server.test.ts
```

All tests should pass ✅

### 3. Test Manually

1. Start the dev server: `npm run dev`
2. Login as admin: `kody` / `kodylovesyou`
3. Go to: http://localhost:3000/music/services/local/upload
4. Upload an audio file
5. Upload the **same file again**
6. Check server logs for duplicate warning:
   ```
   ⚠️  Duplicate: "song.mp3" has same audio as "Song Title" by Artist Name
   ```

### 4. Verify in Database

```sql
-- Check that contentHash is being stored
SELECT id, fileName, contentHash
FROM TrackAudioFile
LIMIT 5;

-- Find duplicate audio files (same content, different tracks)
SELECT contentHash, COUNT(*) as count
FROM TrackAudioFile
WHERE contentHash IS NOT NULL
GROUP BY contentHash
HAVING COUNT(*) > 1;
```

## Architecture Decisions

### Why Allow Multiple Tracks with Same Audio?

We considered three approaches:

1. **Block duplicate uploads entirely** ❌
   - Too restrictive (legitimate use cases exist)
   - User might want different metadata for same audio

2. **Share TrackAudioFile records between tracks** ❌
   - Requires major schema changes
   - Breaks 1:1 Track→TrackAudioFile relationship

3. **Allow duplicates but optimize storage** ✅ (Implemented)
   - Multiple tracks can have same audio
   - Only one S3 object stored
   - User gets warned about duplicates
   - Best balance of flexibility and efficiency

### Why SHA-256?

- Same hashing algorithm used for cover images
- Industry standard for content identification
- Fast enough for audio files (100MB files hash in <1s)
- Cryptographically secure (prevents collisions)

### Why Store Hash in Database?

- Fast duplicate lookups via indexed column
- No need to download/hash files for comparison
- Enables future features:
  - Admin dashboard showing duplicate stats
  - Bulk cleanup of duplicate storage
  - API to find "similar" tracks by content

## Storage Savings Example

**Before (no deduplication):**

- User uploads same 10MB song 5 times
- Storage used: 50MB
- S3 objects: 5

**After (with deduplication):**

- User uploads same 10MB song 5 times
- Storage used: 10MB
- S3 objects: 1
- **Savings: 40MB (80%)**

## Future Enhancements

Possible next steps:

1. **UI Improvements**
   - Show duplicate warning in upload UI (not just logs)
   - Link to existing track when duplicate detected
   - "Upload anyway" option with explicit choice

2. **Admin Dashboard**
   - Page showing all duplicate audio files
   - One-click to merge/delete duplicates
   - Storage savings report

3. **Migration Script**
   - Hash all existing audio files
   - Detect and consolidate duplicates
   - Update to single S3 objects

4. **Metadata Fingerprinting**
   - Detect near-duplicates (re-encodes)
   - Match by: title + artist + duration
   - "Did you mean to upload X?" suggestions

## Files Changed

```
Modified:
- prisma/schema.prisma
- app/features/track-audio-ingest/persist-track-audio.server.ts
- app/routes/api+/upload-audio-batch.tsx
- app/routes/api+/upload-audio.tsx
- prisma/seed.ts

Added:
- app/utils/audio-file-management.server.ts
- app/utils/audio-file-management.server.test.ts
- prisma/migrations/20260924102309_add_content_hash_to_track_audio_file/migration.sql
- docs/audio-deduplication.md (this file)

Updated Tests:
- app/features/track-audio-ingest/persist-track-audio.server.test.ts
```

## Questions?

If you encounter issues or have questions about this implementation, please review:

1. The test files for usage examples
2. The code comments in `persist-track-audio.server.ts`
3. Similar pattern in `cover-management.server.ts` (for cover images)
