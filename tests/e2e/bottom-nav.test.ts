/**
 * E2E tests for bottom navigation bar
 */

import { test, expect } from "#tests/playwright-utils.ts";

/**
 * Helper: dismiss the "Install app" banner if visible.
 */
async function dismissInstallBanner(page: import("@playwright/test").Page) {
  const installBanner = page.getByRole("region", { name: "Install app" });
  if (await installBanner.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Not now" }).click({ force: true });
  }
}

test.describe("Bottom Navigation", () => {
  test("bottom nav is visible with 5 tabs", { tag: "@smoke" }, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const bottomNav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(bottomNav).toBeVisible();

    // 5 tabs: Home, Search, My Library, My Playlists, History
    const tabs = bottomNav.getByRole("listitem");
    await expect(tabs).toHaveCount(5);

    // Check each tab label
    await expect(bottomNav.getByText("Home")).toBeVisible();
    await expect(bottomNav.getByText("Search")).toBeVisible();
    await expect(bottomNav.getByText("My Library")).toBeVisible();
    await expect(bottomNav.getByText("My Playlists")).toBeVisible();
    await expect(bottomNav.getByText("History")).toBeVisible();
  });

  test("home tab is active on homepage", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const bottomNav = page.getByRole("navigation", { name: /main navigation/i });
    const homeLink = bottomNav.getByRole("link", { name: /home/i });
    await expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  test("search tab is active on search page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/search");

    const bottomNav = page.getByRole("navigation", { name: /main navigation/i });
    const searchLink = bottomNav.getByRole("link", { name: /search/i });
    await expect(searchLink).toHaveAttribute("aria-current", "page");
  });

  test("clicking tabs navigates to correct pages", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await dismissInstallBanner(page);

    const bottomNav = page.getByRole("navigation", { name: /main navigation/i });

    // Navigate to Search
    await bottomNav.getByRole("link", { name: /search/i }).click();
    await expect(page).toHaveURL(/\/search/);
    await expect(bottomNav.getByRole("link", { name: /search/i })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Dismiss search overlay via back arrow (search sits above bottom nav at z-52)
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page).not.toHaveURL(/\/search/);

    // Navigate back to Home
    await bottomNav.getByRole("link", { name: /^home$/i }).click();
    await expect(page).toHaveURL(/\/(\?|$)/);
    await expect(bottomNav.getByRole("link", { name: /home/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("bottom nav is visible on authenticated pages", async ({ page, loginAsAdmin }) => {
    await loginAsAdmin();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const bottomNav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(bottomNav).toBeVisible();
  });

  test("search bar is not in the header", { tag: "@smoke" }, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const header = page.getByRole("banner");
    // The search bar (searchbox) should NOT be in the header
    await expect(header.getByRole("searchbox")).not.toBeVisible();
  });

  test("bottom nav stays fixed to the viewport while scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await dismissInstallBanner(page);

    // overflow-x: hidden on <html> creates a scroll container that re-anchors
    // position:fixed chrome to the document (especially on mobile WebKit).
    // clip clips horizontal overflow without that containing-block side effect.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflowX))
      .toBe("clip");

    const bottomNav = page.getByRole("navigation", { name: /main navigation/i });
    await expect(bottomNav).toBeVisible();

    const distanceFromViewportBottom = async () =>
      page.evaluate(
        (nav) => {
          const rect = (nav as HTMLElement).getBoundingClientRect();
          return Math.abs(window.innerHeight - rect.bottom);
        },
        await bottomNav.elementHandle(),
      );

    expect(await distanceFromViewportBottom()).toBeLessThan(2);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    expect(await distanceFromViewportBottom()).toBeLessThan(2);
  });
});
