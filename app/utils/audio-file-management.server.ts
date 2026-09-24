// @context7: crypto, Buffer
import { createHash } from "node:crypto";

/**
 * Calculate SHA-256 hash of audio buffer for deduplication
 * Same pattern as calculateImageHash for cover images
 */
export async function calculateAudioHash(buffer: Buffer): Promise<string> {
  return createHash("sha256").update(buffer).digest("hex");
}
