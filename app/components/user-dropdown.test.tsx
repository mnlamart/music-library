/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { accountMenuItems } from "./app-navigation.ts";
import { UserDropdown } from "./user-dropdown.tsx";

const currentUser = vi.hoisted(() => ({
  roles: [{ name: "user" }] as Array<{ name: string }>,
}));

vi.mock("#app/utils/user.ts", async () => {
  const actual = await vi.importActual<typeof import("#app/utils/user.ts")>("#app/utils/user.ts");
  return {
    ...actual,
    useUser: () => ({
      id: "user-1",
      name: "Kody",
      username: "kody",
      image: null,
      roles: currentUser.roles.map((role) => ({ ...role, permissions: [] })),
    }),
  };
});

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

async function openMenu() {
  const user = userEvent.setup();
  renderDropdown();
  await user.click(screen.getByRole("button", { name: /user menu/i }));
  return screen.findByRole("menu");
}

test("the account menu is personal links for every role", async () => {
  currentUser.roles = [{ name: "admin" }, { name: "curator" }, { name: "user" }];
  await openMenu();

  expect(screen.getByText("Account")).toBeInTheDocument();

  const profile = screen.getByRole("menuitem", { name: /profile/i });
  expect(profile).toHaveAttribute("href", "/users/kody");

  const links = screen.getAllByRole("menuitem").filter((item) => item.hasAttribute("href"));
  expect(links.map((item) => item.getAttribute("href"))).toEqual([
    "/users/kody",
    ...accountMenuItems.map((item) => item.to),
  ]);

  expect(screen.getByRole("menuitem", { name: /logout/i })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /my library/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /my playlists/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /^history$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /curator dashboard/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /admin overview/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /review queue/i })).not.toBeInTheDocument();
});

test("includes Party Room link for all viewports", async () => {
  currentUser.roles = [{ name: "user" }];
  await openMenu();

  const rooms = await screen.findByRole("menuitem", { name: /party room/i });
  expect(rooms.className).not.toMatch(/\bmax-md:hidden\b/);
  expect(rooms).toHaveAttribute("href", "/rooms");
});

test("includes My reports for every signed-in user", async () => {
  currentUser.roles = [{ name: "user" }];
  await openMenu();

  const reports = await screen.findByRole("menuitem", { name: /my reports/i });
  expect(reports).toHaveAttribute("href", "/reports");
  expect(reports.className).not.toMatch(/\bmax-md:hidden\b/);
});
