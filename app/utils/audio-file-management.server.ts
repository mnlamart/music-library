// @context7: crypto, Buffer, fpcalc
import { createHash, randomBytes } from "node:crypto";
import childProcess from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

type FpcalcResult = { fingerprint?: string; duration?: number } | null;
type FpcalcFn = (
  filePath: string,
  options: Record<string, unknown>,
  callback: (err: Error | null, result: FpcalcResult) => void,
) => void;

type SpawnErrorSink = {
  onError: (error: Error) => void;
};

/**
 * Set only for the synchronous `fpcalc()` call. The patched spawn reads it
 * before returning, so the async `error` event still reaches this call.
 */
let activeSpawnErrorSink: SpawnErrorSink | null = null;

const spawnGuardFlag = Symbol.for("app.fpcalcSpawnGuard");

type GuardedSpawn = typeof childProcess.spawn & { [spawnGuardFlag]?: boolean };

/**
 * The fpcalc package calls `spawn("fpcalc", args)` and never listens for the
 * child `error` event. A missing binary then throws `spawn fpcalc ENOENT`
 * with no `uncaughtException` handler, which exits the process. Attach the
 * listener on this spawn only; other commands are unchanged.
 */
function installFpcalcSpawnGuard(): void {
  const current = childProcess.spawn as GuardedSpawn;
  if (current[spawnGuardFlag]) return;

  const originalSpawn = current;
  const guarded: GuardedSpawn = function spawnWithFpcalcErrorHandler(
    this: unknown,
    ...spawnArgs: unknown[]
  ) {
    const child = Reflect.apply(originalSpawn, this, spawnArgs) as ReturnType<typeof originalSpawn>;
    const command = spawnArgs[0];
    if (command === "fpcalc") {
      const sink = activeSpawnErrorSink;
      child.on("error", (error: Error) => {
        sink?.onError(error);
      });
    }
    return child;
  } as GuardedSpawn;
  guarded[spawnGuardFlag] = true;
  childProcess.spawn = guarded;
}

let fpcalcPromise: Promise<FpcalcFn> | null = null;

function getFpcalc(): Promise<FpcalcFn> {
  installFpcalcSpawnGuard();
  if (!fpcalcPromise) {
    fpcalcPromise = import("fpcalc").then((mod) => {
      const loaded = mod as { default?: FpcalcFn };
      return loaded.default ?? (mod as unknown as FpcalcFn);
    });
  }
  return fpcalcPromise;
}

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

    const fpcalc = await getFpcalc();
    // Generate fingerprint using fpcalc (callback-based API)
    const result = await new Promise<FpcalcResult>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const succeed = (value: FpcalcResult) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      activeSpawnErrorSink = { onError: fail };
      try {
        fpcalc(tempPath!, {}, (err: Error | null, fpResult: FpcalcResult) => {
          if (err) fail(err);
          else succeed(fpResult);
        });
      } finally {
        // spawn() already captured the sink for this call.
        activeSpawnErrorSink = null;
      }
    });

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
