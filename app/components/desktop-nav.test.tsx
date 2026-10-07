/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { desktopNavItems } from "./app-navigation.ts";
import { DesktopNav } from "./desktop-nav.tsx";

test("desktop primary navigation lists listening destinations except search", () => {
  const router = createMemoryRouter([{ path: "/", element: <DesktopNav /> }], {
    initialEntries: ["/"],
  });

  render(<RouterProvider router={router} />);

  const nav = screen.getByRole("navigation", { name: /primary navigation/i });
  const links = screen.getAllByRole("link");

  expect(links.map((link) => link.getAttribute("href"))).toEqual(
    desktopNavItems.map((item) => item.to),
  );
  expect(nav.querySelector('a[href="/search"]')).toBeNull();
  expect(nav.className).toMatch(/\bhidden\b/);
  expect(nav.className).toMatch(/\bmd:flex\b/);
});
