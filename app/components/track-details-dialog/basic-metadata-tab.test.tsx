/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { type TrackDetails } from "../track-details-dialog";
import { BasicMetadataTab } from "./basic-metadata-tab";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => ({
      state: "idle" as const,
      data: undefined,
      load: vi.fn(),
      submit: vi.fn(),
    }),
  };
});

const track: TrackDetails = {
  id: "track-coca",
  title: "Coca-Cola Mentos",
  artist: { id: "artist-meryl", name: "Meryl" },
  albumRecord: { id: "album-ozoror", name: "Ozoror" },
  duration: 180,
  createdAt: "2023-01-01T00:00:00.000Z",
  releaseDate: null,
  originalDate: null,
  coverImage: null,
  service: null,
  serviceUrl: null,
  genre: null,
  genres: [],
  year: 2023,
  trackNumber: null,
  albumArtist: null,
  bpm: null,
  label: null,
  isrc: null,
  originalYear: null,
  totalTracks: null,
  totalDiscs: null,
  lyrics: null,
};

function renderTab(onSave = vi.fn()) {
  render(<BasicMetadataTab track={track} onSave={onSave} />);
  return onSave;
}

test("shows the track artist name in the required Artist field", () => {
  renderTab();

  expect(screen.getByRole("textbox", { name: /artist/i })).toHaveValue("Meryl");
  expect(screen.getByRole("textbox", { name: /^title/i })).toHaveValue("Coca-Cola Mentos");
  expect(screen.getByRole("textbox", { name: /album/i })).toHaveValue("Ozoror");
  expect(screen.getByRole("spinbutton", { name: /year/i })).toHaveValue(2023);
});

test("a title-only save keeps the existing artist id", async () => {
  const user = userEvent.setup();
  const onSave = renderTab();

  await user.type(screen.getByRole("textbox", { name: /^title/i }), "!");
  await user.click(screen.getByRole("button", { name: /save changes/i }));

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Coca-Cola Mentos!",
      artistId: "artist-meryl",
    }),
  );
});

test("saving after the user clears the artist requires an artist", async () => {
  const user = userEvent.setup();
  const onSave = renderTab();

  await user.clear(screen.getByRole("textbox", { name: /artist/i }));
  await user.type(screen.getByRole("textbox", { name: /^title/i }), "!");
  await user.click(screen.getByRole("button", { name: /save changes/i }));

  expect(screen.getByText("Artist is required")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});
