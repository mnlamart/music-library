/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import AlbumRoute from "./albums.$albumId.tsx";

type MockUser = {
  id: string;
  roles: Array<{
    name: string;
    permissions: Array<{ action: string; entity: string; access: string }>;
  }>;
};

const userState = vi.hoisted(() => ({
  current: undefined as MockUser | null | undefined,
}));

vi.mock("#app/utils/user.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#app/utils/user.ts")>();
  return {
    ...actual,
    useOptionalUser: () => userState.current,
  };
});

vi.mock("#app/components/album-edit-dialog.tsx", () => ({
  AlbumEditDialog: () => null,
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const loaderData = {
  album: {
    id: "album-1",
    name: "Flagged Album",
    year: 2020,
    createdAt: new Date("2024-01-01"),
    artist: { id: "artist-1", name: "Album Artist" },
    coverImage: null,
    tracks: [],
  },
  playlists: [],
};

function userWith(role: string, canEdit: boolean): MockUser {
  return {
    id: `${role}-1`,
    roles: [
      {
        name: role,
        permissions: canEdit ? [{ action: "update", entity: "album", access: "any" }] : [],
      },
    ],
  };
}

function renderAlbum() {
  const router = createMemoryRouter(
    [
      {
        path: "/albums/:albumId",
        element: (
          <AlbumRoute
            loaderData={loaderData as never}
            params={{ albumId: "album-1" }}
            matches={[] as never}
          />
        ),
      },
    ],
    { initialEntries: ["/albums/album-1"] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  userState.current = undefined;
});

test("shows Flag for review next to Edit Album for curators", async () => {
  userState.current = userWith("curator", true);
  const user = userEvent.setup();
  renderAlbum();

  expect(screen.getByRole("button", { name: /edit album/i })).toBeDefined();
  await user.click(screen.getByRole("button", { name: /flag for review/i }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Flag for Review" })).toBeDefined();
  expect(within(dialog).getByText(/Flagged Album/)).toBeDefined();
});

test("shows Flag for review for admins", () => {
  userState.current = userWith("admin", true);
  renderAlbum();

  expect(screen.getByRole("button", { name: /edit album/i })).toBeDefined();
  expect(screen.getByRole("button", { name: /flag for review/i })).toBeDefined();
});

test("hides Flag for review from listeners who can edit", () => {
  userState.current = userWith("user", true);
  renderAlbum();

  expect(screen.getByRole("button", { name: /edit album/i })).toBeDefined();
  expect(screen.queryByRole("button", { name: /flag for review/i })).toBeNull();
});

test("hides Flag for review from listeners", () => {
  userState.current = userWith("user", false);
  renderAlbum();

  expect(screen.queryByRole("button", { name: /edit album/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /flag for review/i })).toBeNull();
});
