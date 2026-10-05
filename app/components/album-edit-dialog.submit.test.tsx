/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test } from "vitest";
import { AlbumEditDialog, type Album } from "./album-edit-dialog";

const album: Album = {
  id: "album-1",
  name: "Abbey Road",
  artistId: "artist-1",
  year: 1969,
  coverImageId: null,
  coverImage: null,
  artist: { id: "artist-1", name: "The Beatles" },
};

const albumWithCover: Album = {
  ...album,
  coverImageId: "cover-old",
  coverImage: { objectKey: "images/albums/old.jpg" },
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

function renderDialog(current: Album) {
  let submission: Submission | null = null;

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AlbumEditDialog album={current} open onOpenChange={() => {}} />,
      },
      {
        path: "/api/images/upload",
        action: async () => ({
          success: true,
          image: {
            id: "cover-new",
            objectKey: "images/albums/album-1/new.png",
            width: 800,
            height: 800,
            isPrimary: false,
          },
        }),
      },
      {
        path: "/api/metadata/albums/:id/edit",
        action: async ({ request }) => {
          submission = await readSubmission(request);
          return { album: { id: current.id }, edit: { id: "edit-1" } };
        },
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);

  return {
    getSubmission: () => submission,
  };
}

test("cover upload enables save and submits the new CoverImage id", async () => {
  const user = userEvent.setup();
  const { getSubmission } = renderDialog(album);

  expect(screen.getByRole("button", { name: "Save Changes" }).hasAttribute("disabled")).toBe(true);

  await user.click(screen.getByRole("tab", { name: "Cover Art" }));
  const file = new File([new Uint8Array([137, 80, 78, 71])], "cover.png", {
    type: "image/png",
  });
  await user.upload(screen.getByLabelText(/choose image file/i), file);
  await user.click(screen.getByRole("tab", { name: "Metadata" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save Changes" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  await user.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() => {
    expect(getSubmission()).not.toBeNull();
  });

  expect(getSubmission()!.contentType).toContain("application/json");
  expect(getSubmission()!.body).toEqual({
    name: "Abbey Road",
    artistId: "artist-1",
    year: 1969,
    coverImageId: "cover-new",
    comment: "",
  });
});

test("a name change keeps the existing CoverImage id instead of the object key", async () => {
  const user = userEvent.setup();
  const { getSubmission } = renderDialog(albumWithCover);

  const name = screen.getByLabelText(/name/i);
  await user.clear(name);
  await user.type(name, "Abbey Road (Remastered)");
  await user.click(screen.getByRole("button", { name: "Save Changes" }));

  await waitFor(() => {
    expect(getSubmission()).not.toBeNull();
  });

  expect(getSubmission()!.body).toEqual({
    name: "Abbey Road (Remastered)",
    artistId: "artist-1",
    year: 1969,
    coverImageId: "cover-old",
    comment: "",
  });
});
