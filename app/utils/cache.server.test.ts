import { afterEach, describe, expect, test } from "vitest";
import { getAllCacheKeys, lruCache, searchCacheKeys } from "./cache.server.ts";

const PREFIX = "cache-admin-limit-389";

function cacheEntry() {
  return {
    metadata: { createdTime: Date.now(), ttl: null as number | null },
    value: "limit-probe",
  };
}

const seeded: Array<string> = [];

function seed(key: string) {
  lruCache.set(key, cacheEntry());
  seeded.push(key);
}

afterEach(() => {
  for (const key of seeded) lruCache.delete(key);
  seeded.length = 0;
});

describe("cache admin key limit", () => {
  test("getAllCacheKeys caps the LRU list at the limit without deleting keys", async () => {
    const keys = [`${PREFIX}-a`, `${PREFIX}-b`, `${PREFIX}-c`];
    for (const key of keys) seed(key);

    const limited = await getAllCacheKeys(1);

    expect(limited.lru).toHaveLength(1);
    expect(limited.sqlite.length).toBeLessThanOrEqual(1);
    for (const key of keys) {
      expect(lruCache.get(key)?.value).toBe("limit-probe");
    }
  });

  test("searchCacheKeys caps matching LRU keys at the limit", async () => {
    seed(`${PREFIX}-a`);
    seed(`${PREFIX}-b`);
    // Most recently used, and it must not consume the limit ahead of matches.
    seed("unrelated-lru-key-389");

    const limited = await searchCacheKeys(PREFIX, 1);

    expect(limited.lru).toHaveLength(1);
    expect(limited.lru.every((key) => key.includes(PREFIX))).toBe(true);
    expect(limited.sqlite.length).toBeLessThanOrEqual(1);
    expect(lruCache.get(`${PREFIX}-a`)?.value).toBe("limit-probe");
    expect(lruCache.get(`${PREFIX}-b`)?.value).toBe("limit-probe");
    expect(lruCache.get("unrelated-lru-key-389")?.value).toBe("limit-probe");
  });
});
