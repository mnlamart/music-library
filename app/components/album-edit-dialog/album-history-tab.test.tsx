/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { AlbumHistoryTab } from "./album-history-tab";

const previousSnapshot = {
  id: "edit-previous",
  editedAt: "2026-01-01T00:00:00.000Z",
  editedBy: { id: "user-1", username: "kody", name: "Kody" },
  comment: "Before the rename",
  changes: { name: { from: "Jour avant caviar", to: "Jour avant caviar Renamed" } },
};

test("offers restore for the previous album snapshot", async () => {
  const user = userEvent.setup();
  const onRestore = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AlbumHistoryTab albumId="album-1" onRestore={onRestore} />,
      },
      {
        path: "/api/metadata/albums/:albumId/history",
        loader: () => ({ history: [previousSnapshot] }),
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);

  await user.click(await screen.findByRole("button", { name: "Restore" }));
  await user.type(screen.getByLabelText(/^Comment/), "Put the earlier album back");
  await user.click(screen.getByRole("button", { name: "Submit" }));

  expect(onRestore).toHaveBeenCalledWith("edit-previous", "Put the earlier album back");
});
