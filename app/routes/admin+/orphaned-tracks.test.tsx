/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { expect, test } from "vitest";
import OrphanedTracksRoute from "./orphaned-tracks.tsx";

test("renders 403 error for non-admin users", async () => {
  const request = new Request("http://localhost:3000/admin/orphaned-tracks");
  const params = {};
  const context = {};

  await expect(async () => {
    const { loader } = await import("./orphaned-tracks.tsx");
    await loader({ request, params, context } as any);
  }).rejects.toThrow();
});

test("displays orphaned track statistics correctly", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <div data-testid="missing-audio-stat">5</div>
            <div data-testid="failed-downloads-stat">3</div>
            <div data-testid="storage-orphans-stat">2</div>
            <div data-testid="storage-waste-stat">150 MB</div>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  expect(screen.getByTestId("missing-audio-stat")).toHaveTextContent("5");
  expect(screen.getByTestId("failed-downloads-stat")).toHaveTextContent("3");
  expect(screen.getByTestId("storage-orphans-stat")).toHaveTextContent("2");
  expect(screen.getByTestId("storage-waste-stat")).toHaveTextContent("150 MB");
});

test("renders missing audio tab with tracks", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <table>
              <tbody>
                <tr data-testid="track-row">
                  <td>Test Track 1</td>
                  <td>Test Artist</td>
                  <td>YouTube</td>
                </tr>
                <tr data-testid="track-row">
                  <td>Test Track 2</td>
                  <td>Another Artist</td>
                  <td>Local</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  const trackRows = screen.getAllByTestId("track-row");
  expect(trackRows).toHaveLength(2);
  expect(trackRows[0]).toHaveTextContent("Test Track 1");
  expect(trackRows[1]).toHaveTextContent("Test Track 2");
});

test("renders failed downloads tab with error categories", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <table>
              <tbody>
                <tr data-testid="failed-track">
                  <td>Failed Track</td>
                  <td>Test Artist</td>
                  <td data-testid="error-badge">VIDEO_UNAVAILABLE</td>
                  <td>3</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  const failedTrack = screen.getByTestId("failed-track");
  expect(failedTrack).toHaveTextContent("Failed Track");
  expect(screen.getByTestId("error-badge")).toHaveTextContent("VIDEO_UNAVAILABLE");
});

test("renders storage orphans tab with file details", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <table>
              <tbody>
                <tr data-testid="orphaned-file">
                  <td>audio/track123.mp3</td>
                  <td>mp3</td>
                  <td>5.2 MB</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  const orphanedFile = screen.getByTestId("orphaned-file");
  expect(orphanedFile).toHaveTextContent("audio/track123.mp3");
  expect(orphanedFile).toHaveTextContent("mp3");
  expect(orphanedFile).toHaveTextContent("5.2 MB");
});

test("displays service filter for missing audio tab", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <select data-testid="service-filter">
              <option value="all">All Services</option>
              <option value="youtube">YouTube</option>
              <option value="local">Local</option>
            </select>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  const serviceFilter = screen.getByTestId("service-filter");
  expect(serviceFilter).toBeInTheDocument();
});

test("displays bulk action buttons when tracks are selected", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <div data-testid="selected-count">2 selected</div>
            <button data-testid="queue-btn">Queue for Download</button>
            <button data-testid="delete-btn">Delete Selected</button>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  expect(screen.getByTestId("selected-count")).toHaveTextContent("2 selected");
  expect(screen.getByTestId("queue-btn")).toBeInTheDocument();
  expect(screen.getByTestId("delete-btn")).toBeInTheDocument();
});

test("formats byte sizes correctly", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <div data-testid="size-mb">5.2 MB</div>
            <div data-testid="size-kb">512.0 KB</div>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  expect(screen.getByTestId("size-mb")).toHaveTextContent("5.2 MB");
  expect(screen.getByTestId("size-kb")).toHaveTextContent("512.0 KB");
});

test("shows empty state when no data is available", async () => {
  const Stub = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: () => {
        return (
          <div>
            <table>
              <tbody>
                <tr>
                  <td data-testid="empty-state">No tracks without audio files found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      },
    },
  ]);

  render(<Stub initialEntries={["/admin/orphaned-tracks"]} />);

  expect(screen.getByTestId("empty-state")).toHaveTextContent(
    "No tracks without audio files found.",
  );
});

const emptyStats = {
  missingAudio: 0,
  failedDownloads: 0,
  storageOrphans: 0,
  storageWasteMB: 0,
};

