/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { adminNavSections } from "#app/features/admin/admin-nav.ts";
import { curatorMenuItems } from "./app-navigation.ts";
import { HeaderRoleMenus } from "./header-role-menus.tsx";

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

function renderMenus() {
  const router = createMemoryRouter([{ path: "/", element: <HeaderRoleMenus /> }], {
    initialEntries: ["/"],
  });
  render(<RouterProvider router={router} />);
}

test("a user sees neither curator tools nor the admin menu", () => {
  currentUser.roles = [{ name: "user" }];
  renderMenus();

  expect(screen.queryByRole("button", { name: /curator tools/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /admin menu/i })).not.toBeInTheDocument();
});

test("a curator gets curator tools and not the admin menu", async () => {
  currentUser.roles = [{ name: "curator" }, { name: "user" }];
  const user = userEvent.setup();
  renderMenus();

  expect(screen.queryByRole("button", { name: /admin menu/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /curator tools/i }));

  const links = screen.getAllByRole("menuitem").filter((item) => item.hasAttribute("href"));
  expect(links.map((item) => item.getAttribute("href"))).toEqual(
    curatorMenuItems.map((item) => item.to),
  );
  expect(screen.getByRole("menuitemcheckbox", { name: /selection mode/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /clear saved session/i })).toBeInTheDocument();
});

test("an admin gets curator tools and the full admin menu", async () => {
  currentUser.roles = [{ name: "admin" }, { name: "user" }];
  const user = userEvent.setup();
  renderMenus();

  expect(screen.getByRole("button", { name: /curator tools/i })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /admin menu/i }));

  expect(screen.getByRole("menuitem", { name: /admin overview/i })).toHaveAttribute(
    "href",
    "/admin",
  );
  for (const section of adminNavSections) {
    expect(screen.getByText(section.title)).toBeInTheDocument();
    for (const link of section.links) {
      expect(screen.getByRole("menuitem", { name: link.label })).toHaveAttribute("href", link.to);
    }
  }
});
