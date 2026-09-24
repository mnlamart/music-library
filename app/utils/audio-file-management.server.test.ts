import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock fs/promises
const mockWriteFile = vi.fn();
const mockUnlink = vi.fn();
vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
}));

// Mock fpcalc
const mockFpcalc = vi.fn();
vi.mock("fpcalc", () => ({
  default: mockFpcalc,
}));

describe("calculateAudioHash", () => {
  it("calculates SHA-256 hash of audio buffer", async () => {
    const { calculateAudioHash } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    const hash = await calculateAudioHash(buffer);

    expect(hash).toBe("522272b26299fafc953e105f7f113422487ef7e4ddce23056532238b6ca29213");
  });

  it("produces different hashes for different buffers", async () => {
    const { calculateAudioHash } = await import("./audio-file-management.server");
    const buffer1 = Buffer.from("audio-data-1");
    const buffer2 = Buffer.from("audio-data-2");

    const hash1 = await calculateAudioHash(buffer1);
    const hash2 = await calculateAudioHash(buffer2);

    expect(hash1).not.toBe(hash2);
  });

  it("produces same hash for identical buffers", async () => {
    const { calculateAudioHash } = await import("./audio-file-management.server");
    const buffer1 = Buffer.from("same-audio-data");
    const buffer2 = Buffer.from("same-audio-data");

    const hash1 = await calculateAudioHash(buffer1);
    const hash2 = await calculateAudioHash(buffer2);

    expect(hash1).toBe(hash2);
  });
});

describe("generateAudioFingerprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("generates fingerprint for audio buffer", async () => {
    mockFpcalc.mockResolvedValue({
      fingerprint: "AQADtNE123test-fingerprint",
      duration: 180,
    });

    const { generateAudioFingerprint } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    const fingerprint = await generateAudioFingerprint(buffer);

    expect(fingerprint).toBe("AQADtNE123test-fingerprint");
    expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining("audio-"), buffer);
    expect(mockFpcalc).toHaveBeenCalledWith(expect.stringContaining("audio-"));
  });

  it("cleans up temporary file after successful fingerprint generation", async () => {
    mockFpcalc.mockResolvedValue({
      fingerprint: "AQADtestfp",
      duration: 180,
    });

    const { generateAudioFingerprint } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    await generateAudioFingerprint(buffer);

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining("audio-"));
  });

  it("returns null when fpcalc returns no fingerprint", async () => {
    const { consoleWarn } = await import("#tests/setup/setup-test-env.ts");
    consoleWarn.mockImplementation(() => {});

    mockFpcalc.mockResolvedValue({
      duration: 180,
      // No fingerprint field
    });

    const { generateAudioFingerprint } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    const result = await generateAudioFingerprint(buffer);

    expect(result).toBeNull();
  });

  it("returns null when fpcalc throws error", async () => {
    const { consoleError } = await import("#tests/setup/setup-test-env.ts");
    consoleError.mockImplementation(() => {});

    mockFpcalc.mockRejectedValue(new Error("fpcalc failed"));

    const { generateAudioFingerprint } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    const result = await generateAudioFingerprint(buffer);

    expect(result).toBeNull();
  });

  it("cleans up temporary file even when fpcalc fails", async () => {
    const { consoleError } = await import("#tests/setup/setup-test-env.ts");
    consoleError.mockImplementation(() => {});

    mockFpcalc.mockRejectedValue(new Error("fpcalc failed"));

    const { generateAudioFingerprint } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    await generateAudioFingerprint(buffer);

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining("audio-"));
  });

  it("handles cleanup errors gracefully", async () => {
    mockFpcalc.mockResolvedValue({
      fingerprint: "AQADtestfp",
      duration: 180,
    });
    mockUnlink.mockRejectedValue(new Error("cleanup failed"));

    const { generateAudioFingerprint } = await import("./audio-file-management.server");
    const buffer = Buffer.from("test-audio-data");
    const result = await generateAudioFingerprint(buffer);

    // Should still return the fingerprint despite cleanup error
    expect(result).toBe("AQADtestfp");
  });
});

describe("calculateFingerprintSimilarity", () => {
  it("returns 1 for identical fingerprints", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");
    const fp = "AQADtNE123test";

    expect(calculateFingerprintSimilarity(fp, fp)).toBe(1);
  });

  it("returns 0 for empty fingerprints", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");

    expect(calculateFingerprintSimilarity("", "")).toBe(0);
    expect(calculateFingerprintSimilarity("test", "")).toBe(0);
    expect(calculateFingerprintSimilarity("", "test")).toBe(0);
  });

  it("calculates similarity based on character matches", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");

    // 50% similarity (5 out of 10 characters match)
    const fp1 = "AQADtNE123";
    const fp2 = "AQADxxxxxZ";

    const similarity = calculateFingerprintSimilarity(fp1, fp2);
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it("handles fingerprints of different lengths", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");

    const fp1 = "AQAD123";
    const fp2 = "AQAD123456789";

    const similarity = calculateFingerprintSimilarity(fp1, fp2);
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it("normalizes by longer fingerprint length", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");

    const fp1 = "AQAD"; // 4 chars
    const fp2 = "AQAD123456"; // 10 chars

    // All 4 chars of fp1 match, but normalized by 10
    const similarity = calculateFingerprintSimilarity(fp1, fp2);
    expect(similarity).toBe(4 / 10);
  });

  it("returns 0 for completely different fingerprints", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");

    const fp1 = "AAAA";
    const fp2 = "BBBB";

    expect(calculateFingerprintSimilarity(fp1, fp2)).toBe(0);
  });

  it("is order-independent", async () => {
    const { calculateFingerprintSimilarity } = await import("./audio-file-management.server");

    const fp1 = "AQAD123";
    const fp2 = "AQAD456";

    const sim1 = calculateFingerprintSimilarity(fp1, fp2);
    const sim2 = calculateFingerprintSimilarity(fp2, fp1);

    expect(sim1).toBe(sim2);
  });
});
