import { afterEach, describe, expect, test } from "vitest";
import { cache, lruCache, searchCacheKeys } from "./cache.server.ts";

const keys = {
  plain: "cache-search-plain",
  underscore: "cache-search-under_score",
  percent: "cache-search-per%cent",
  both: "cache-search-mix_%ed",
} as const;

const allKeys = Object.values(keys);

function entry() {
  return {
    metadata: { createdTime: Date.now(), ttl: 60_000 },
    value: { probe: true },
  };
}

async function seed() {
  for (const key of allKeys) {
    const value = entry();
    await cache.set(key, value);
    lruCache.set(key, value);
  }
}

afterEach(async () => {
  for (const key of allKeys) {
    await cache.delete(key);
    lruCache.delete(key);
  }
});

describe("searchCacheKeys", () => {
  test("treats _ and % as literal characters in SQLite and LRU", async () => {
    await seed();

    const underscore = await searchCacheKeys("_", 10_000);
    expect(underscore.sqlite).toEqual(expect.arrayContaining([keys.underscore, keys.both]));
    expect(underscore.sqlite).not.toContain(keys.plain);
    expect(underscore.sqlite).not.toContain(keys.percent);
    expect(underscore.sqlite.every((key) => key.includes("_"))).toBe(true);
    expect(underscore.lru).toEqual(expect.arrayContaining([keys.underscore, keys.both]));
    expect(underscore.lru).not.toContain(keys.plain);
    expect(underscore.lru).not.toContain(keys.percent);
    expect(underscore.lru.every((key) => key.includes("_"))).toBe(true);

    const percent = await searchCacheKeys("%", 10_000);
    expect(percent.sqlite).toEqual(expect.arrayContaining([keys.percent, keys.both]));
    expect(percent.sqlite).not.toContain(keys.plain);
    expect(percent.sqlite).not.toContain(keys.underscore);
    expect(percent.sqlite.every((key) => key.includes("%"))).toBe(true);
    expect(percent.lru).toEqual(expect.arrayContaining([keys.percent, keys.both]));
    expect(percent.lru).not.toContain(keys.plain);
    expect(percent.lru.every((key) => key.includes("%"))).toBe(true);

    const literal = await searchCacheKeys("cache-search-plain", 10_000);
    expect(literal.sqlite).toContain(keys.plain);
    expect(literal.sqlite).not.toContain(keys.underscore);
    expect(literal.lru).toContain(keys.plain);
    expect(literal.lru).not.toContain(keys.underscore);
  });
});
