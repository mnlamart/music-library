import { expect, test } from "vitest";
import { adminNavSections } from "#app/features/admin/admin-nav.ts";
import {
  accountMenuItems,
  curatorMenuItems,
  desktopNavItems,
  headerMenusFor,
  listeningNavItems,
} from "./app-navigation.ts";

test("listening navigation is the same for every role", () => {
  expect(listeningNavItems.map((item) => item.to)).toEqual([
    "/",
    "/discover",
    "/search",
    "/library",
    "/playlists",
    "/history",
  ]);
});

test("desktop navigation leaves search to the header search field", () => {
  expect(desktopNavItems.map((item) => item.to)).toEqual([
    "/",
    "/discover",
    "/library",
    "/playlists",
    "/history",
  ]);
});

test("the account menu stays personal and does not repeat primary or role links", () => {
  const destinations = accountMenuItems.map((item) => item.to);

  expect(destinations).toEqual(["/downloads", "/reports", "/rooms", "/music/services"]);

  for (const item of [...listeningNavItems, ...curatorMenuItems]) {
    expect(destinations).not.toContain(item.to);
  }
  for (const section of adminNavSections) {
    for (const link of section.links) {
      expect(destinations).not.toContain(link.to);
    }
  }
});

test("curator tools are for curators and admins", () => {
  expect(headerMenusFor([{ name: "user" }]).curator).toEqual([]);
  expect(headerMenusFor([{ name: "curator" }]).curator).toEqual(curatorMenuItems);
  expect(headerMenusFor([{ name: "admin" }]).curator).toEqual(curatorMenuItems);
  expect(curatorMenuItems.map((item) => item.to)).toEqual([
    "/music/curator/dashboard",
    "/music/curator/duplicates",
    "/music/curator/genres",
    "/music/curator/queue",
  ]);
});

test("the admin menu matches the admin overview and is admin-only", () => {
  expect(headerMenusFor([{ name: "user" }]).admin).toEqual([]);
  expect(headerMenusFor([{ name: "curator" }]).admin).toEqual([]);
  expect(headerMenusFor([{ name: "admin" }, { name: "user" }]).admin).toEqual(adminNavSections);
});
