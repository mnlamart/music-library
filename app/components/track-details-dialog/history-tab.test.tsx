/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import { HistoryTab } from "./history-tab.tsx";

test("edit preview shows artist and album names instead of ids", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <HistoryTab trackId="track-1" onRestore={vi.fn()} />,
      },
      {
        path: "/api/metadata/tracks/:trackId/history",
        loader: () => ({
          history: [
            {
              id: "edit-1",
              editedAt: "2026-01-01T00:00:00.000Z",
              editedBy: { id: "user-1", username: "kody", name: "Kody" },
              comment: "Fixed the credit",
              changes: {
                artistId: { from: "artist-old", to: "artist-new" },
                albumId: { from: null, to: "album-new" },
              },
              labels: {
                artistId: { from: "Bill Evans", to: "Miles Davis" },
                albumId: { from: "(empty)", to: "Kind of Blue" },
              },
            },
          ],
        }),
      },
    ],
    { initialEntries: ["/"] },
  );

  render(<RouterProvider router={router} />);

  expect(await screen.findByText(/Bill Evans/)).toBeInTheDocument();
  expect(screen.getByText(/Miles Davis/)).toBeInTheDocument();
  expect(screen.getByText(/Kind of Blue/)).toBeInTheDocument();
  expect(screen.queryByText(/artist-old/)).not.toBeInTheDocument();
  expect(screen.queryByText(/artist-new/)).not.toBeInTheDocument();
  expect(screen.queryByText(/album-new/)).not.toBeInTheDocument();
});
