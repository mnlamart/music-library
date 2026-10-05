/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";
import DuplicatesRoute from "./duplicates.tsx";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => ({
      state: "idle",
      data: undefined,
      submit: vi.fn(),
      formData: undefined,
    }),
  };
});

const exactGroup = {
  id: "abc123",
  type: "exact" as const,
  contentHash: "abc123",
  tracks: [
    {
      trackId: "t1",
      title: "Original Song",
      artist: "Ada",
      fileSize: 2048,
      contentHash: "abc123",
      fileName: "original.mp3",
      format: "mp3",
      audioFileId: "a1",
    },
    {
      trackId: "t2",
      title: "Copy Song",
      artist: "Ada",
      fileSize: 2048,
      contentHash: "abc123",
      fileName: "copy.mp3",
      format: "mp3",
      audioFileId: "a2",
    },
  ],
};

const similarGroup = {
  id: "similar:a:b",
  type: "similar" as const,
  contentHash: null,
  confidence: 0.9,
  tracks: [
    {
      trackId: "s1",
      title: "Take One",
      artist: "Bea",
      fileSize: 3000,
      contentHash: "h1",
      fileName: "one.mp3",
      format: "mp3",
      audioFileId: "a",
      confidence: 1,
    },
    {
      trackId: "s2",
      title: "Take Two",
      artist: "Bea",
      fileSize: 3100,
      contentHash: "h2",
      fileName: "two.mp3",
      format: "mp3",
      audioFileId: "b",
      confidence: 0.9,
    },
  ],
};

function renderDashboard(
  groups: Array<typeof exactGroup | typeof similarGroup>,
  path = "/music/admin/duplicates",
) {
  const filter = (new URL(path, "http://localhost").searchParams.get("filter") ?? "all") as
    | "all"
    | "exact"
    | "similar"
    | "intentional";
  const router = createMemoryRouter(
    [
      {
        path: "/music/admin/duplicates",
        element: (
          <DuplicatesRoute
            loaderData={{
              stats: {
                storageSaved: 2048,
                duplicateGroups: groups.length,
                totalDuplicates: groups.length,
              },
              groups,
              filter,
            }}
            params={{}}
            matches={[] as never}
          />
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

test("enables the similar-audio filter and shows group confidence", async () => {
  renderDashboard([exactGroup, similarGroup]);

  const similarButton = await screen.findByRole("button", { name: /similar audio/i });
  expect(similarButton).toBeEnabled();
  expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  expect(screen.getAllByText(/90% confidence/).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /keep both/i })).toHaveLength(2);
});

test("hides keep both when viewing intentional groups", async () => {
  renderDashboard([exactGroup], "/music/admin/duplicates?filter=intentional");

  expect(await screen.findByRole("button", { name: /intentional/i })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /keep both/i })).not.toBeInTheDocument();
});