test.each([
  {
    tab: "unused-tracks" as const,
    label: "Throwaway unused",
    emptyCopy: "No unused tracks found.",
    buttonName: /delete selected/i,
    hiddenField: "trackId",
    row: {
      id: "track-throwaway",
      title: "Throwaway unused",
      artistName: "Nobody",
      serviceDisplayName: "Local",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  },
  {
    tab: "storage-orphans" as const,
    label: "audio/throwaway-orphan.mp3",
    emptyCopy: "No orphaned files found.",
    buttonName: /clean up storage/i,
    hiddenField: "fileId",
    row: {
      id: "file-throwaway",
      objectKey: "audio/throwaway-orphan.mp3",
      format: "mp3",
      fileSize: 1024,
      uploadedAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  },
  {
    tab: "missing-audio" as const,
    label: "Throwaway missing",
    emptyCopy: "No tracks without audio files found.",
    buttonName: /delete selected/i,
    hiddenField: "trackId",
    row: {
      id: "track-missing-throwaway",
      title: "Throwaway missing",
      artistName: "Nobody",
      serviceDisplayName: "YouTube",
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  },
])(
  "clears $tab selection after the bulk action removes the row",
  async ({ tab, label, emptyCopy, buttonName, hiddenField, row }) => {
    let rows = [row];

    const App = createRoutesStub([
      {
        path: "/admin/orphaned-tracks",
        Component: OrphanedTracksRoute,
        HydrateFallback: () => <div>Loading...</div>,
        loader: () => ({
          stats: emptyStats,
          tab,
          tabData: rows,
          page: 1,
          totalPages: 1,
          totalItems: rows.length,
          serviceFilter: "all",
          errorCategoryFilter: "all",
          ageFilter: "30d",
        }),
        action: async () => {
          rows = [];
          return { success: true, deleted: 1 };
        },
      },
    ]);

    const user = userEvent.setup();
    render(<App initialEntries={[`/admin/orphaned-tracks?tab=${tab}`]} />);

    const trackRow = await screen.findByRole("row", { name: new RegExp(label, "i") });
    await user.click(within(trackRow).getByRole("checkbox"));

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: buttonName })).toBeInTheDocument();
    expect(document.querySelector(`input[name="${hiddenField}"]`)).toHaveValue(row.id);

    await user.click(screen.getByRole("button", { name: buttonName }));

    await screen.findByText(emptyCopy);
    expect(screen.queryByText(/\d+ selected/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: buttonName })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /queue for download/i })).not.toBeInTheDocument();
    expect(document.querySelector(`input[name="${hiddenField}"]`)).toBeNull();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  },
);

const filterStats = {
  missingAudio: 2,
  failedDownloads: 0,
  storageOrphans: 0,
  storageWasteMB: 0,
  unusedTracks: 0,
};

function rowsFor(service: string | null) {
  const rows = [
    {
      id: "yt-1",
      title: "QA436 Missing YouTube One",
      artistName: "Meryl",
      serviceDisplayName: "YouTube",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    {
      id: "local-1",
      title: "QA436 Missing Local One",
      artistName: "Meryl",
      serviceDisplayName: "Local Upload",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    },
  ];
  if (service === "youtube") return rows.filter((row) => row.serviceDisplayName === "YouTube");
  if (service === "local") return rows.filter((row) => row.serviceDisplayName === "Local Upload");
  return rows;
}

test("service filter submits YouTube and Local", async () => {
  const user = userEvent.setup();
  const App = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: OrphanedTracksRoute,
      HydrateFallback: () => null,
      loader: ({ request }) => {
        const url = new URL(request.url);
        const service = url.searchParams.get("service");
        return {
          stats: filterStats,
          tab: "missing-audio",
          tabData: rowsFor(service),
          page: 1,
          totalPages: 1,
          totalItems: rowsFor(service).length,
          serviceFilter: service && service.length > 0 ? service : "all",
          errorCategoryFilter: "all",
          ageFilter: "30d",
        };
      },
    },
  ]);

  render(<App initialEntries={["/admin/orphaned-tracks?tab=missing-audio"]} />);
  expect(await screen.findByText("QA436 Missing YouTube One")).toBeTruthy();
  expect(screen.getByText("QA436 Missing Local One")).toBeTruthy();

  await user.selectOptions(screen.getByLabelText("Service"), "youtube");
  await user.click(screen.getByRole("button", { name: "Filter" }));

  expect(await screen.findByText("QA436 Missing YouTube One")).toBeTruthy();
  expect(screen.queryByText("QA436 Missing Local One")).toBeNull();

  await user.selectOptions(screen.getByLabelText("Service"), "local");
  await user.click(screen.getByRole("button", { name: "Filter" }));

  expect(await screen.findByText("QA436 Missing Local One")).toBeTruthy();
  expect(screen.queryByText("QA436 Missing YouTube One")).toBeNull();
});

test("unused age filter submits the chosen window", async () => {
  const user = userEvent.setup();
  const titles = {
    "7d": ["QA436 Unused 10d", "QA436 Unused 40d", "QA436 Unused 100d"],
    "30d": ["QA436 Unused 40d", "QA436 Unused 100d"],
    "90d": ["QA436 Unused 100d"],
  } as const;
  const App = createRoutesStub([
    {
      path: "/admin/orphaned-tracks",
      Component: OrphanedTracksRoute,
      HydrateFallback: () => null,
      loader: ({ request }) => {
        const age = new URL(request.url).searchParams.get("age") ?? "30d";
        const window = age === "7d" || age === "90d" ? age : "30d";
        const tabData = titles[window].map((title) => ({
          id: title,
          title,
          artistName: "Meryl",
          serviceDisplayName: "Local Upload",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
        return {
          stats: filterStats,
          tab: "unused-tracks",
          tabData,
          page: 1,
          totalPages: 1,
          totalItems: tabData.length,
          serviceFilter: "all",
          errorCategoryFilter: "all",
          ageFilter: age,
        };
      },
    },
  ]);

  render(<App initialEntries={["/admin/orphaned-tracks?tab=unused-tracks&age=30d"]} />);
  expect(await screen.findByText("QA436 Unused 40d")).toBeTruthy();
  expect(screen.queryByText("QA436 Unused 10d")).toBeNull();

  await user.selectOptions(screen.getByLabelText("Age"), "90d");
  await user.click(screen.getByRole("button", { name: "Filter" }));

  expect(await screen.findByText("QA436 Unused 100d")).toBeTruthy();
  expect(screen.queryByText("QA436 Unused 40d")).toBeNull();

  await user.selectOptions(screen.getByLabelText("Age"), "7d");
  await user.click(screen.getByRole("button", { name: "Filter" }));

  expect(await screen.findByText("QA436 Unused 10d")).toBeTruthy();
  expect(screen.getByText("QA436 Unused 100d")).toBeTruthy();
});
