/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { UserDropdown } from "./user-dropdown.tsx";

vi.mock("#app/utils/user.ts", () => ({
  useUser: () => ({
    id: "user-1",
    name: "Kody",
    username: "kody",
    image: null,
    roles: [{ name: "user", permissions: [] }],
  }),
  userHasRole: () => false,
}));

function renderDropdown() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <UserDropdown />,
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);
}

test("hides library, playlists, and history menu items on mobile (md+ only)", async () => {
  const user = userEvent.setup();
  renderDropdown();

  await user.click(screen.getByRole("button", { name: /user menu/i }));

  const library = await screen.findByRole("menuitem", { name: /my library/i });
  const playlists = screen.getByRole("menuitem", { name: /my playlists/i });
  const history = screen.getByRole("menuitem", { name: /history/i });

  expect(library.className).toMatch(/\bmax-md:hidden\b/);
  expect(playlists.className).toMatch(/\bmax-md:hidden\b/);
  expect(history.className).toMatch(/\bmax-md:hidden\b/);
});

test("keeps profile and downloads visible on all viewports", async () => {
  const user = userEvent.setup();
  renderDropdown();

  await user.click(screen.getByRole("button", { name: /user menu/i }));

  const profile = await screen.findByRole("menuitem", { name: /profile/i });
  const downloads = screen.getByRole("menuitem", { name: /downloads/i });
  const services = screen.getByRole("menuitem", { name: /connected services/i });

  expect(profile.className).not.toMatch(/\bmax-md:hidden\b/);
  expect(downloads.className).not.toMatch(/\bmax-md:hidden\b/);
  expect(services.className).not.toMatch(/\bmax-md:hidden\b/);
});
