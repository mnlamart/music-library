/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { ArtistHistoryTab } from "./artist-history-tab";

const previousSnapshot = {
  id: "edit-previous",
  editedAt: "2026-01-01T00:00:00.000Z",
  editedBy: { id: "user-1", username: "kody", name: "Kody" },
  comment: "Before the rename",
  changes: { name: { from: "Meryl", to: "Meryl Checked" } },
};

test("offers restore for the previous artist snapshot", async () => {
  const user = userEvent.setup();
  const onRestore = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <ArtistHistoryTab artistId="artist-1" onRestore={onRestore} />,
      },
      {
        path: "/api/metadata/artists/:artistId/history",
        loader: () => ({ history: [previousSnapshot] }),
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);

  await user.click(await screen.findByRole("button", { name: "Restore" }));
  await user.type(screen.getByLabelText(/^Comment/), "Put the earlier name back");
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(onRestore).toHaveBeenCalledWith("edit-previous", "Put the earlier name back");
});
