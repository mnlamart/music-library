/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { expect, test } from "vitest";
import GenresPage from "./genres.tsx";

test("genre name links to the library filtered by that genre", async () => {
  const App = createRoutesStub([
    {
      path: "/music/curator/genres",
      Component: GenresPage,
      loader: () => ({
        genres: [
          {
            id: "genre-jazz",
            name: "Jazz",
            trackCount: 2,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      HydrateFallback: () => <div>Loading...</div>,
    },
  ]);

  render(<App initialEntries={["/music/curator/genres"]} />);

  const link = await screen.findByRole("link", { name: "Jazz" });
  expect(link).toHaveAttribute("href", "/library?genre=genre-jazz");
  expect(screen.queryByRole("button", { name: "Jazz" })).not.toBeInTheDocument();
});
