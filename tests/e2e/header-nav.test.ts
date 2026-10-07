/**
 * Header chrome is split by role: listening navigation for everyone,
 * curator tools for curators and admins, and the admin menu for admins.
 */
import { expect } from "@playwright/test";
import { test } from "#tests/playwright-utils.ts";

test("desktop primary navigation shows listening links and not search", async ({ page, login }) => {
  await login();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: /primary navigation/i });
  await expect(nav.getByRole("link", { name: /home page/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /discover music/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /my music library/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /my playlists/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /listening history/i })).toBeVisible();
  await expect(nav.locator('a[href="/search"]')).toHaveCount(0);

  await nav.getByRole("link", { name: /my music library/i }).click();
  await expect(page).toHaveURL(/\/library/);
});

test("primary navigation is hidden on mobile, where the bottom nav is the listening nav", async ({
  page,
  login,
}) => {
  await login();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: /primary navigation/i })).toBeHidden();
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
});

test("a user account menu has no curator or admin tools", async ({ page, login }) => {
  await login();
  await page.goto("/");

  await expect(page.getByRole("button", { name: /curator tools/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /admin menu/i })).toHaveCount(0);

  await page.getByRole("button", { name: /user menu/i }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /profile/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /downloads/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /my reports/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /curator dashboard/i })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: /admin overview/i })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: /my library/i })).toHaveCount(0);
});

test("a curator opens curator tools and does not see the admin menu", async ({ page, login }) => {
  await login({ roles: ["curator", "user"] });
  await page.goto("/");

  await expect(page.getByRole("button", { name: /admin menu/i })).toHaveCount(0);
  await page.getByRole("button", { name: /curator tools/i }).click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /curator dashboard/i })).toHaveAttribute(
    "href",
    "/music/curator/dashboard",
  );
  await expect(menu.getByRole("menuitem", { name: /review queue/i })).toBeVisible();
  await expect(menu.getByRole("menuitemcheckbox", { name: /selection mode/i })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /clear saved session/i })).toBeVisible();
});

test("an admin opens curator tools and the sectioned admin menu", async ({
  page,
  loginAsAdmin,
}) => {
  await loginAsAdmin();
  await page.goto("/");

  await expect(page.getByRole("button", { name: /curator tools/i })).toBeVisible();
  await page.getByRole("button", { name: /admin menu/i }).click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /admin overview/i })).toHaveAttribute(
    "href",
    "/admin",
  );
  await expect(menu.getByText("System Health")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "YouTube Cookies" })).toHaveAttribute(
    "href",
    "/admin/youtube-cookies",
  );
  await expect(menu.getByRole("menuitem", { name: "Users" })).toHaveAttribute(
    "href",
    "/admin/users",
  );

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /user menu/i }).click();
  await expect(page.getByRole("menuitem", { name: /audio queue admin/i })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /admin users/i })).toHaveCount(0);
});
