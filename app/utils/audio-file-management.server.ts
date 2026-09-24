// @context7: crypto, Buffer, fpcalc
import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import fpcalc from "fpcalc";

/**
 * Calculate SHA-256 hash of audio buffer for deduplication
 * Same pattern as calculateImageHash for cover images
 */
export async function calculateAudioHash(buffer: Buffer): Promise<string> {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generate Chromaprint audio fingerprint for perceptual similarity detection
 * Returns the raw fingerprint string (e.g., "AQADtNE...")
 *
 * @param buffer - Audio file buffer
 * @returns Chromaprint fingerprint string, or null if generation fails
 */
export async function generateAudioFingerprint(buffer: Buffer): Promise<string | null> {
  let tempPath: string | undefined;

  try {
    // Create a temporary file for fpcalc to process
    const tempId = randomBytes(8).toString("hex");
    tempPath = join(tmpdir(), `audio-${tempId}.tmp`);

    await writeFile(tempPath, buffer);

    // Generate fingerprint using fpcalc (callback-based API)
    const result = await new Promise<{ fingerprint: string; duration: number } | null>(
      (resolve, reject) => {
        fpcalc(tempPath!, {}, (err: Error | null, result: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      },
    );

    if (!result || !result.fingerprint) {
      console.warn("fpcalc returned no fingerprint");
      return null;
    }

    return result.fingerprint;
  } catch (error) {
    console.error("Failed to generate audio fingerprint:", error);
    return null;
  } finally {
    // Clean up temporary file
    if (tempPath) {
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Calculate similarity between two Chromaprint fingerprints
 * Uses Hamming distance normalized by fingerprint length
 *
 * @param fp1 - First fingerprint string
 * @param fp2 - Second fingerprint string
 * @returns Similarity score between 0 and 1 (1 = identical)
 */
export function calculateFingerprintSimilarity(fp1: string, fp2: string): number {
  if (!fp1 || !fp2) return 0;
  if (fp1 === fp2) return 1;

  // Simple character-based comparison for Chromaprint base64 strings
  // In production, you might want to decode and use proper Hamming distance
  const len = Math.max(fp1.length, fp2.length);
  let matches = 0;

  for (let i = 0; i < Math.min(fp1.length, fp2.length); i++) {
    if (fp1[i] === fp2[i]) matches++;
  }

  return matches / len;
}
