/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { ArtistEditDialog, type Artist } from "./artist-edit-dialog";

const artist: Artist = {
  id: "artist-1",
  name: "Meryl",
  bio: null,
  genre: null,
  country: null,
  imageUrl: null,
  website: null,
};

type Submission = {
  contentType: string | null;
  body: unknown;
};

async function readSubmission(request: Request): Promise<Submission> {
  const contentType = request.headers.get("content-type");
  const raw = await request.text();
  try {
    return { contentType, body: JSON.parse(raw) as unknown };
  } catch {
    return { contentType, body: raw };
  }
}

test("saves name, genre, country, and website", async () => {
  const user = userEvent.setup();
  let submission: Submission | null = null;

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <ArtistEditDialog artist={artist} open onOpenChange={() => {}} currentUserId="user-1" />
        ),
      },
      {
        path: "/api/metadata/artists/:id/edit",
        action: async ({ request }) => {
          submission = await readSubmission(request);
          return { artist: { id: artist.id }, edit: { id: "edit-1" } };
        },
      },
      {
        path: "/api/curator/notes",
        loader: () => ({ notes: [] }),
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);

  await user.clear(screen.getByLabelText(/^Name/));
  await user.type(screen.getByLabelText(/^Name/), "Meryl Checked");
  await user.type(screen.getByLabelText(/^Genre/), "Chamber Folk");
  await user.type(screen.getByLabelText(/^Country/), "Canada");
  await user.type(screen.getByLabelText(/^Website/), "https://example.com/meryl");
  await user.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() => {
    expect(submission).not.toBeNull();
  });

  expect(submission!.body).toEqual({
    name: "Meryl Checked",
    bio: null,
    genre: "Chamber Folk",
    country: "Canada",
    imageUrl: null,
    website: "https://example.com/meryl",
    comment: "",
  });
});

test("shows artist notes in the editor", async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <ArtistEditDialog artist={artist} open onOpenChange={() => {}} currentUserId="user-1" />
        ),
      },
      {
        path: "/api/curator/notes",
        loader: () => ({ notes: [] }),
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);

  await user.click(screen.getByRole("tab", { name: "Notes" }));
  expect(await screen.findByLabelText("Add a note")).toBeDefined();
});
